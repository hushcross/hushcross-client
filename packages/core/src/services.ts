import { getAddress, isAddress, isHex, type Address, type Hex } from "viem";
import { CoreError } from "./errors.js";
import type { IndexerAnnouncement } from "./hushId.js";
import { parseNameRecord, type NameRecord, type RegisterKeysRequest } from "./identity.js";
import type { SealedBookReveal } from "./book/sealedReveal.js";
import type { SealedReveal } from "./launch/sealedReveal.js";
import type { WithdrawTarget } from "./withdrawData.js";

/** Minimal fetch shape so callers can inject `fetch`, a test fake, or a logging wrapper. */
export interface RequestInitLike {
  readonly method?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
}

export interface ResponseLike {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export type FetchLike = (url: string, init?: RequestInitLike) => Promise<ResponseLike>;

export class ServiceError extends CoreError {
  readonly status: number;

  constructor(service: string, status: number, code: string) {
    super(code, `${service} responded ${status}: ${code}`);
    this.status = status;
  }
}

/** JSON body of `POST /v1/withdraw` (INTERFACES 4). All integers are decimal strings. */
export interface RelayWithdrawRequest {
  readonly target: WithdrawTarget;
  readonly pool: Address;
  readonly scope: string;
  readonly withdrawal: { readonly processooor: Address; readonly data: Hex };
  readonly proof: {
    readonly pA: readonly [string, string] | readonly string[];
    readonly pB: readonly (readonly string[])[];
    readonly pC: readonly [string, string] | readonly string[];
    readonly pubSignals: readonly string[];
  };
  readonly gasDrop: boolean;
  readonly delaySeconds: number;
}

export interface RelayJobView {
  readonly jobId: string;
  readonly state: string;
  readonly txHash: Hex | null;
  readonly executeAtMs: number | null;
  readonly error: string | null;
}

export interface RelayInfo {
  readonly relayer: Address;
  readonly gasDropWei: bigint;
  readonly maxRelayFeeBps: bigint | null;
  readonly maxDelaySec: number | null;
  readonly adapters: Partial<Record<WithdrawTarget, Address>>;
  /** X25519 key for delegated reveals (`null` when the relay does not offer them). */
  readonly sealedReveal: { readonly scheme: string; readonly publicKey: Hex } | null;
  /** Relay-paid ERC-6538 `registerKeysOnBehalf` and the off-chain name directory. */
  readonly registerKeys: boolean;
  readonly names: boolean;
  /** Relay-paid sale claims (`POST /v1/launch/claim`). */
  readonly claims: boolean;
  /** Relay-paid Book claims and Give refunds (W4). */
  readonly bookClaims: boolean;
  readonly giveRefunds: boolean;
  /** BNB the relay sends once to a one-time address its Book claim / Give refund paid tokens to (0 = none). */
  readonly payoutStipendWei: bigint;
  feeBpsForScope(scope: bigint): bigint;
}

/** Relay-paid transaction outside the withdraw pipeline (sealed reveal, Hush ID registration). */
export interface RelayTaskView {
  readonly id: string;
  readonly kind: string;
  readonly state: string;
  readonly txHash: Hex | null;
  readonly error: string | null;
}

export const FINAL_JOB_STATES: readonly string[] = ["broadcast", "confirmed", "mined", "failed"];
export const FINAL_TASK_STATES: readonly string[] = ["broadcast", "failed", "skipped", "expired", "unchanged"];

export class RelayClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: FetchLike,
  ) {}

  async info(): Promise<RelayInfo> {
    const body = record(await getJson(this.fetchImpl, join(this.baseUrl, "/v1/info"), "relay"), "relay info");
    const relayer = addressField(body.relayer, "relayer");
    const byScope = new Map<string, bigint>();
    for (const pool of Array.isArray(body.pools) ? body.pools : []) {
      if (isRecord(pool) && (typeof pool.scope === "string" || typeof pool.scope === "number")) {
        byScope.set(BigInt(pool.scope).toString(), BigInt(typeof pool.feeBps === "number" ? pool.feeBps : 0));
      }
    }
    const adapters: Partial<Record<WithdrawTarget, Address>> = {};
    if (isRecord(body.adapters)) {
      for (const target of ["send", "gift", "launch", "book", "give", "direct"] as const) {
        const value = body.adapters[target];
        if (typeof value === "string" && isAddress(value, { strict: false })) adapters[target] = getAddress(value);
      }
    }
    const sealed = isRecord(body.sealedReveal) && typeof body.sealedReveal.publicKey === "string" && isHex(body.sealedReveal.publicKey) && body.sealedReveal.publicKey.length === 66
      ? { scheme: typeof body.sealedReveal.scheme === "string" ? body.sealedReveal.scheme : "", publicKey: body.sealedReveal.publicKey }
      : null;
    const features = isRecord(body.features) ? body.features : {};
    return {
      relayer,
      sealedReveal: sealed,
      registerKeys: features.registerKeys === true,
      names: features.names === true,
      claims: features.claims === true,
      bookClaims: features.bookClaims === true,
      giveRefunds: features.giveRefunds === true,
      gasDropWei: typeof body.gasDropWei === "string" || typeof body.gasDropWei === "number" ? BigInt(body.gasDropWei) : 0n,
      payoutStipendWei: typeof body.payoutStipendWei === "string" && /^(0|[1-9][0-9]*)$/u.test(body.payoutStipendWei) ? BigInt(body.payoutStipendWei) : 0n,
      maxRelayFeeBps: typeof body.maxRelayFeeBps === "number" ? BigInt(body.maxRelayFeeBps) : null,
      maxDelaySec: typeof body.maxDelaySec === "number" ? body.maxDelaySec : null,
      adapters,
      feeBpsForScope: (scope) => byScope.get(scope.toString()) ?? 0n,
    };
  }

  async withdraw(request: RelayWithdrawRequest): Promise<RelayJobView> {
    const body = await sendJson(this.fetchImpl, join(this.baseUrl, "/v1/withdraw"), "POST", request, "relay");
    return jobView(body);
  }

  /** Store a sealed reveal; the relay submits it inside the reveal window. */
  async sealReveal(reveal: SealedReveal): Promise<RelayTaskView> {
    return taskView(await sendJson(this.fetchImpl, join(this.baseUrl, "/v1/reveals"), "POST", reveal, "relay"));
  }

  /** Store a sealed Book order; the relay reveals it inside the epoch's reveal window. */
  async sealBookReveal(reveal: SealedBookReveal): Promise<RelayTaskView> {
    return taskView(await sendJson(this.fetchImpl, join(this.baseUrl, "/v1/reveals"), "POST", reveal, "relay"));
  }

  /** Relay-paid `SealedBook.claim` (vault notes from the stored precommitments, dust to the order's recipient). */
  async claimBook(request: { readonly book: Address; readonly marketId: bigint; readonly commitment: Hex; readonly precommitments: readonly bigint[] }): Promise<RelayTaskView> {
    const body = { book: request.book, marketId: request.marketId.toString(), commitment: request.commitment, precommitments: request.precommitments.map((p) => p.toString()) };
    return taskView(await sendJson(this.fetchImpl, join(this.baseUrl, "/v1/book/claim"), "POST", body, "relay"));
  }

  /** Relay-paid `GiveEscrow.refund(campaignId, index)` after a goal missed (vault donations re-enter the vault). */
  async refundGive(request: { readonly campaignId: bigint; readonly index: bigint }): Promise<RelayTaskView> {
    const body = { campaignId: request.campaignId.toString(), index: request.index.toString() };
    return taskView(await sendJson(this.fetchImpl, join(this.baseUrl, "/v1/give/refund"), "POST", body, "relay"));
  }

  async revealStatus(commitment: Hex): Promise<RelayTaskView> {
    return taskView(await getJson(this.fetchImpl, join(this.baseUrl, `/v1/reveals/${commitment}`), "relay"));
  }

  /** ERC-6538 `registerKeysOnBehalf` paid by the relay. */
  async registerKeys(request: RegisterKeysRequest): Promise<RelayTaskView> {
    return taskView(await sendJson(this.fetchImpl, join(this.baseUrl, "/v1/register-keys"), "POST", request, "relay"));
  }

  /**
   * Relay-paid `SealedSale.claim` (tokens to the bid's recipient, refunds to its stored precommitments),
   * so the bidder's public wallet never appears on chain.
   */
  async claimSale(request: { readonly sale: Address; readonly commitment: Hex; readonly precommitments: readonly bigint[] }): Promise<RelayTaskView> {
    const body = { sale: request.sale, commitment: request.commitment, precommitments: request.precommitments.map((p) => p.toString()) };
    return taskView(await sendJson(this.fetchImpl, join(this.baseUrl, "/v1/launch/claim"), "POST", body, "relay"));
  }

  async task(id: string): Promise<RelayTaskView> {
    return taskView(await getJson(this.fetchImpl, join(this.baseUrl, `/v1/tasks/${encodeURIComponent(id)}`), "relay"));
  }

  async waitForTask(id: string, options: { readonly intervalMs?: number; readonly timeoutMs?: number; readonly sleep?: (ms: number) => Promise<void> } = {}): Promise<RelayTaskView> {
    const interval = options.intervalMs ?? 2000;
    const timeout = options.timeoutMs ?? 120_000;
    const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    for (let waited = 0; ; waited += interval) {
      const task = await this.task(id);
      if (FINAL_TASK_STATES.includes(task.state)) return task;
      if (waited >= timeout) throw new CoreError("relay_timeout", `relay task ${id} did not finish in time`);
      await sleep(interval);
    }
  }

  /** Off-chain name directory: publish a signed name -> meta-address record. */
  async putName(record: NameRecord): Promise<NameRecord> {
    return parseNameRecord(await sendJson(this.fetchImpl, join(this.baseUrl, "/v1/names"), "POST", record, "relay"));
  }

  /** `null` when the name is not claimed. The caller must verify the record (signature + on-chain registry). */
  async getName(name: string): Promise<NameRecord | null> {
    try {
      return parseNameRecord(await getJson(this.fetchImpl, join(this.baseUrl, `/v1/names/${encodeURIComponent(name)}`), "relay"));
    } catch (error: unknown) {
      if (error instanceof ServiceError && error.status === 404) return null;
      throw error;
    }
  }

  async job(id: string): Promise<RelayJobView> {
    return jobView(await getJson(this.fetchImpl, join(this.baseUrl, `/v1/jobs/${encodeURIComponent(id)}`), "relay"));
  }

  async waitForJob(
    id: string,
    options: {
      readonly intervalMs?: number;
      readonly timeoutMs?: number;
      readonly sleep?: (ms: number) => Promise<void>;
      readonly isFinal?: (job: RelayJobView) => boolean;
    } = {},
  ): Promise<RelayJobView> {
    const interval = options.intervalMs ?? 3000;
    const timeout = options.timeoutMs ?? 45 * 60_000;
    const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    const isFinal = options.isFinal ?? ((job: RelayJobView) => FINAL_JOB_STATES.includes(job.state));
    let waited = 0;
    for (;;) {
      const job = await this.job(id);
      if (isFinal(job)) return job;
      if (waited >= timeout) throw new CoreError("relay_timeout", `relay job ${id} did not finish in time`);
      await sleep(interval);
      waited += interval;
    }
  }
}

