import type { JsonValue } from "../vaultStore.js";
import type { UnitDeposit } from "./amounts.js";

/**
 * A one-step action that runs in the background and survives reloads. The job is stored (encrypted,
 * inside the vault in the web app) after every transition, so a fresh runner resumes from `step`.
 */
export type JobKind = "send" | "gift" | "sale" | "donate" | "order";

export type JobStep = "fund" | "screen" | "mix" | "submit" | "confirm" | "reveal" | "finalize" | "claim" | "done";

/** running: the runner acts next tick; waiting: a condition outside our control; attention: the user decides. */
export type JobStatus = "running" | "waiting" | "attention" | "done" | "cancelled";

export type WaitReason = "deposit_indexing" | "screening" | "privacy" | "relay" | "commit_window" | "reveal_window" | "sale_end" | "claim";

export type AttentionCode =
  | "wallet_needed"
  | "wallet_funds"
  | "fund_interrupted"
  | "declined"
  | "note_gone"
  | "relay_failed"
  | "submit_unknown"
  | "not_revealed"
  | "phase_closed"
  | "error";

export const STEPS: Readonly<Record<JobKind, readonly JobStep[]>> = {
  send: ["fund", "screen", "mix", "submit", "confirm", "done"],
  gift: ["fund", "screen", "mix", "submit", "confirm", "done"],
  donate: ["fund", "screen", "mix", "submit", "confirm", "done"],
  sale: ["fund", "screen", "mix", "submit", "confirm", "reveal", "finalize", "claim", "done"],
  /** Book: sealed order -> relay reveal -> epoch settlement -> relay claim. */
  order: ["fund", "screen", "mix", "submit", "confirm", "reveal", "finalize", "claim", "done"],
};

export interface JobEvent {
  readonly step: JobStep;
  readonly at: number;
  /** Optional detail (attention / wait code, piece index...). */
  readonly code?: string;
}

export interface WorkItem {
  /** "piece:<i>" for per-unit sends, "main" for single submissions. */
  readonly key: string;
  readonly state: "todo" | "inflight" | "done";
  /** Relay job / bid / gift id once accepted. */
  readonly ref: string | null;
  /** What the env recorded just before submitting (e.g. the note balance), for `recover`. */
  readonly mark?: string;
}

export interface FundState {
  readonly state: "none" | "sending" | "sent";
  readonly deposits: readonly UnitDeposit[];
  readonly txHash: string | null;
  readonly sentAt: number | null;
}

export interface PrivacyStatus {
  readonly level: "good" | "fair" | "weak";
  /** Deposits after the least-mixed note, and how many the threshold asks for. */
  readonly mixed: number;
  readonly needed: number;
  /** When the age rule alone stops being weak (ms epoch), if that is the blocker. */
  readonly readyAt: number | null;
}

export type JsonObject = { readonly [key: string]: JsonValue };

export interface Job {
  readonly id: string;
  readonly kind: JobKind;
  readonly asset: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly step: JobStep;
  readonly status: JobStatus;
  /** Unit values this job withdraws from the vault (one note each). */
  readonly pieces: readonly bigint[];
  /** Reserved note per piece (`null` = still to fund). */
  readonly noteIds: readonly (string | null)[];
  /** Unit deposited from the wallet when a piece has no note (a piece itself, or the smallest unit covering it). */
  readonly fundPieces: readonly bigint[];
  readonly fund: FundState;
  readonly work: readonly WorkItem[];
  readonly waiting: { readonly reason: WaitReason; readonly since: number } | null;
  readonly attention: { readonly code: AttentionCode; readonly detail: string | null } | null;
  readonly privacy: PrivacyStatus | null;
  /** The user chose to go ahead although the Privacy Check is weak. */
  readonly sendAnyway: boolean;
  /** Consecutive unexpected failures (reset on progress). */
  readonly failures: number;
  /** Kind-specific input (recipient, sale, message...). JSON only. */
  readonly params: JsonObject;
  /** Kind-specific results (links, claim task...). JSON only. */
  readonly outputs: JsonObject;
  readonly timeline: readonly JobEvent[];
}

export const isTerminal = (job: Job): boolean => job.status === "done" || job.status === "cancelled";

/** Notes are held from creation until the job ends or is cancelled. */
export function reservedNotes(jobs: readonly Job[], except?: string): Set<string> {
  const ids = new Set<string>();
  for (const job of jobs) {
    if (job.id === except || isTerminal(job)) continue;
    for (const id of job.noteIds) if (id !== null) ids.add(id);
  }
  return ids;
}

export function stepIndex(job: Job, step: JobStep = job.step): number {
  return STEPS[job.kind].indexOf(step);
}

/* ---------------------------------------------------------------- JSON */

type Obj = { readonly [key: string]: JsonValue };
const isObj = (v: JsonValue | undefined): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const arr = (v: JsonValue | undefined): readonly JsonValue[] => (Array.isArray(v) ? (v as readonly JsonValue[]) : []);
const str = (v: JsonValue | undefined): string | null => (typeof v === "string" ? v : null);
const num = (v: JsonValue | undefined): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const big = (v: JsonValue | undefined): bigint | null => (typeof v === "string" && /^\d+$/.test(v) ? BigInt(v) : null);
const oneOf = <T extends string>(v: JsonValue | undefined, list: readonly T[]): T | null => (typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : null);

