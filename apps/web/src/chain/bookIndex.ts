import { decodeBookRevealInput, type BookPairDeployment, type SettleOrder } from '@hushcross/core';
import { DataSourceError } from '../data/DataSource';
import type { Address, Hex } from '../data/types';
import type { ChainContext } from './context';
import { LogSync, syncFor } from './logSync';
import type { BookLog } from './marketsPort';

/** What the Book's own events say (orders per epoch, reveals, outcomes, reference reads). */
export interface BookIndex {
  readonly logs: readonly BookLog[];
  /** `${marketId}:${epoch}` -> commitments that belong to that epoch (committed or carried in). */
  readonly epochOrders: ReadonlyMap<string, readonly Hex[]>;
  readonly revealed: ReadonlyMap<string, { readonly validity: number; readonly tx: Hex }>;
  readonly outcomes: ReadonlyMap<string, Extract<BookLog, { kind: 'settled' | 'voided' }>>;
  readonly references: ReadonlyMap<string, bigint>;
}

const caches = new WeakMap<object, Map<string, LogSync<unknown>>>();
const inputs = new WeakMap<object, Map<Hex, Promise<Hex>>>();

export const epochKey = (marketId: bigint | string, epoch: bigint | number | string): string => `${marketId.toString()}:${epoch.toString()}`;

export function bookAddress(ctx: ChainContext): Address {
  const book = ctx.deployments.book;
  if (!book) throw new DataSourceError('not_found', 'no SealedBook in the deployments file');
  return book;
}

export function pairOf(ctx: ChainContext, pairId: string): BookPairDeployment {
  const pair = ctx.deployments.bookPairs.find((p) => p.marketId.toString() === pairId || p.symbol.toLowerCase() === pairId.toLowerCase() || `${p.symbol.toLowerCase()}-usdt` === pairId.toLowerCase());
  if (!pair) throw new DataSourceError('not_found');
  return pair;
}

export async function bookIndex(ctx: ChainContext): Promise<BookIndex> {
  const book = bookAddress(ctx);
  const markets = ctx.requireMarkets();
  const sync = syncFor<BookLog>(caches, ctx, book, () => new LogSync(() => ctx.deps.chain.getBlockNumber(), (from, to) => markets.getBookLogs(book, from, to), ctx.deployments.startBlock));
  const logs = await sync.sync();
  const epochOrders = new Map<string, Hex[]>();
  const revealed = new Map<string, { validity: number; tx: Hex }>();
  const outcomes = new Map<string, Extract<BookLog, { kind: 'settled' | 'voided' }>>();
  const references = new Map<string, bigint>();
  const push = (key: string, c: Hex): void => {
    epochOrders.set(key, [...(epochOrders.get(key) ?? []), c]);
  };
  for (const log of logs) {
    if (log.kind === 'committed') push(epochKey(log.marketId, log.epoch), log.commitment);
    else if (log.kind === 'carried') push(epochKey(log.marketId, log.toEpoch), log.commitment);
    else if (log.kind === 'revealed') revealed.set(log.commitment.toLowerCase(), { validity: log.validity, tx: log.tx });
    else if (log.kind === 'settled' || log.kind === 'voided') outcomes.set(epochKey(log.marketId, log.epoch), log);
    else if (log.kind === 'reference') references.set(epochKey(log.marketId, log.epoch), log.price);
  }
  return { logs, epochOrders, revealed, outcomes, references };
}

function txInput(ctx: ChainContext, tx: Hex): Promise<Hex> {
  let map = inputs.get(ctx);
  if (!map) {
    map = new Map();
    inputs.set(ctx, map);
  }
  const hit = map.get(tx);
  if (hit) return hit;
  const load = ctx.requireMarkets().getTransactionInput(tx);
  load.catch(() => map?.delete(tx));
  map.set(tx, load);
  return load;
}

/**
 * Valid revealed orders of one epoch, in reveal order. The contract keeps its leaves internal, so each
 * order is read back from the calldata of the `reveal` transaction that revealed it (relay or self).
 */
export async function revealedOrders(ctx: ChainContext, index: BookIndex, marketId: bigint, epoch: bigint): Promise<SettleOrder[]> {
  const commitments = index.epochOrders.get(epochKey(marketId, epoch)) ?? [];
  const valid = commitments
    .map((c) => ({ c, r: index.revealed.get(c.toLowerCase()) }))
    .filter((x): x is { c: Hex; r: { validity: number; tx: Hex } } => x.r !== undefined && x.r.validity === 1);
  const orders = await Promise.all(
    valid.map(async ({ r }) => {
      const decoded = decodeBookRevealInput(await txInput(ctx, r.tx));
      if (!decoded || decoded.marketId !== marketId) throw new DataSourceError('network', `reveal ${r.tx} is not a direct SealedBook.reveal call`);
      return { side: decoded.side, limitPrice: decoded.limitPrice, quantity: decoded.quantity, at: index.logs.findIndex((l) => l.kind === 'revealed' && l.tx === r.tx) };
    }),
  );
  return orders.sort((a, b) => a.at - b.at).map(({ side, limitPrice, quantity }) => ({ side, limitPrice, quantity }));
}
