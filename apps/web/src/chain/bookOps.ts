import {
  BOOK_FEE_BPS,
  bookEpochWindow,
  bookEscrowRequired,
  bookFundingAsset,
  bookMinEscrowIssue,
  bookOrderCommitment,
  bookPhaseAt,
  bookRefundNoteCount,
  bookSettleProposal,
  bookTargetEpoch,
  buildBookClaimTx,
  buildBookRevealTx,
  buildBookSettleNoCrossTx,
  buildBookSettleTx,
  buildBookVoidExpiredTx,
  buildFundOrderWithdrawal,
  buildPublicOrderTxs,
  buildRelayRequest,
  buildStealthSendFields,
  deriveChangeSecrets,
  launchRelayFee,
  planPrivateOrder,
  randomSalt,
  sealBookReveal,
  stealthMetaFromMaster,
  type BookPairDeployment,
  type BookOrderPreimage,
} from '@hushcross/core';
import { DataSourceError } from '../data/DataSource';
import type { Address, Asset, EpochClearing, EpochInfo, Order, OrderQuote, OrderRequest, OrderStatus, Pair, RevealedBook } from '../data/types';
import { bookAddress, bookIndex, epochKey, pairOf, revealedOrders, type BookIndex } from './bookIndex';
import type { ChainContext } from './context';
import { relayTask } from './relayTask';
import { fundingNote } from './launchOps';
import { orderToJson, preimageOf, readOrders, ORDERS_KEY, type StoredOrder } from './marketMeta';
import { activityToJson, readActivity, reservedNoteIds, withMeta } from './meta';
import { UNIT_TABLE } from './vaultOps';

const E18 = 10n ** 18n;
/** A vault order must be committed with this much of the commit window left (prove + relay). */
const VAULT_COMMIT_MARGIN_SEC = 90n;
const PUBLIC_COMMIT_MARGIN_SEC = 30n;

const isWbnb = (pair: BookPairDeployment): boolean => pair.symbol.toUpperCase() === 'WBNB' || pair.symbol.toUpperCase() === 'BNB';
const ms = (sec: bigint): number => Number(sec) * 1000;

function adapter(ctx: ChainContext): Address {
  const a = ctx.deployments.bookAdapter;
  if (!a) throw new DataSourceError('not_found', 'no BookAdapter in the deployments file');
  return a;
}

async function reference(ctx: ChainContext, pair: BookPairDeployment): Promise<bigint> {
  return ctx.cached(`bookRef:${pair.marketId}`, async () => (await ctx.requireMarkets().getReferencePrice(bookAddress(ctx), pair.marketId)) ?? 0n);
}

/* ---------------------------------------------------------------- pairs */

export async function listPairs(ctx: ChainContext): Promise<Pair[]> {
  if (!ctx.deployments.book) return [];
  const index = await bookIndex(ctx);
  return Promise.all(
    ctx.deployments.bookPairs.map(async (p): Promise<Pair> => {
      const last = [...index.outcomes.values()].filter((o) => o.marketId === p.marketId && o.kind === 'settled').sort((a, b) => (a.epoch < b.epoch ? 1 : -1))[0];
      return {
        id: p.marketId.toString(),
        base: p.symbol,
        quote: 'USDT',
        referencePrice: await reference(ctx, p),
        referenceSource: p.oracle,
        lastClearingPrice: last && last.kind === 'settled' ? last.price : null,
        tick: p.tick,
        lot: p.lot,
        vaultSell: isWbnb(p),
      };
    }),
  );
}