export type ScreenStatus = "approved" | "rejected" | "pending" | "unknown";

/** ASP inclusion proof from Screen `/proof/:label`. `index` is the LeanIMT path index. */
export interface AspInclusion {
  readonly root: bigint;
  readonly depth: number;
  readonly index: number;
  readonly siblings: readonly bigint[];
}

export interface ScreenPoolHealth {
  readonly address: Address;
  readonly approved: number;
  readonly rejected: number;
}

export interface ScreenHealth {
  readonly ok: boolean;
  readonly approved: number;
  readonly pools: readonly ScreenPoolHealth[];
}

export class ScreenClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: FetchLike,
  ) {}

  async status(label: bigint): Promise<ScreenStatus> {
    const body = record(await getJson(this.fetchImpl, join(this.baseUrl, `/status/${label.toString()}`), "screen"), "screen status");
    const status = body.status;
    return status === "approved" || status === "rejected" || status === "pending" ? status : "unknown";
  }

  /** `/health`: per-pool approved / rejected counts (used for the anonymity-set display). */
  async health(): Promise<ScreenHealth> {
    const body = record(await getJson(this.fetchImpl, join(this.baseUrl, "/health"), "screen"), "screen health");
    const pools = (Array.isArray(body.pools) ? body.pools : []).flatMap((pool): ScreenPoolHealth[] => {
      if (!isRecord(pool) || typeof pool.address !== "string" || !isAddress(pool.address, { strict: false })) return [];
      return [{ address: getAddress(pool.address), approved: typeof pool.approved === "number" ? pool.approved : 0, rejected: typeof pool.rejected === "number" ? pool.rejected : 0 }];
    });
    return { ok: body.ok === true, approved: typeof body.approved === "number" ? body.approved : 0, pools };
  }

  async proof(label: bigint): Promise<AspInclusion> {
    const body = record(await getJson(this.fetchImpl, join(this.baseUrl, `/proof/${label.toString()}`), "screen"), "screen proof");
    const siblings = Array.isArray(body.siblings) ? body.siblings : [];
    if (typeof body.depth !== "number" || typeof body.index !== "number" || (typeof body.root !== "string" && typeof body.root !== "number")) {
      throw new CoreError("screen_proof", "screen proof is incomplete");
    }
    return {
      root: BigInt(body.root),
      depth: body.depth,
      index: body.index,
      siblings: siblings.map((value) => {
        if (typeof value !== "string" && typeof value !== "number") throw new CoreError("screen_proof", "screen sibling is not a number");
        return BigInt(value);
      }),
    };
  }
}

