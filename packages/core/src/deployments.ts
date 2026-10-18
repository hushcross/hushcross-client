import { getAddress, isAddress, type Address } from "viem";
import { CoreError } from "./errors.js";
import type { FetchLike } from "./services.js";

export type PoolAsset = "BNB" | "USDT";

export interface PoolDeployment {
  readonly pool: Address;
  readonly scope: bigint;
  readonly asset: Address;
}

/** `contracts/deployments/<chainId>.json` (INTERFACES 6). */
export interface Deployments {
  readonly chainId: number;
  readonly entrypoint: Address;
  readonly pools: Readonly<Record<PoolAsset, PoolDeployment>>;
  readonly hushSend: Address;
  readonly gift: Address;
  readonly launchFactory: Address | null;
  readonly launchAdapter: Address | null;
  readonly announcer: Address;
  readonly registry: Address;
  readonly sanctionsOracle: Address | null;
  readonly feeds: { readonly BNB_USD: Address; readonly USDT_USD: Address };
  readonly startBlock: bigint;
  /** W4: SealedBook + BookAdapter and the listed pairs; null / empty before Book is deployed. */
  readonly book: Address | null;
  readonly bookAdapter: Address | null;
  readonly bookPairs: readonly BookPairDeployment[];
  /** W4: Give contracts; null before Give is deployed. */
  readonly giveRegistry: Address | null;
  readonly giveEscrow: Address | null;
  readonly giveAdapter: Address | null;
}

/** One listed Book market (`deployments.bookPairs[]`). Tick and lot are not readable from the contract. */
export interface BookPairDeployment {
  readonly marketId: bigint;
  readonly symbol: string;
  readonly base: Address;
  /** Price tick (USDT base units per whole base token). */
  readonly tick: bigint;
  /** Quantity granularity in base units. */
  readonly lot: bigint;
  readonly oracle: "chainlink" | "twap";
  /** Base token decimals (18 for every BSC base listed so far). */
  readonly decimals: number;
}

/** Native-asset placeholder used by the upstream pools. */
export const NATIVE_ASSET: Address = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

export function parseDeployments(raw: unknown): Deployments {
  const body = record(raw, "deployments");
  const chainId = body.chainId;
  if (typeof chainId !== "number" || !Number.isInteger(chainId) || chainId <= 0) throw new CoreError("deployments", "chainId must be a positive integer");
  const pools = record(body.pools, "pools");
  return {
    chainId,
    entrypoint: address(body.entrypoint, "entrypoint"),
    pools: { BNB: pool(pools.BNB, "BNB"), USDT: pool(pools.USDT, "USDT") },
    hushSend: address(body.hushSend, "hushSend"),
    gift: address(body.gift, "gift"),
    launchFactory: optionalAddress(body.launchFactory, "launchFactory"),
    launchAdapter: optionalAddress(body.launchAdapter, "launchAdapter"),
    announcer: address(body.announcer, "announcer"),
    registry: address(body.registry, "registry"),
    sanctionsOracle: optionalAddress(body.sanctionsOracle, "sanctionsOracle"),
    feeds: (() => {
      const feeds = record(body.feeds, "feeds");
      return { BNB_USD: address(feeds.BNB_USD, "feeds.BNB_USD"), USDT_USD: address(feeds.USDT_USD, "feeds.USDT_USD") };
    })(),
    startBlock: integer(body.startBlock ?? 0, "startBlock"),
    book: optionalAddress(body.book, "book"),
    bookAdapter: optionalAddress(body.bookAdapter, "bookAdapter"),
    bookPairs: bookPairs(body.bookPairs),
    giveRegistry: optionalAddress(body.giveRegistry, "giveRegistry"),
    giveEscrow: optionalAddress(body.giveEscrow, "giveEscrow"),
    giveAdapter: optionalAddress(body.giveAdapter, "giveAdapter"),
  };
}

/** Accepts an array of pairs or an object keyed by symbol; unknown extra fields are ignored. */
function bookPairs(raw: unknown): BookPairDeployment[] {
  if (raw === undefined || raw === null) return [];
  const entries: [string | null, unknown][] = Array.isArray(raw) ? raw.map((v) => [null, v]) : Object.entries(record(raw, "bookPairs"));
  return entries.map(([key, value], i) => {
    const item = record(value, `bookPairs[${i}]`);
    const name = `bookPairs.${key ?? i}`;
    const symbol = typeof item.symbol === "string" ? item.symbol : typeof item.name === "string" ? item.name.split("/")[0] ?? "" : key?.split(/[/_-]/u)[0] ?? "";
    if (symbol === "") throw new CoreError("deployments", `${name}.symbol is missing`);
    const oracle = item.oracle === "twap" || item.oracleKind === 2 || item.oracleKind === "twap" ? "twap" : "chainlink";
    const decimals = item.decimals === undefined ? 18 : Number(integer(item.decimals, `${name}.decimals`));
    return { marketId: integer(item.marketId ?? item.id, `${name}.marketId`), symbol, base: address(item.base ?? item.token, `${name}.base`), tick: integer(item.tick, `${name}.tick`), lot: integer(item.lot, `${name}.lot`), oracle, decimals };
  });
}

export type DeploymentsSource =
  | { readonly json: string; readonly expectedChainId?: number }
  | { readonly url: string; readonly fetch: FetchLike; readonly expectedChainId?: number };

/** Load from embedded JSON (e.g. an env variable) or from a URL. */
export async function loadDeployments(source: DeploymentsSource): Promise<Deployments> {
  let raw: unknown;
  if ("json" in source) {
    try {
      raw = JSON.parse(source.json);
    } catch {
      throw new CoreError("deployments", "deployments JSON is invalid");
    }
  } else {
    const response = await source.fetch(source.url, { method: "GET", headers: { accept: "application/json" } });
    if (!response.ok) throw new CoreError("deployments", `deployments file responded ${response.status}`);
    raw = await response.json();
  }
  const parsed = parseDeployments(raw);
  if (source.expectedChainId !== undefined && parsed.chainId !== source.expectedChainId) {
    throw new CoreError("deployments", `deployments are for chain ${parsed.chainId}, expected ${source.expectedChainId}`);
  }
  return parsed;
}

function pool(raw: unknown, name: PoolAsset): PoolDeployment {
  if (raw === undefined) throw new CoreError("deployments", `pools.${name} is missing`);
  const body = record(raw, `pools.${name}`);
  return { pool: address(body.pool, `pools.${name}.pool`), scope: integer(body.scope, `pools.${name}.scope`), asset: address(body.asset, `pools.${name}.asset`) };
}

function integer(value: unknown, name: string): bigint {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === "string" && /^(0|[1-9][0-9]*)$/u.test(value)) return BigInt(value);
  throw new CoreError("deployments", `${name} must be a non-negative integer`);
}

function address(value: unknown, name: string): Address {
  if (typeof value !== "string" || !isAddress(value, { strict: false })) throw new CoreError("deployments", `${name} is not an address`);
  return getAddress(value);
}

function optionalAddress(value: unknown, name: string): Address | null {
  return value === undefined || value === null || value === "" ? null : address(value, name);
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new CoreError("deployments", `${name} must be an object`);
  return value as Record<string, unknown>;
}