export async function getEpoch(ctx: ChainContext, pairId: string): Promise<EpochInfo> {
  const pair = pairOf(ctx, pairId);
  const markets = ctx.requireMarkets();
  const book = bookAddress(ctx);
  const nowSec = await ctx.deps.chain.getLatestTimestamp();
  const epoch = nowSec / 600n;
  const w = bookEpochWindow(epoch);
  const [current, ...previous] = await Promise.all([epoch, epoch - 1n, epoch - 2n].map((e) => markets.getBookEpoch(book, pair.marketId, e)));
  let settling: EpochInfo['settling'] = null;
  for (const [i, state] of previous.entries()) {
    const e = epoch - 1n - BigInt(i);
    const phase = bookPhaseAt(e, nowSec);
    if (state && state.status === 0 && state.orderCount > 0 && (phase === 'settle' || phase === 'expired')) {
      settling = { epoch: Number(e), orderCount: state.orderCount, settleEndsAt: ms(bookEpochWindow(e).settleEndsAt), action: phase === 'expired' ? 'void' : 'settle' };
      break;
    }
  }
  return {
    pairId,
    epoch: Number(epoch),
    phase: nowSec < w.commitEndsAt ? 'commit' : 'reveal',
    startsAt: ms(w.startsAt),
    commitEndsAt: ms(w.commitEndsAt),
    revealEndsAt: ms(w.revealEndsAt),
    sealedOrders: current?.orderCount ?? 0,
    settling,
  };
}

/* --------------------------------------------------------------- orders */

async function toOrder(ctx: ChainContext, stored: StoredOrder): Promise<Order> {
  const markets = ctx.requireMarkets();
  const brief = await markets.getOrderBrief(stored.book, stored.id);
  const known = brief.escrow > 0n;
  const epoch = known ? brief.epoch : BigInt(stored.epoch);
  const state = await markets.getBookEpoch(stored.book, BigInt(stored.marketId), epoch);
  const final = state.status !== 0;
  const payment = final && known ? await markets.getOrderPayment(stored.book, stored.id) : null;
  const fill = payment?.fill ?? 0n;
  let status: OrderStatus;
  if (!final) status = brief.validity === 0 ? 'sealed' : 'revealed';
  else if (fill > 0n) status = fill < stored.quantity ? 'partial' : 'filled';
  else if (brief.claimed) status = stored.rolledInto ? 'rolled' : 'refunded';
  else status = 'unfilled';
  return {
    id: stored.id,
    pairId: stored.marketId,
    side: stored.side,
    limitPrice: stored.limitPrice,
    amount: stored.quantity,
    filled: fill,
    epoch: Number(epoch),
    status,
    rollover: stored.rollover,
    funding: stored.funding,
    clearingPrice: state.status === 1 ? state.price : null,
    createdAt: stored.createdAt,
    escrow: known ? brief.escrow : stored.escrow,
    claimable: final && known && !brief.claimed,
    claimed: brief.claimed,
    payout: payment ? { baseOut: payment.baseOut, quoteOut: payment.quoteOut, baseRefund: payment.baseRefund, quoteRefund: payment.quoteRefund, fee: payment.fee } : null,
    delegatedReveal: stored.delegatedReveal,
    rolledInto: stored.rolledInto,
  };
}

export async function listMyOrders(ctx: ChainContext, pairId?: string): Promise<Order[]> {
  const account = ctx.deps.session.current();
  if (!account || !ctx.deployments.book) return [];
  const stored = readOrders(account.secrets).filter((o) => pairId === undefined || o.marketId === pairId);
  const orders = await Promise.all(stored.map((o) => toOrder(ctx, o)));
  return orders.sort((a, b) => b.createdAt - a.createdAt);
}

function findStored(ctx: ChainContext, orderId: string): StoredOrder {
  const stored = readOrders(ctx.requireAccount().secrets).find((o) => o.id.toLowerCase() === orderId.toLowerCase());
  if (!stored) throw new DataSourceError('not_found');
  return stored;
}

function checkShape(pair: BookPairDeployment, request: OrderRequest): void {
  if (request.amount <= 0n || request.limitPrice <= 0n) throw new DataSourceError('invalid_input');
  if (request.limitPrice % pair.tick !== 0n) throw new DataSourceError('invalid_input', 'limit price is not on the tick');
  if (request.amount % pair.lot !== 0n) throw new DataSourceError('invalid_input', 'amount is not a multiple of the lot');
}

/** `commit` reverts `EscrowTooSmall` below the market minimum (SECURITY-FIX-1 M3): refuse such an order up front. */
async function checkMinimum(ctx: ChainContext, pair: BookPairDeployment, side: OrderRequest['side'], escrow: bigint): Promise<void> {
  const min = await ctx.cached(`bookMin:${pair.marketId}`, () => ctx.requireMarkets().getMinEscrow(bookAddress(ctx), pair.marketId));
  if (bookMinEscrowIssue(side, escrow, min) !== null) throw new DataSourceError('invalid_input', 'the order is below the market minimum');
}