export interface AnnouncementPage {
  readonly items: readonly IndexerAnnouncement[];
  readonly nextFromBlock: bigint | null;
}

export class IndexerClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: FetchLike,
  ) {}

  /** `/v1/launch/sales` (newest first). */
  async sales(query: { readonly limit?: number; readonly offset?: number } = {}): Promise<{ readonly total: number; readonly sales: readonly IndexedSale[] }> {
    const url = `${join(this.baseUrl, "/v1/launch/sales")}?limit=${query.limit ?? 100}&offset=${query.offset ?? 0}`;
    const raw = await getJson(this.fetchImpl, url, "indexer");
    const body = record(isRecord(raw) && isRecord(raw.data) ? raw.data : raw, "indexer sales");
    const list = Array.isArray(body.sales) ? body.sales : [];
    return { total: typeof body.total === "number" ? body.total : list.length, sales: list.map(parseIndexedSale) };
  }

  /** `/v1/launch/sales/:id`; null when unknown. */
  async sale(id: bigint): Promise<IndexedSale | null> {
    try {
      const raw = await getJson(this.fetchImpl, join(this.baseUrl, `/v1/launch/sales/${id.toString()}`), "indexer");
      return parseIndexedSale(isRecord(raw) && isRecord(raw.data) ? raw.data : raw);
    } catch (error: unknown) {
      if (error instanceof ServiceError && error.status === 404) return null;
      throw error;
    }
  }

  async announcements(query: { readonly fromBlock: bigint; readonly limit: number }): Promise<AnnouncementPage> {
    const url = `${join(this.baseUrl, "/v1/announcements")}?fromBlock=${query.fromBlock.toString()}&limit=${query.limit}`;
    const raw = await getJson(this.fetchImpl, url, "indexer");
    // The indexer wraps every response as { meta, data }.
    const body = isRecord(raw) && isRecord(raw.data) ? raw.data : raw;
    const rawItems = Array.isArray(body) ? body : isRecord(body) && Array.isArray(body.items) ? body.items : isRecord(body) && Array.isArray(body.announcements) ? body.announcements : [];
    const items = rawItems.flatMap((item): IndexerAnnouncement[] => {
      if (!isRecord(item)) return [];
      const { block, logIndex, tx, stealthAddress, ephemeralPubKey, metadata } = item;
      if (typeof block !== "number" || typeof logIndex !== "number" || typeof tx !== "string" || !isHex(tx)) return [];
      if (typeof stealthAddress !== "string" || !isAddress(stealthAddress, { strict: false })) return [];
      if (typeof ephemeralPubKey !== "string" || !isHex(ephemeralPubKey) || typeof metadata !== "string" || !isHex(metadata)) return [];
      return [{ block, logIndex, tx, stealthAddress: stealthAddress as Address, ephemeralPubKey, metadata }];
    });
    const next = isRecord(body) && (typeof body.nextFromBlock === "number" || typeof body.nextFromBlock === "string") ? BigInt(body.nextFromBlock) : null;
    return { items, nextFromBlock: next };
  }
}