const KINDS: readonly JobKind[] = ["send", "gift", "sale", "donate", "order"];
const ALL_STEPS: readonly JobStep[] = ["fund", "screen", "mix", "submit", "confirm", "reveal", "finalize", "claim", "done"];
const STATUSES: readonly JobStatus[] = ["running", "waiting", "attention", "done", "cancelled"];
const WAITS: readonly WaitReason[] = ["deposit_indexing", "screening", "privacy", "relay", "commit_window", "reveal_window", "sale_end", "claim"];
const ATTENTION: readonly AttentionCode[] = ["wallet_needed", "wallet_funds", "fund_interrupted", "declined", "note_gone", "relay_failed", "submit_unknown", "not_revealed", "phase_closed", "error"];

export function jobToJson(job: Job): JsonValue {
  return {
    id: job.id,
    kind: job.kind,
    asset: job.asset,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    step: job.step,
    status: job.status,
    pieces: job.pieces.map(String),
    noteIds: [...job.noteIds],
    fundPieces: job.fundPieces.map(String),
    fund: { state: job.fund.state, deposits: job.fund.deposits.map((d) => ({ unit: d.unit.toString(), count: d.count })), txHash: job.fund.txHash, sentAt: job.fund.sentAt },
    work: job.work.map((w) => ({ key: w.key, state: w.state, ref: w.ref, ...(w.mark === undefined ? {} : { mark: w.mark }) })),
    waiting: job.waiting ? { reason: job.waiting.reason, since: job.waiting.since } : null,
    attention: job.attention ? { code: job.attention.code, detail: job.attention.detail } : null,
    privacy: job.privacy ? { level: job.privacy.level, mixed: job.privacy.mixed, needed: job.privacy.needed, readyAt: job.privacy.readyAt } : null,
    sendAnyway: job.sendAnyway,
    failures: job.failures,
    params: job.params,
    outputs: job.outputs,
    timeline: job.timeline.map((e) => ({ step: e.step, at: e.at, ...(e.code === undefined ? {} : { code: e.code }) })),
  };
}

/** Parse one stored job; `null` for anything malformed (a corrupt entry never blocks the others). */
export function jobFromJson(value: JsonValue): Job | null {
  if (!isObj(value)) return null;
  const id = str(value.id);
  const kind = oneOf(value.kind, KINDS);
  const asset = str(value.asset);
  const createdAt = num(value.createdAt);
  const updatedAt = num(value.updatedAt);
  const step = oneOf(value.step, ALL_STEPS);
  const status = oneOf(value.status, STATUSES);
  if (!id || !kind || !asset || createdAt === null || updatedAt === null || !step || !status || !STEPS[kind].includes(step)) return null;
  const pieces = arr(value.pieces).map(big);
  if (pieces.some((p) => p === null)) return null;
  const noteIds = arr(value.noteIds).map((v) => (v === null ? null : str(v)));
  if (noteIds.length !== pieces.length) return null;
  const fundRawPieces = arr(value.fundPieces).map(big);
  const fundPieces = fundRawPieces.length === pieces.length && fundRawPieces.every((p) => p !== null) ? (fundRawPieces as bigint[]) : (pieces as bigint[]);
  const fundRaw = isObj(value.fund) ? value.fund : {};
  const deposits = arr(fundRaw.deposits).flatMap((d) => {
    if (!isObj(d)) return [];
    const unit = big(d.unit);
    const count = num(d.count);
    return unit !== null && count !== null ? [{ unit, count }] : [];
  });
  const work = arr(value.work).flatMap((w): WorkItem[] => {
    if (!isObj(w)) return [];
    const key = str(w.key);
    const state = oneOf(w.state, ["todo", "inflight", "done"] as const);
    const mark = str(w.mark);
    return key && state ? [{ key, state, ref: str(w.ref), ...(mark === null ? {} : { mark }) }] : [];
  });
  const waitingRaw = isObj(value.waiting) ? value.waiting : null;
  const waitReason = waitingRaw ? oneOf(waitingRaw.reason, WAITS) : null;
  const attentionRaw = isObj(value.attention) ? value.attention : null;
  const attentionCode = attentionRaw ? oneOf(attentionRaw.code, ATTENTION) : null;
  const privacyRaw = isObj(value.privacy) ? value.privacy : null;
  const level = privacyRaw ? oneOf(privacyRaw.level, ["good", "fair", "weak"] as const) : null;
  const timeline = arr(value.timeline).flatMap((e): JobEvent[] => {
    if (!isObj(e)) return [];
    const s = oneOf(e.step, ALL_STEPS);
    const at = num(e.at);
    const code = str(e.code);
    return s && at !== null ? [{ step: s, at, ...(code === null ? {} : { code }) }] : [];
  });
  return {
    id,
    kind,
    asset,
    createdAt,
    updatedAt,
    step,
    status,
    pieces: pieces as bigint[],
    noteIds,
    fundPieces,
    fund: { state: oneOf(fundRaw.state, ["none", "sending", "sent"] as const) ?? "none", deposits, txHash: str(fundRaw.txHash), sentAt: num(fundRaw.sentAt) },
    work,
    waiting: waitReason ? { reason: waitReason, since: num(waitingRaw?.since) ?? updatedAt } : null,
    attention: attentionCode ? { code: attentionCode, detail: str(attentionRaw?.detail) } : null,
    privacy: level && privacyRaw ? { level, mixed: num(privacyRaw.mixed) ?? 0, needed: num(privacyRaw.needed) ?? 0, readyAt: num(privacyRaw.readyAt) } : null,
    sendAnyway: value.sendAnyway === true,
    failures: num(value.failures) ?? 0,
    params: isObj(value.params) ? value.params : {},
    outputs: isObj(value.outputs) ? value.outputs : {},
    timeline,
  };
}

export function jobsFromJson(value: JsonValue | undefined): Job[] {
  return arr(value).flatMap((v) => {
    const job = jobFromJson(v);
    return job ? [job] : [];
  });
}