async function plan(ctx: ChainContext, pair: BookPairDeployment, request: OrderRequest): Promise<OrderQuote> {
  const required = bookEscrowRequired(request.side, request.amount, request.limitPrice);
  const notional = (request.amount * request.limitPrice) / E18;
  const fee = (notional * BOOK_FEE_BPS) / 10_000n;
  const fundingAsset = bookFundingAsset(request.side, isWbnb(pair));
  if (request.funding === 'public' || fundingAsset === null) {
    await checkMinimum(ctx, pair, request.side, required);
    return { fundingAsset, required, escrow: required, withdrawn: 0n, relayFee: 0n, fee };
  }
  const config = await ctx.assetConfig(fundingAsset);
  const p = await planPrivateOrder({ side: request.side, quantity: request.amount, limitPrice: request.limitPrice, units: UNIT_TABLE[fundingAsset], feeFor: async (w) => launchRelayFee(w, (await ctx.quote(fundingAsset, 'book', w)).feeBps, config.maxRelayFeeBps) });
  await checkMinimum(ctx, pair, request.side, p.escrow);
  return { fundingAsset, required, escrow: p.escrow, withdrawn: p.withdrawn, relayFee: p.relayFee, fee };
}

export async function quoteOrder(ctx: ChainContext, request: OrderRequest): Promise<OrderQuote> {
  const pair = pairOf(ctx, request.pairId);
  checkShape(pair, request);
  return plan(ctx, pair, request);
}

/**
 * Commit a sealed order. Vault: one note -> BookAdapter (relay target `book`); only the order's own unspent
 * escrow (USDT for a buy, BNB for a WBNB sell) comes back as vault notes on precommitments from the account's
 * own index line. Public: approve + `commit` from the wallet. Fill proceeds (base bought, USDT from a sale) and
 * every dust amount go to a fresh one-time address. The preimage is saved in the encrypted
 * vault before anything is sent and sealed to the relay, which reveals it inside the reveal window.
 */