/** Indexer `/v1/launch/sales` summary (amounts parsed to bigint). */
export interface IndexedSale {
  readonly id: bigint;
  /** SealedSale contract (from `SaleDeployed`); null until the indexer saw that event. */
  readonly sale: Address | null;
  readonly vesting: Address | null;
  readonly token: Address;
  readonly creator: Address;
  /** zero address = BNB. */
  readonly quoteAsset: Address;
  readonly tokensForSale: bigint;
  readonly floorPrice: bigint;
  readonly minRaise: bigint;
  /** Unix seconds. */
  readonly commitEnd: number;
  readonly revealEnd: number;
  readonly phase: "commit" | "reveal" | "clearing" | "cleared" | "failed" | "live";
  readonly bids: { readonly committed: number; readonly revealed: number };
  readonly escrowTotal: bigint;
  readonly clearingPrice: bigint | null;
  readonly tokensSold: bigint | null;
  readonly raise: bigint | null;
  readonly liquidity: { readonly pool: Address; readonly positionId: bigint; readonly tokenAmount: bigint; readonly quoteAmount: bigint } | null;
  readonly createdAt: number;
  /** Latest `SaleProfileSet` pointer seen by the indexer; null when none (or an older indexer). */
  readonly profile: { readonly contentHash: Hex; readonly uri: string } | null;
}

