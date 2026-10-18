import { assignNotes, depositsFor, type JobNote, type UnitDeposit } from "./amounts.js";
import {
  STEPS,
  isTerminal,
  reservedNotes,
  type AttentionCode,
  type Job,
  type JobKind,
  type JobStep,
  type JsonObject,
  type PrivacyStatus,
  type WaitReason,
  type WorkItem,
} from "./model.js";

/**
 * Background runner for one-step actions. It owns the job list, persists after every transition and
 * before every side effect, and can be thrown away at any moment: a new runner over the same store
 * resumes each job from its stored step. Notes are reserved per job (never shared between jobs), and
 * a submission interrupted between "sent" and "recorded" is resolved through `JobEnv.recover`, not by
 * blindly sending again.
 */

/** Thrown by a `JobEnv` method when the user has to decide; nothing irreversible happened in that call. */
export class JobAttentionError extends Error {
  constructor(
    readonly code: AttentionCode,
    readonly detail: string | null = null,
  ) {
    super(detail ?? code);
    this.name = "JobAttentionError";
  }
}

/**
 * Thrown by `JobEnv.submit` when the item cannot be sent yet for a reason outside our control (e.g. the
 * Book commit window is about to close). Nothing was sent; the runner waits and tries again next tick.
 */
export class JobWaitError extends Error {
  constructor(readonly reason: WaitReason) {
    super(reason);
    this.name = "JobWaitError";
  }
}

/** Sale and Book order progress (an order's epoch phases map onto the sale phases). */
export interface SaleProgress {
  readonly phase: "upcoming" | "commit" | "reveal" | "settle" | "claim" | "failed";
  readonly bid: "sealed" | "revealed" | "unrevealed" | "claimed";
}

/** Everything effectful a job needs. The web app implements it over its DataSource, the e2e over its client. */
export interface JobEnv {
  now(): number;
  listNotes(): Promise<readonly JobNote[]>;
  /**
   * Deposit the listed units from the public wallet. Resolves once the deposit is mined, with the new
   * note ids in deposit order (unit by unit, `count` each). Throws `JobAttentionError` only when nothing
   * was sent (no wallet, rejected, not enough funds).
   */
  deposit(job: Job, deposits: readonly UnitDeposit[]): Promise<{ readonly txHash: string; readonly noteIds: readonly string[] }>;
  privacy(job: Job): Promise<PrivacyStatus>;
  /** Perform one work item (prove + hand to the relay, place the bid, ...). */
  submit(job: Job, item: WorkItem, index: number): Promise<{ readonly ref: string; readonly outputs?: JsonObject }>;
  /**
   * After an interruption mid-submission: the ref if it went through, `null` if it certainly did not.
   * `item.mark` holds what `mark` returned right before the attempt.
   */
  recover(job: Job, item: WorkItem, index: number): Promise<string | null>;
  /** Snapshot taken before each attempt (e.g. the note balance) so `recover` can tell whether it landed. */
  mark?(job: Job, item: WorkItem, index: number): Promise<string | null>;
  confirm(job: Job): Promise<"pending" | "done" | "failed">;
  saleProgress?(job: Job): Promise<SaleProgress>;
  claim?(job: Job): Promise<{ readonly ref: string }>;
}

export interface JobStore {
  /** `null` while the store is unavailable (vault locked). */
  load(): Promise<Job[] | null>;
  save(jobs: readonly Job[]): Promise<void>;
}

export interface JobDraft {
  readonly kind: JobKind;
  readonly asset: string;
  readonly pieces: readonly bigint[];
  /** Unit to deposit per piece when the vault lacks it (default: the piece). */
  readonly fundPieces?: readonly bigint[];
  readonly params: JsonObject;
  /** Work items; default one per piece for sends, otherwise a single "main" item. */
  readonly workKeys?: readonly string[];
}

export interface JobPlan {
  readonly noteIds: readonly (string | null)[];
  readonly deposits: readonly UnitDeposit[];
}

export interface RunnerOptions {
  readonly newId?: () => string;
  /** Unexpected failures in a row before a job asks for attention. */
  readonly maxFailures?: number;
  /** How long a mined deposit may stay invisible before the job asks for attention. */
  readonly indexingTimeoutMs?: number;
  /** Re-ask the relay for a claim after this long without progress. */
  readonly claimRetryMs?: number;
  readonly onChange?: (jobs: readonly Job[]) => void;
  /** Called when a job reaches `done` or needs attention. */
  readonly onSettled?: (job: Job) => void;
}