export async function placeOrder(ctx: ChainContext, request: OrderRequest, rolledFrom: StoredOrder | null = null): Promise<Order> {
  const { keys, secrets } = ctx.requireAccount();
  const pair = pairOf(ctx, request.pairId);
  checkShape(pair, request);
  const book = bookAddress(ctx);
  const info = await ctx.relayInfo();
  if (info.sealedReveal === null) throw new DataSourceError('relay_rejected', 'the relay does not accept delegated reveals');
  const nowSec = await ctx.deps.chain.getLatestTimestamp();
  const target = bookTargetEpoch(nowSec, request.funding === 'vault' ? VAULT_COMMIT_MARGIN_SEC : PUBLIC_COMMIT_MARGIN_SEC);
  if (target.waitSec > 0n) throw new DataSourceError('phase_closed', 'this batch is closing; place the order in the next one');
  const quote = await plan(ctx, pair, request);
  if (request.funding === 'vault' && quote.fundingAsset === null) throw new DataSourceError('invalid_input', 'this side cannot be funded from the vault');
  const stealth = buildStealthSendFields(stealthMetaFromMaster(keys));
  const base: Omit<BookOrderPreimage, 'refundPrecommitments'> = { chainId: BigInt(ctx.deps.chainId), book, marketId: pair.marketId, epochId: target.epoch, side: request.side, limitPrice: request.limitPrice, quantity: request.amount, recipient: stealth.recipient, flags: 0, salt: randomSalt() };
  const remember = async (pre: BookOrderPreimage, escrow: bigint): Promise<StoredOrder> => {
    const stored: StoredOrder = { id: bookOrderCommitment(pre), book, marketId: pair.marketId.toString(), epoch: pre.epochId.toString(), side: pre.side, limitPrice: pre.limitPrice, quantity: pre.quantity, recipient: pre.recipient, recipientEphemeral: stealth.ephemeralPubKey, refundPrecommitments: pre.refundPrecommitments, flags: pre.flags, salt: pre.salt, escrow, funding: request.funding, delegatedReveal: true, rollover: request.rollover, rolledInto: null, createdAt: ctx.now() };
    await ctx.updateAccount((s) => {
      const list = readOrders(s).map((o) => (rolledFrom && o.id === rolledFrom.id ? { ...o, rolledInto: stored.id } : o));
      return withMeta(s, { [ORDERS_KEY]: [...list.map(orderToJson), orderToJson(stored)] });
    });
    return stored;
  };

  let preimage: BookOrderPreimage;
  let stored: StoredOrder;
  let fundingTx: `0x${string}` | null = null;
  if (request.funding === 'vault') {
    const asset = quote.fundingAsset as Asset;
    const config = await ctx.assetConfig(asset);
    const note = fundingNote(await ctx.accountNotes(), asset, quote.withdrawn, reservedNoteIds(secrets), request.noteId);
    const count = bookRefundNoteCount({ side: request.side, quantity: request.amount, limitPrice: request.limitPrice, escrow: quote.escrow, baseIsWbnb: isWbnb(pair), referencePrice: await reference(ctx, pair), usdtUnits: UNIT_TABLE.USDT, bnbUnits: UNIT_TABLE.BNB, vaultFeeBps: config.vettingFeeBps });
    // One precommitment list serves both pools (quote first, then WBNB base); recovery tries both scopes.
    const refunds = await ctx.freshDepositSecrets('USDT', count.total);
    preimage = { ...base, refundPrecommitments: refunds.map((r) => r.secrets.precommitment) };
    stored = await remember(preimage, quote.escrow);
    const withdrawal = buildFundOrderWithdrawal({ adapter: adapter(ctx), marketId: pair.marketId, commitment: stored.id, side: request.side, feeRecipient: info.relayer, relayFee: quote.relayFee });
    const next = deriveChangeSecrets(keys, note.label, BigInt(note.withdrawalCount));
    const proof = await ctx.prove(asset, note, quote.withdrawn, next, withdrawal);
    const view = await ctx.submit(buildRelayRequest({ target: 'book', pool: note.pool, scope: note.scope, withdrawal, proof, gasDrop: false, delaySeconds: 0 }), { target: 'book', purpose: 'book_order', createdAt: ctx.now(), executeAfter: ctx.now(), asset, amount: quote.withdrawn, recipient: null });
    const job = await ctx.deps.services.relay.waitForJob(view.jobId, { intervalMs: 2000, timeoutMs: 180_000 });
    if (job.state === 'failed' || !job.txHash) throw new DataSourceError('relay_rejected', job.error ?? job.state);
    fundingTx = job.txHash;
  } else {
    const owner = ctx.requireWallet();
    const token = request.side === 'buy' ? ctx.deployments.pools.USDT.asset : pair.base;
    if ((await ctx.deps.chain.getTokenBalance(token, owner)) < quote.escrow) throw new DataSourceError('insufficient_wallet');
    preimage = { ...base, refundPrecommitments: [] };
    stored = await remember(preimage, quote.escrow);
    const allowance = await ctx.deps.chain.getAllowance(token, owner, book);
    fundingTx = await ctx.sendWalletTxs(buildPublicOrderTxs({ book, marketId: pair.marketId, commitment: stored.id, side: request.side, escrow: quote.escrow, token, allowance }));
  }
  if ((await ctx.deps.chain.waitForReceipt(fundingTx)) !== 'success') throw new DataSourceError('tx_failed');
  await ctx.deps.services.relay.sealBookReveal(await sealBookReveal({ order: preimage, relayPublicKey: info.sealedReveal.publicKey }));
  await ctx.updateAccount((s) => withMeta(s, { activity: [...readActivity(s).map(activityToJson), activityToJson({ id: `order-${stored.id}`, kind: 'order', module: 'book', asset: pair.symbol, amount: request.amount, at: ctx.now(), status: 'pending', subject: `${pair.symbol}/USDT` })] }));
  ctx.emit(['orders', 'notes', 'balances', 'activity']);
  return toOrder(ctx, stored);
}