const SALE_PHASES = ["commit", "reveal", "clearing", "cleared", "failed", "live"] as const;

function big(value: unknown, what: string): bigint {
  if (typeof value === "string" && /^(0|[1-9][0-9]*)$/u.test(value)) return BigInt(value);
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  throw new CoreError("service_shape", `${what} is not an integer`);
}

function optionalAddress(value: unknown): Address | null {
  return typeof value === "string" && isAddress(value, { strict: false }) ? getAddress(value) : null;
}

export function parseIndexedSale(raw: unknown): IndexedSale {
  const body = record(raw, "indexer sale");
  const phase = SALE_PHASES.find((p) => p === body.phase);
  if (phase === undefined) throw new CoreError("service_shape", "sale phase is unknown");
  const quote = isRecord(body.quoteAsset) ? body.quoteAsset.address : body.quoteAsset;
  const bids = isRecord(body.bids) ? body.bids : {};
  const liquidity = isRecord(body.liquidity) ? body.liquidity : null;
  const created = isRecord(body.created) ? body.created : {};
  return {
    id: big(body.id, "sale id"),
    sale: optionalAddress(body.sale),
    vesting: optionalAddress(body.vesting),
    token: addressField(body.token, "token"),
    creator: addressField(body.creator, "creator"),
    quoteAsset: addressField(quote, "quoteAsset"),
    tokensForSale: big(body.tokensForSale, "tokensForSale"),
    floorPrice: big(body.floorPrice, "floorPrice"),
    minRaise: big(body.minRaise, "minRaise"),
    commitEnd: Number(big(body.commitEnd, "commitEnd")),
    revealEnd: Number(big(body.revealEnd, "revealEnd")),
    phase,
    bids: { committed: typeof bids.committed === "number" ? bids.committed : 0, revealed: typeof bids.revealed === "number" ? bids.revealed : 0 },
    escrowTotal: big(body.escrowTotal ?? "0", "escrowTotal"),
    clearingPrice: body.clearingPrice === null || body.clearingPrice === undefined ? null : big(body.clearingPrice, "clearingPrice"),
    tokensSold: body.tokensSold === null || body.tokensSold === undefined ? null : big(body.tokensSold, "tokensSold"),
    raise: body.raise === null || body.raise === undefined ? null : big(body.raise, "raise"),
    liquidity:
      liquidity === null
        ? null
        : { pool: addressField(liquidity.pool, "liquidity.pool"), positionId: big(liquidity.positionId, "positionId"), tokenAmount: big(liquidity.tokenAmount, "tokenAmount"), quoteAmount: big(liquidity.quoteAmount, "quoteAmount") },
    createdAt: typeof created.timestamp === "number" ? created.timestamp : 0,
    profile: profilePointer(body.profile),
  };
}