const MAX_STEPS_PER_TICK = 12;

function randomId(): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return `job-${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export class JobRunner {
  private jobs: Job[] | null = null;
  private loading: Promise<Job[] | null> | null = null;
  private readonly perJob = new Map<string, Promise<unknown>>();
  private saving: Promise<void> = Promise.resolve();
  private ticking: Promise<void> | null = null;

  constructor(
    private readonly store: JobStore,
    private readonly env: JobEnv,
    private readonly options: RunnerOptions = {},
  ) {}

  /** Current jobs, newest first (empty until loaded). */
  list(): readonly Job[] {
    return [...(this.jobs ?? [])].sort((a, b) => b.createdAt - a.createdAt);
  }

  get(id: string): Job | null {
    return this.jobs?.find((j) => j.id === id) ?? null;
  }

  /** Load from the store once; returns `null` while the store is unavailable. */
  async load(): Promise<readonly Job[] | null> {
    if (this.jobs) return this.jobs;
    if (!this.loading) {
      this.loading = this.store.load().then((jobs) => {
        this.jobs = jobs;
        this.loading = null;
        if (jobs) this.options.onChange?.(this.list());
        return jobs;
      }, (error: unknown) => {
        this.loading = null;
        throw error;
      });
    }
    return this.loading;
  }

  /** Forget the in-memory list (the vault locked); the next tick reloads. */
  unload(): void {
    this.jobs = null;
    this.options.onChange?.([]);
  }

  /** Which notes would back the draft right now, and what the wallet would have to deposit. */
  async plan(draft: JobDraft): Promise<JobPlan> {
    const jobs = (await this.load()) ?? [];
    const notes = await this.env.listNotes();
    const noteIds = assignNotes(draft.pieces, draft.pieces.map(() => null), notes, draft.asset, reservedNotes(jobs));
    return { noteIds, deposits: depositsFor(draft.fundPieces ?? draft.pieces, noteIds) };
  }

  async create(draft: JobDraft): Promise<Job> {
    if (draft.pieces.length === 0) throw new Error("a job needs at least one piece");
    if (draft.fundPieces && draft.fundPieces.length !== draft.pieces.length) throw new Error("fundPieces must match pieces");
    const notes = await this.env.listNotes();
    await this.load();
    // Synchronous from here on: reservations cannot change under us (read the live list, not a stale copy).
    const jobs = this.jobs;
    if (!jobs) throw new JobAttentionError("error", "locked");
    const noteIds = assignNotes(draft.pieces, draft.pieces.map(() => null), notes, draft.asset, reservedNotes(jobs));
    const now = this.env.now();
    const keys = draft.workKeys ?? (draft.kind === "send" ? draft.pieces.map((_, i) => `piece:${i}`) : ["main"]);
    const job: Job = {
      id: (this.options.newId ?? randomId)(),
      kind: draft.kind,
      asset: draft.asset,
      createdAt: now,
      updatedAt: now,
      step: "fund",
      status: "running",
      pieces: [...draft.pieces],
      noteIds,
      fundPieces: [...(draft.fundPieces ?? draft.pieces)],
      fund: { state: "none", deposits: [], txHash: null, sentAt: null },
      work: keys.map((key) => ({ key, state: "todo", ref: null })),
      waiting: null,
      attention: null,
      privacy: null,
      sendAnyway: false,
      failures: 0,
      params: draft.params,
      outputs: {},
      timeline: [{ step: "fund", at: now }],
    };
    this.jobs = [...jobs, job];
    await this.persist();
    return job;
  }

  /** Go ahead although the Privacy Check is weak. */
  sendAnyway(id: string): Promise<Job> {
    return this.mutate(id, (job) => ({ ...job, sendAnyway: true, status: job.status === "waiting" && job.step === "mix" ? "running" : job.status }));
  }

  /** Clear an attention state and try the step again. */
  retry(id: string): Promise<Job> {
    return this.mutate(id, (job) => {
      if (job.status !== "attention") return job;
      // The user confirmed the interrupted wallet deposit never went out.
      const fund = job.attention?.code === "fund_interrupted" ? { state: "none" as const, deposits: [], txHash: null, sentAt: null } : job.fund;
      return { ...job, status: "running", attention: null, failures: 0, fund, timeline: [...job.timeline, { step: job.step, at: this.env.now(), code: "retry" }] };
    });
  }

  /** Cancel before anything leaves the vault; reserved notes are released (deposits stay in the vault). */
  cancel(id: string): Promise<Job> {
    return this.mutate(id, (job) => {
      if (isTerminal(job)) return job;
      const started = job.work.some((w) => w.state !== "todo");
      if (started || job.fund.state === "sending") throw new Error("this job can no longer be cancelled");
      return { ...job, status: "cancelled", waiting: null, timeline: [...job.timeline, { step: job.step, at: this.env.now(), code: "cancelled" }] };
    });
  }

  /** True while a job is past the point where cancelling is possible. */
  static cancellable(job: Job): boolean {
    return !isTerminal(job) && job.fund.state !== "sending" && job.work.every((w) => w.state === "todo");
  }

  /** One pass over every unfinished job (one at a time, so provers never run in parallel). */
  tick(): Promise<void> {
    if (this.ticking) return this.ticking;
    this.ticking = this.runTick().finally(() => {
      this.ticking = null;
    });
    return this.ticking;
  }

  private async runTick(): Promise<void> {
    const jobs = await this.load();
    if (!jobs) return;
    for (const { id } of jobs) {
      await this.serial(id, () => this.advance(id));
    }
  }

  private async advance(id: string): Promise<void> {
    for (let i = 0; i < MAX_STEPS_PER_TICK; i += 1) {
      const job = this.get(id);
      if (!job || isTerminal(job) || job.status === "attention") return;
      const before = job;
      let next: Job;
      try {
        next = await this.step(job);
      } catch (error: unknown) {
        const current = this.get(id) ?? job;
        if (error instanceof JobAttentionError) next = this.attention(current, error.code, error.detail);
        else {
          const failures = current.failures + 1;
          const detail = error instanceof Error ? error.message : String(error);
          next = failures >= (this.options.maxFailures ?? 5) ? this.attention({ ...current, failures }, "error", detail) : { ...current, failures, updatedAt: this.env.now() };
        }
      }
      await this.replace(next);
      if (next.status !== before.status && (next.status === "done" || next.status === "attention")) this.options.onSettled?.(next);
      if (next.status !== "running" || (next.step === before.step && next.status === before.status)) return;
    }
  }

  private async step(job: Job): Promise<Job> {
    switch (job.step) {
      case "fund":
        return this.fundStep(job);
      case "screen":
        return this.screenStep(job);
      case "mix":
        return this.mixStep(job);
      case "submit":
        return this.submitStep(job);
      case "confirm":
        return this.confirmStep(job);
      case "reveal":
      case "finalize":
        return this.saleStep(job);
      case "claim":
        return this.claimStep(job);
      case "done":
        return { ...job, status: "done", waiting: null };
    }
  }

  /* ------------------------------------------------------------- steps */

  private async fundStep(job: Job): Promise<Job> {
    const notes = await this.env.listNotes();
    const current = this.get(job.id) ?? job;
    const noteIds = assignNotes(current.pieces, current.noteIds, notes, current.asset, reservedNotes(this.jobs ?? [], current.id));
    let next: Job = { ...current, noteIds };
    if (noteIds.every((id) => id !== null)) return this.goto(next, "screen");
    if (next.fund.state === "sending") return this.attention(next, "fund_interrupted", null);
    if (next.fund.state === "sent") {
      if (this.env.now() - (next.fund.sentAt ?? next.updatedAt) > (this.options.indexingTimeoutMs ?? 15 * 60_000)) return this.attention(next, "note_gone", "deposit not found");
      return this.wait(next, "deposit_indexing");
    }
    const deposits = depositsFor(next.fundPieces, noteIds);
    next = { ...next, fund: { state: "sending", deposits, txHash: null, sentAt: null } };
    await this.replace(next);
    let result: { readonly txHash: string; readonly noteIds: readonly string[] };
    try {
      result = await this.env.deposit(next, deposits);
    } catch (error: unknown) {
      if (error instanceof JobAttentionError) return this.attention({ ...next, fund: { state: "none", deposits, txHash: null, sentAt: null } }, error.code, error.detail);
      // The wallet may or may not have sent it: ask instead of depositing twice.
      return this.attention(next, "fund_interrupted", error instanceof Error ? error.message : null);
    }
    const latest = this.get(job.id) ?? next;
    const assigned = [...latest.noteIds];
    const queue = [...result.noteIds];
    for (const d of deposits) {
      for (let k = 0; k < d.count; k += 1) {
        const noteId = queue.shift();
        const slot = assigned.findIndex((id, i) => id === null && latest.fundPieces[i] === d.unit);
        if (noteId !== undefined && slot >= 0) assigned[slot] = noteId;
      }
    }
    next = { ...latest, noteIds: assigned, fund: { state: "sent", deposits, txHash: result.txHash, sentAt: this.env.now() }, timeline: [...latest.timeline, { step: "fund", at: this.env.now(), code: "deposited" }] };
    if (assigned.every((id) => id !== null)) return this.goto(next, "screen");
    return this.wait(next, "deposit_indexing");
  }

  private async screenStep(job: Job): Promise<Job> {
    const notes = new Map((await this.env.listNotes()).map((n) => [n.id, n]));
    let pending = false;
    for (const id of job.noteIds) {
      const note = id === null ? undefined : notes.get(id);
      if (!note) {
        const recent = job.fund.state === "sent" && this.env.now() - (job.fund.sentAt ?? 0) < (this.options.indexingTimeoutMs ?? 15 * 60_000);
        if (recent) {
          pending = true;
          continue;
        }
        return this.attention(job, "note_gone", id);
      }
      if (note.status === "declined") return this.attention(job, "declined", id);
      if (note.status === "spent" || note.status === "exited") return this.attention(job, "note_gone", id);
      if (note.status === "in_review") pending = true;
    }
    return pending ? this.wait(job, "screening") : this.goto(job, "mix");
  }

  private async mixStep(job: Job): Promise<Job> {
    if (job.sendAnyway) return this.goto(job, "submit");
    const privacy = await this.env.privacy(job);
    const next: Job = { ...job, privacy };
    if (privacy.level === "weak" && !(this.get(job.id) ?? job).sendAnyway) return this.wait(next, "privacy");
    return this.goto(next, "submit");
  }

  private async submitStep(job: Job): Promise<Job> {
    let current = job;
    for (let index = 0; index < current.work.length; index += 1) {
      const item = current.work[index] as WorkItem;
      if (item.state === "done") continue;
      if (item.state === "inflight") {
        const ref = await this.env.recover(current, item, index);
        if (ref !== null) {
          current = this.setWork(current, index, { ...item, state: "done", ref });
          await this.replace(current);
          continue;
        }
      }
      const mark = this.env.mark ? await this.env.mark(current, item, index) : null;
      current = this.setWork(current, index, { key: item.key, state: "inflight", ref: null, ...(mark === null ? {} : { mark }) });
      await this.replace(current);
      let result: { readonly ref: string; readonly outputs?: JsonObject };
      try {
        result = await this.env.submit(current, current.work[index] as WorkItem, index);
      } catch (error: unknown) {
        // Nothing was sent: back to todo. Otherwise stay inflight and let `recover` decide next time.
        if (error instanceof JobAttentionError) return this.attention(this.setWork(this.get(job.id) ?? current, index, { key: item.key, state: "todo", ref: null }), error.code, error.detail);
        if (error instanceof JobWaitError) return this.wait(this.setWork(this.get(job.id) ?? current, index, { key: item.key, state: "todo", ref: null }), error.reason);
        throw error;
      }
      const latest = this.get(job.id) ?? current;
      current = this.setWork({ ...latest, outputs: { ...latest.outputs, ...(result.outputs ?? {}) }, failures: 0 }, index, { key: item.key, state: "done", ref: result.ref });
      current = { ...current, timeline: [...current.timeline, { step: "submit", at: this.env.now(), code: item.key }] };
      await this.replace(current);
    }
    return this.goto(current, "confirm");
  }

  private async confirmStep(job: Job): Promise<Job> {
    const state = await this.env.confirm(job);
    if (state === "failed") return this.attention(job, "relay_failed", null);
    if (state === "pending") return this.wait(job, "relay");
    return this.goto(job, this.after(job, "confirm"));
  }

  private async saleStep(job: Job): Promise<Job> {
    if (!this.env.saleProgress) throw new JobAttentionError("error", "sale progress unavailable");
    const progress = await this.env.saleProgress(job);
    if (job.step === "reveal") {
      if (progress.bid === "revealed" || progress.bid === "claimed") return this.goto(job, "finalize");
      if (progress.phase === "commit" || progress.phase === "reveal" || progress.phase === "upcoming") return this.wait(job, "reveal_window");
      return this.attention(job, "not_revealed", null);
    }
    if (progress.bid === "claimed") return this.goto(job, "claim");
    if (progress.phase === "claim" || progress.phase === "failed") return this.goto(job, "claim");
    return this.wait(job, "sale_end");
  }

  private async claimStep(job: Job): Promise<Job> {
    if (!this.env.saleProgress || !this.env.claim) throw new JobAttentionError("error", "claims unavailable");
    const progress = await this.env.saleProgress(job);
    if (progress.bid === "claimed") return this.goto(job, "done");
    const askedAt = typeof job.outputs.claimAskedAt === "number" ? job.outputs.claimAskedAt : null;
    if (askedAt !== null && this.env.now() - askedAt < (this.options.claimRetryMs ?? 5 * 60_000)) return this.wait(job, "claim");
    const { ref } = await this.env.claim(job);
    const latest = this.get(job.id) ?? job;
    return this.wait({ ...latest, outputs: { ...latest.outputs, claimRef: ref, claimAskedAt: this.env.now() } }, "claim");
  }

  /* ----------------------------------------------------------- helpers */

  private after(job: Job, step: JobStep): JobStep {
    const steps = STEPS[job.kind];
    return steps[steps.indexOf(step) + 1] ?? "done";
  }

  private goto(job: Job, step: JobStep): Job {
    const now = this.env.now();
    if (step === "done") return { ...job, step, status: "done", waiting: null, attention: null, updatedAt: now, timeline: [...job.timeline, { step, at: now }] };
    return { ...job, step, status: "running", waiting: null, attention: null, updatedAt: now, failures: 0, timeline: [...job.timeline, { step, at: now }] };
  }

  private wait(job: Job, reason: WaitReason): Job {
    const now = this.env.now();
    const same = job.status === "waiting" && job.waiting?.reason === reason;
    return {
      ...job,
      status: "waiting",
      waiting: same && job.waiting ? job.waiting : { reason, since: now },
      updatedAt: now,
      failures: 0,
      timeline: same ? job.timeline : [...job.timeline, { step: job.step, at: now, code: reason }],
    };
  }

  private attention(job: Job, code: AttentionCode, detail: string | null): Job {
    const now = this.env.now();
    return { ...job, status: "attention", attention: { code, detail }, waiting: null, updatedAt: now, timeline: [...job.timeline, { step: job.step, at: now, code }] };
  }

  private setWork(job: Job, index: number, item: WorkItem): Job {
    return { ...job, work: job.work.map((w, i) => (i === index ? item : w)), updatedAt: this.env.now() };
  }

  private async mutate(id: string, fn: (job: Job) => Job): Promise<Job> {
    await this.load();
    return this.serial(id, async () => {
      const job = this.get(id);
      if (!job) throw new Error("job not found");
      const next = fn(job);
      if (next !== job) await this.replace({ ...next, updatedAt: this.env.now() });
      return this.get(id) ?? next;
    });
  }

  private serial<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.perJob.get(id) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    this.perJob.set(
      id,
      run.then(
        () => undefined,
        () => undefined,
      ),
    );
    return run;
  }

  private async replace(job: Job): Promise<void> {
    if (!this.jobs) return;
    this.jobs = this.jobs.map((j) => (j.id === job.id ? job : j));
    await this.persist();
  }

  private persist(): Promise<void> {
    const snapshot = this.jobs ? [...this.jobs] : null;
    this.options.onChange?.(this.list());
    if (!snapshot) return this.saving;
    this.saving = this.saving.then(() => this.store.save(snapshot), () => this.store.save(snapshot));
    return this.saving;
  }
}