/** Claim a final order: through the relay when it offers Book claims, otherwise from the wallet. */
export async function claimOrder(ctx: ChainContext, orderId: string): Promise<Order> {
  const stored = findStored(ctx, orderId);
  const markets = ctx.requireMarkets();
  const brief = await markets.getOrderBrief(stored.book, stored.id);
  if (brief.escrow === 0n) throw new DataSourceError('not_found', 'the order was never committed');
  const state = await markets.getBookEpoch(stored.book, BigInt(stored.marketId), brief.epoch);
  if (state.status === 0) throw new DataSourceError('phase_closed');
  if (!brief.claimed) {
    if (brief.validity === 0) {
      // Never revealed: only the preimage can unlock the escrow (a public call from the wallet).
      ctx.requireWallet();
      await ctx.sendWalletTxs([buildBookRevealTx(preimageOf(stored, ctx.deps.chainId), true)]);
    } else {
      const task = await relayTask(() => ctx.deps.services.relay.claimBook({ book: stored.book, marketId: BigInt(stored.marketId), commitment: stored.id, precommitments: stored.refundPrecommitments }));
      if (task === null) {
        // This relay offers no Book claims. A vault order must not be tied to the wallet; a public one may claim from it.
        if (stored.funding === 'vault') throw new DataSourceError('relay_rejected', 'the relay does not offer Book claims');
        ctx.requireWallet();
        await ctx.sendWalletTxs([buildBookClaimTx(stored.book, stored.id, stored.refundPrecommitments)]);
      } else {
        const done = task.txHash || task.state === 'failed' ? task : await ctx.deps.services.relay.waitForTask(task.id, { intervalMs: 2000, timeoutMs: 120_000 });
        if (done.state === 'failed' || !done.txHash) throw new DataSourceError('relay_rejected', done.error ?? 'claim failed');
        if ((await ctx.deps.chain.waitForReceipt(done.txHash)) !== 'success') throw new DataSourceError('tx_failed');
      }
    }
  }
  ctx.emit(['orders', 'notes', 'balances', 'activity']);
  return toOrder(ctx, stored);
}

/** SPEC 5 rollover: the unfilled rest of a claimed order becomes a new sealed order (new commitment). */
export async function rolloverOrder(ctx: ChainContext, orderId: string): Promise<Order> {
  const stored = findStored(ctx, orderId);
  const order = await toOrder(ctx, stored);
  const pair = pairOf(ctx, stored.marketId);
  const rest = ((stored.quantity - order.filled) / pair.lot) * pair.lot;
  if (!order.claimed || stored.rolledInto || rest <= 0n) throw new DataSourceError('phase_closed');
  return placeOrder(ctx, { pairId: stored.marketId, side: stored.side, limitPrice: stored.limitPrice, amount: rest, rollover: stored.rollover, funding: stored.funding }, stored);
}

/* ----------------------------------------------------------- settlement */

async function clearingOf(ctx: ChainContext, index: BookIndex, pairId: string, marketId: bigint, epoch: bigint): Promise<EpochClearing | null> {
  const outcome = index.outcomes.get(epochKey(marketId, epoch));
  if (!outcome) return null;
  const at = await ctx.deps.chain.getBlockTime(outcome.block);
  const orderCount = (index.epochOrders.get(epochKey(marketId, epoch)) ?? []).length;
  const referencePrice = index.references.get(epochKey(marketId, epoch)) ?? null;
  if (outcome.kind === 'settled') return { pairId, epoch: Number(epoch), outcome: 'cleared', price: outcome.price, volume: outcome.volume, orderCount, at, referencePrice };
  const band = outcome.reason === 1;
  return { pairId, epoch: Number(epoch), outcome: band ? 'outside_band' : 'no_cross', price: null, volume: 0n, orderCount, at, referencePrice: band ? referencePrice : null };
}