/** Indexer copy of `LaunchFactory.profileOf` (untrusted; readers verify the document hash). */
function profilePointer(value: unknown): { readonly contentHash: Hex; readonly uri: string } | null {
  if (!isRecord(value) || typeof value.contentHash !== "string" || !/^0x[0-9a-fA-F]{64}$/u.test(value.contentHash) || typeof value.uri !== "string" || value.uri === "") return null;
  return /^0x0{64}$/u.test(value.contentHash) ? null : { contentHash: value.contentHash as Hex, uri: value.uri };
}

function taskView(raw: unknown): RelayTaskView {
  const body = record(raw, "relay task");
  if (typeof body.id !== "string" || typeof body.state !== "string") throw new CoreError("relay_task", "relay task is incomplete");
  return {
    id: body.id,
    kind: typeof body.kind === "string" ? body.kind : "unknown",
    state: body.state,
    txHash: typeof body.txHash === "string" && isHex(body.txHash) ? body.txHash : null,
    error: typeof body.error === "string" ? body.error : null,
  };
}

function jobView(raw: unknown): RelayJobView {
  const body = record(raw, "relay job");
  const id = typeof body.jobId === "string" ? body.jobId : typeof body.id === "string" ? body.id : null;
  if (id === null) throw new CoreError("relay_job", "relay job has no id");
  const state = typeof body.state === "string" ? body.state : typeof body.status === "string" ? body.status : "unknown";
  return {
    jobId: id,
    state,
    txHash: typeof body.txHash === "string" && isHex(body.txHash) ? body.txHash : null,
    executeAtMs: typeof body.executeAtMs === "number" ? body.executeAtMs : null,
    error: typeof body.error === "string" ? body.error : null,
  };
}

async function getJson(fetchImpl: FetchLike, url: string, service: string): Promise<unknown> {
  return handle(await fetchImpl(url, { method: "GET", headers: { accept: "application/json" } }), service);
}

async function sendJson(fetchImpl: FetchLike, url: string, method: string, body: unknown, service: string): Promise<unknown> {
  return handle(await fetchImpl(url, { method, headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body) }), service);
}

async function handle(response: ResponseLike, service: string): Promise<unknown> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    const code = isRecord(body) && typeof body.error === "string" ? body.error : isRecord(body) && typeof body.code === "string" ? body.code : `http_${response.status}`;
    throw new ServiceError(service, response.status, code);
  }
  return body;
}

function join(base: string, path: string): string {
  return `${base.replace(/\/+$/u, "")}${path}`;
}

function record(value: unknown, what: string): Record<string, unknown> {
  if (!isRecord(value)) throw new CoreError("service_shape", `${what} is not an object`);
  return value;
}

function addressField(value: unknown, name: string): Address {
  if (typeof value !== "string" || !isAddress(value, { strict: false })) throw new CoreError("service_shape", `${name} is not an address`);
  return getAddress(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