export async function listClearings(ctx: ChainContext, pairId: string, limit: number): Promise<EpochClearing[]> {
  const pair = pairOf(ctx, pairId);
  const index = await bookIndex(ctx);
  const epochs = [...index.outcomes.values()].filter((o) => o.marketId === pair.marketId).map((o) => o.epoch).sort((a, b) => (a < b ? 1 : -1)).slice(0, Math.max(0, limit));
  const rows = await Promise.all(epochs.map((e) => clearingOf(ctx, index, pairId, pair.marketId, e)));
  return rows.filter((r): r is EpochClearing => r !== null);
}

/**
 * Submit the clearing of a finished epoch from the wallet: the certificate (pLow, pHigh, pivot, marginal)
 * comes from the revealed orders, is checked with the contract's own `preview`, then `settle` /
 * `settleNoCross`; past the settle window the epoch can only be voided (full refunds).
 */
export async function settleEpoch(ctx: ChainContext, pairId: string, epochNumber: number): Promise<EpochClearing> {
  const pair = pairOf(ctx, pairId);
  const book = bookAddress(ctx);
  const markets = ctx.requireMarkets();
  const epoch = BigInt(epochNumber);
  const [state, nowSec] = await Promise.all([markets.getBookEpoch(book, pair.marketId, epoch), ctx.deps.chain.getLatestTimestamp()]);
  if (state.status !== 0 || state.orderCount === 0) throw new DataSourceError('phase_closed', 'nothing to settle');
  const phase = bookPhaseAt(epoch, nowSec);
  ctx.requireWallet();
  if (phase === 'expired') {
    await ctx.sendWalletTxs([buildBookVoidExpiredTx(book, pair.marketId, epoch)]);
  } else if (phase === 'settle') {
    const index = await bookIndex(ctx);
    const orders = await revealedOrders(ctx, index, pair.marketId, epoch);
    const ref = (await markets.getReferencePrice(book, pair.marketId)) ?? 0n;
    const proposal = bookSettleProposal(orders, pair.tick, ref);
    if (proposal.status === 'no_cross') {
      if ((await markets.previewNoCross(book, pair.marketId, epoch)) !== 1) throw new DataSourceError('tx_failed', 'the contract sees crossing orders');
      await ctx.sendWalletTxs([buildBookSettleNoCrossTx(book, pair.marketId, epoch)]);
    } else {
      const code = await markets.previewSettle(book, pair.marketId, epoch, proposal);
      if (code > 2) throw new DataSourceError('tx_failed', `the contract rejects the computed clearing (code ${code})`);
      await ctx.sendWalletTxs([buildBookSettleTx(book, pair.marketId, epoch, proposal)]);
    }
  } else {
    throw new DataSourceError('phase_closed');
  }
  ctx.emit(['orders']);
  const after = await clearingOf(ctx, await bookIndex(ctx), pairId, pair.marketId, epoch);
  if (!after) throw new DataSourceError('network', 'settlement not indexed yet');
  return after;
}

/** Revealed orders (public after reveal) of the latest finished epoch that had valid reveals. */
export async function getRevealedBook(ctx: ChainContext, pairId: string): Promise<RevealedBook | null> {
  if (!ctx.deployments.book) return null;
  const pair = pairOf(ctx, pairId);
  const index = await bookIndex(ctx);
  const nowSec = await ctx.deps.chain.getLatestTimestamp();
  const current = nowSec / 600n;
  const candidates = [...index.epochOrders.keys()]
    .map((k) => k.split(':'))
    .filter(([m, e]) => m === pair.marketId.toString() && e !== undefined && BigInt(e) < current)
    .map(([, e]) => BigInt(e as string))
    .sort((a, b) => (a < b ? 1 : -1));
  for (const epoch of candidates.slice(0, 6)) {
    const orders = await revealedOrders(ctx, index, pair.marketId, epoch).catch(() => []);
    if (orders.length === 0) continue;
    const toRow = (o: { limitPrice: bigint; quantity: bigint }) => ({ price: o.limitPrice, amount: o.quantity });
    return {
      pairId,
      epoch: Number(epoch),
      buys: orders.filter((o) => o.side === 'buy').map(toRow),
      sells: orders.filter((o) => o.side === 'sell').map(toRow),
      referencePrice: index.references.get(epochKey(pair.marketId, epoch)) ?? (await reference(ctx, pair)),
    };
  }
  return null;
}
