import {
  LAUNCH_FACTORY_ABI,
  bidStatusName,
  buildClaimTx,
  buildCollectFeesTx,
  buildCreateSaleTx,
  buildFinalizeTx,
  buildFundBidWithdrawal,
  buildLaunchParams,
  buildPublicCommitTxs,
  buildRelayRequest,
  buildRevealTx,
  buildStealthSendFields,
  clearingPriceFromEntries,
  deriveChangeSecrets,
  escrowUnitsFor,
  launchBidCommitment,
  launchPhase,
  launchRelayFee,
  planPrivateBid,
  randomSalt,
  refundNoteBound,
  saleOutcomeName,
  sealReveal,
  stealthMetaFromMaster,
  type IndexedSale,
  type LaunchBidPreimage,
} from '@hushcross/core';
import { decodeEventLog, zeroAddress } from 'viem';
import { DataSourceError } from '../data/DataSource';
import { validateSaleInput } from '../data/launchRules';
import type { Address, Asset, Bid, BidQuote, BidRequest, BidStatus, CreateSaleInput, Sale, SaleClearing, SalePhase } from '../data/types';
import type { AccountNote, ChainContext } from './context';
import { activityToJson, bidToJson, readActivity, readBids, reservedNoteIds, withMeta, type StoredBid } from './meta';
import type { OnchainSale } from './ports';
import { UNIT_TABLE } from './vaultOps';

const E18 = 10n ** 18n;
const PHASE: Readonly<Record<ReturnType<typeof launchPhase>, SalePhase>> = { commit: 'commit', reveal: 'reveal', clearing: 'settle', cleared: 'claim', failed: 'failed' };

function factory(ctx: ChainContext): Address {
  const address = ctx.deployments.launchFactory;
  if (!address) throw new DataSourceError('not_found', 'no LaunchFactory in the deployments file');
  return address;
}

const assetOf = (sale: OnchainSale): Asset => (sale.quoteAsset.toLowerCase() === zeroAddress ? 'BNB' : 'USDT');

/** Indexer summary (enumeration, creation time, vesting) when available; the contract is read directly. */
async function indexed(ctx: ChainContext, saleId: bigint): Promise<IndexedSale | null> {
  return ctx.deps.services.indexer.sale(saleId).catch(() => null);
}

async function saleAddress(ctx: ChainContext, saleId: bigint, summary: IndexedSale | null): Promise<Address> {
  if (summary?.sale) return summary.sale;
  const address = await ctx.deps.chain.getSaleAddress(factory(ctx), saleId);
  if (!address) throw new DataSourceError('not_found');
  return address;
}

async function winningBids(ctx: ChainContext, sale: OnchainSale): Promise<number> {
  return ctx.cached(`winners:${sale.address}`, async () => {
    const entries = await ctx.deps.chain.getSaleEntries(sale.address, sale.entryCount);
    return entries.filter((e) => sale.undersubscribed || e.price >= sale.clearingPrice).length;
  });
}

async function toSale(ctx: ChainContext, onchain: OnchainSale, summary: IndexedSale | null, nowSec: bigint): Promise<Sale> {
  const token = await ctx.cached(`token:${onchain.token}`, () => ctx.deps.chain.getTokenInfo(onchain.token));
  const outcome = saleOutcomeName(onchain.outcome);
  const total = token.totalSupply;
  const creatorSupply = total - onchain.saleSupply - onchain.lpTokenReserve;
  const vesting = summary?.vesting && summary.vesting.toLowerCase() !== zeroAddress ? summary.vesting : null;
  const vestSeconds = vesting ? await ctx.cached(`vesting:${vesting}`, () => ctx.deps.chain.getVestingDuration(vesting)).catch(() => 0n) : 0n;
  let clearing: SaleClearing | null = null;
  if (outcome === 'cleared') {
    clearing = { price: onchain.clearingPrice, tokensSold: onchain.tokensSold, raised: onchain.raise, succeeded: true, winningBids: await winningBids(ctx, onchain), poolAddress: onchain.lpPool.toLowerCase() === zeroAddress ? null : onchain.lpPool };
  } else if (outcome === 'failed') {
    clearing = { price: onchain.clearingPrice, tokensSold: 0n, raised: 0n, succeeded: false, winningBids: 0, poolAddress: null };
  }
  const bps = (part: bigint): number => (total === 0n ? 0 : Number((part * 10_000n) / total));
  return {
    id: onchain.saleId.toString(),
    address: onchain.address,
    tokenName: token.name,
    tokenSymbol: token.symbol,
    // Descriptions are not stored on chain; the indexer only serves on-chain facts.
    description: '',
    creator: onchain.creator,
    tokenAddress: onchain.token,
    totalSupply: total,
    saleAmount: onchain.saleSupply,
    floorPrice: onchain.floorPrice,
    minRaise: onchain.minRaise,
    quoteAsset: assetOf(onchain),
    commitStart: (summary?.createdAt ?? 0) * 1000,
    commitEnd: Number(onchain.commitEnd) * 1000,
    revealEnd: Number(onchain.revealEnd) * 1000,
    liquidityBps: onchain.liquidityBps,
    tokenLiquidityBps: bps(onchain.lpTokenReserve),
    creatorShareBps: bps(creatorSupply),
    creatorVestDays: Number(vestSeconds / 86_400n),
    bidCount: Number(onchain.bidCount),
    totalDeposits: onchain.totalEscrow,
    phase: PHASE[launchPhase(nowSec, onchain.commitEnd, onchain.revealEnd, outcome)],
    clearing,
  };
}

async function loadSale(ctx: ChainContext, id: string): Promise<{ readonly onchain: OnchainSale; readonly summary: IndexedSale | null; readonly nowSec: bigint }> {
  if (!/^\d+$/.test(id)) throw new DataSourceError('not_found');
  const saleId = BigInt(id);
  const summary = await indexed(ctx, saleId);
  const address = await saleAddress(ctx, saleId, summary);
  const [onchain, nowSec] = await Promise.all([ctx.deps.chain.getSale(address), ctx.deps.chain.getLatestTimestamp()]);
  return { onchain, summary, nowSec };
}

export async function listSales(ctx: ChainContext): Promise<Sale[]> {
  if (!ctx.deployments.launchFactory) return [];
  const [{ sales }, nowSec] = await Promise.all([ctx.deps.services.indexer.sales({ limit: 100 }), ctx.deps.chain.getLatestTimestamp()]);
  const out = await Promise.all(sales.filter((s) => s.sale !== null).map(async (s) => toSale(ctx, await ctx.deps.chain.getSale(s.sale as Address), s, nowSec)));
  return out;
}

export async function getSale(ctx: ChainContext, id: string): Promise<Sale> {
  const { onchain, summary, nowSec } = await loadSale(ctx, id);
  return toSale(ctx, onchain, summary, nowSec);
}

/* ---------------------------------------------------------------- bids */

function preimageOf(ctx: ChainContext, bid: StoredBid): LaunchBidPreimage {
  return { chainId: BigInt(ctx.deps.chainId), sale: bid.sale, saleId: BigInt(bid.saleId), price: bid.price, maxSpend: bid.maxSpend, recipient: bid.recipient, refundPrecommitments: bid.refundPrecommitments, salt: bid.salt };
}

function bidStatus(onchainStatus: ReturnType<typeof bidStatusName>, phase: SalePhase, outcome: string, tokens: bigint, demanded: bigint): BidStatus {
  if (onchainStatus === 'claimed') return tokens > 0n ? 'claimed' : 'refunded';
  if (onchainStatus === 'evicted' || onchainStatus === 'none') return 'unrevealed';
  if (onchainStatus === 'committed') return phase === 'commit' || phase === 'reveal' ? 'sealed' : 'unrevealed';
  if (outcome === 'pending') return 'revealed';
  if (outcome === 'failed' || tokens === 0n) return 'lost';
  return tokens < demanded ? 'partial' : 'won';
}

async function toBid(ctx: ChainContext, stored: StoredBid, sales: Map<string, Promise<{ onchain: OnchainSale; phase: SalePhase }>>): Promise<Bid> {
  let entry = sales.get(stored.sale);
  if (!entry) {
    entry = Promise.all([ctx.deps.chain.getSale(stored.sale), ctx.deps.chain.getLatestTimestamp()]).then(([onchain, now]) => ({ onchain, phase: PHASE[launchPhase(now, onchain.commitEnd, onchain.revealEnd, saleOutcomeName(onchain.outcome))] }));
    sales.set(stored.sale, entry);
  }
  const { onchain, phase } = await entry;
  const [info, allocation] = await Promise.all([ctx.deps.chain.getBid(stored.sale, stored.id), ctx.deps.chain.getAllocation(stored.sale, stored.id)]);
  const demanded = (stored.maxSpend * E18) / stored.price;
  const escrow = info.escrow > 0n ? info.escrow : stored.escrow;
  const finalized = onchain.outcome !== 0;
  return {
    id: stored.id,
    saleId: stored.saleId,
    price: stored.price,
    maxSpend: stored.maxSpend,
    deposit: escrow,
    funding: stored.funding,
    delegatedReveal: stored.delegatedReveal,
    status: bidStatus(bidStatusName(info.status), phase, saleOutcomeName(onchain.outcome), allocation.tokens, demanded),
    createdAt: stored.createdAt,
    tokensAllocated: allocation.tokens,
    spent: allocation.paid,
    refund: finalized ? escrow - allocation.paid : 0n,
  };
}

export async function listMyBids(ctx: ChainContext, saleId?: string): Promise<Bid[]> {
  const account = ctx.deps.session.current();
  if (!account) return [];
  const stored = readBids(account.secrets).filter((b) => saleId === undefined || b.saleId === saleId);
  const sales = new Map<string, Promise<{ onchain: OnchainSale; phase: SalePhase }>>();
  const bids = await Promise.all(stored.map((b) => toBid(ctx, b, sales)));
  return bids.sort((a, b) => b.createdAt - a.createdAt);
}

function findStored(ctx: ChainContext, bidId: string): StoredBid {
  const stored = readBids(ctx.requireAccount().secrets).find((b) => b.id.toLowerCase() === bidId.toLowerCase());
  if (!stored) throw new DataSourceError('not_found');
  return stored;
}

/**
 * Smallest approved note that can fund `withdrawn` in one withdrawal (one bid = one note), skipping notes
 * held by one-step jobs; or exactly `noteId` when a job reserved it.
 */
export function fundingNote(notes: readonly AccountNote[], asset: Asset, withdrawn: bigint, reserved: ReadonlySet<string>, noteId?: string): AccountNote {
  if (noteId !== undefined) {
    const chosen = notes.find((n) => n.id === noteId);
    if (!chosen || chosen.asset !== asset || chosen.balance < withdrawn) throw new DataSourceError('insufficient_vault');
    if (chosen.status !== 'approved') throw new DataSourceError(chosen.status === 'in_review' ? 'in_review' : 'insufficient_vault');
    return chosen;
  }
  const note = notes
    .filter((n) => n.asset === asset && n.status === 'approved' && n.balance >= withdrawn && !reserved.has(n.id))
    .sort((a, b) => (a.balance < b.balance ? -1 : a.balance > b.balance ? 1 : 0))[0];
  if (!note) throw new DataSourceError('insufficient_vault');
  return note;
}

/**
 * Commit a sealed bid. Vault funding: one note -> LaunchAdapter (relay target `launch`), refunds come back
 * as vault notes on precommitments from the account's own index line. Public funding: wallet `commit`.
 * Tokens and refund dust go to a fresh one-time address of this account. The preimage is stored in the
 * encrypted vault before anything is sent; with `delegateReveal` it is also sealed to the relay's key.
 */
export async function placeBid(ctx: ChainContext, request: BidRequest): Promise<Bid> {
  const { keys, secrets } = ctx.requireAccount();
  if (request.maxSpend <= 0n || request.price <= 0n) throw new DataSourceError('invalid_input');
  const { onchain, summary, nowSec } = await loadSale(ctx, request.saleId);
  const phase = PHASE[launchPhase(nowSec, onchain.commitEnd, onchain.revealEnd, saleOutcomeName(onchain.outcome))];
  if (phase !== 'commit') throw new DataSourceError('phase_closed');
  if (request.price < onchain.floorPrice) throw new DataSourceError('invalid_input', 'price is below the floor');
  const asset = assetOf(onchain);
  const units = UNIT_TABLE[asset];
  const info = await ctx.relayInfo();
  if (request.delegateReveal && info.sealedReveal === null) throw new DataSourceError('relay_rejected', 'the relay does not accept delegated reveals');
  const stealth = buildStealthSendFields(stealthMetaFromMaster(keys));
  const salt = randomSalt();
  const base = { chainId: BigInt(ctx.deps.chainId), sale: onchain.address, saleId: onchain.saleId, price: request.price, maxSpend: request.maxSpend, recipient: stealth.recipient, salt };
  let preimage: LaunchBidPreimage;
  let escrow: bigint;
  let fundingTx: `0x${string}` | null = null;
  const remember = async (pre: LaunchBidPreimage, esc: bigint): Promise<StoredBid> => {
    const stored: StoredBid = { id: launchBidCommitment(pre), saleId: onchain.saleId.toString(), sale: onchain.address, asset, price: pre.price, maxSpend: pre.maxSpend, recipient: pre.recipient, recipientEphemeral: stealth.ephemeralPubKey, refundPrecommitments: pre.refundPrecommitments, salt: pre.salt, escrow: esc, funding: request.funding, delegatedReveal: request.delegateReveal, createdAt: ctx.now() };
    await ctx.updateAccount((s) => withMeta(s, { launchBids: [...readBids(s).map(bidToJson), bidToJson(stored)] }));
    return stored;
  };
  let stored: StoredBid;
  if (request.funding === 'vault') {
    const config = await ctx.assetConfig(asset);
    const plan = await planPrivateBid({ maxSpend: request.maxSpend, units, feeFor: async (w) => launchRelayFee(w, (await ctx.quote(asset, 'launch', w)).feeBps, config.maxRelayFeeBps) });
    const note = fundingNote(await ctx.accountNotes(), asset, plan.withdrawn, reservedNoteIds(secrets), request.noteId);
    const refunds = await ctx.freshDepositSecrets(asset, refundNoteBound(plan.escrow, units, config.vettingFeeBps));
    preimage = { ...base, refundPrecommitments: refunds.map((r) => r.secrets.precommitment) };
    escrow = plan.escrow;
    stored = await remember(preimage, escrow);
    const withdrawal = buildFundBidWithdrawal({ adapter: launchAdapter(ctx), sale: onchain.address, commitment: stored.id, feeRecipient: info.relayer, relayFee: plan.relayFee });
    const next = deriveChangeSecrets(keys, note.label, BigInt(note.withdrawalCount));
    const proof = await ctx.prove(asset, note, plan.withdrawn, next, withdrawal);
    const view = await ctx.submit(buildRelayRequest({ target: 'launch', pool: note.pool, scope: note.scope, withdrawal, proof, gasDrop: false, delaySeconds: 0 }), { target: 'launch', purpose: 'launch_bid', createdAt: ctx.now(), executeAfter: ctx.now(), asset, amount: plan.withdrawn, recipient: null });
    if (request.delegateReveal) {
      const job = await ctx.deps.services.relay.waitForJob(view.jobId, { intervalMs: 2000, timeoutMs: 180_000 });
      if (job.state === 'failed' || !job.txHash) throw new DataSourceError('relay_rejected', job.error ?? job.state);
      fundingTx = job.txHash;
    }
  } else {
    const owner = ctx.requireWallet();
    escrow = escrowUnitsFor(request.maxSpend, units).total;
    const token = ctx.tokenOf(asset);
    const balance = token ? await ctx.deps.chain.getTokenBalance(token, owner) : await ctx.deps.chain.getNativeBalance(owner);
    if (balance < escrow) throw new DataSourceError('insufficient_wallet');
    preimage = { ...base, refundPrecommitments: [] };
    stored = await remember(preimage, escrow);
    const allowance = token ? await ctx.deps.chain.getAllowance(token, owner, onchain.address) : 0n;
    fundingTx = await ctx.sendWalletTxs(buildPublicCommitTxs({ sale: onchain.address, commitment: stored.id, escrow, quoteToken: token, allowance }));
  }
  if (request.delegateReveal && info.sealedReveal) {
    if (fundingTx && (await ctx.deps.chain.waitForReceipt(fundingTx)) !== 'success') throw new DataSourceError('tx_failed');
    await ctx.deps.services.relay.sealReveal(await sealReveal({ preimage, relayPublicKey: info.sealedReveal.publicKey }));
  }
  await ctx.updateAccount((s) => withMeta(s, { activity: [...readActivity(s).map(activityToJson), activityToJson({ id: `bid-${stored.id}`, kind: 'bid', module: 'launch', asset, amount: escrow, at: ctx.now(), status: 'pending', subject: summary ? `#${summary.id}` : `#${onchain.saleId}` })] }));
  ctx.emit(['bids', 'sales', 'notes', 'balances', 'activity']);
  return toBid(ctx, stored, new Map());
}

function launchAdapter(ctx: ChainContext): Address {
  const adapter = ctx.deployments.launchAdapter;
  if (!adapter) throw new DataSourceError('not_found', 'no LaunchAdapter in the deployments file');
  return adapter;
}

/** Self-reveal from the connected wallet (the wallet becomes visible as the revealer of this bid). */
export async function revealBid(ctx: ChainContext, bidId: string): Promise<Bid> {
  const stored = findStored(ctx, bidId);
  const sale = await getSale(ctx, stored.saleId);
  if (sale.phase !== 'reveal') throw new DataSourceError('phase_closed');
  ctx.requireWallet();
  await ctx.sendWalletTxs([buildRevealTx(preimageOf(ctx, stored))]);
  ctx.emit(['bids', 'sales']);
  return toBid(ctx, stored, new Map());
}

/** Claim after finalisation: tokens to the one-time address, refunds into the vault (vault-funded) plus dust. */
export async function claimBid(ctx: ChainContext, bidId: string): Promise<Bid> {
  const stored = findStored(ctx, bidId);
  const onchain = await ctx.deps.chain.getSale(stored.sale);
  if (onchain.outcome === 0) throw new DataSourceError('phase_closed');
  const status = bidStatusName((await ctx.deps.chain.getBid(stored.sale, stored.id)).status);
  if (status === 'claimed') throw new DataSourceError('phase_closed');
  ctx.requireWallet();
  const tx = status === 'revealed' ? buildClaimTx(stored.sale, stored.id, stored.refundPrecommitments) : buildRevealTx(preimageOf(ctx, stored), true);
  await ctx.sendWalletTxs([tx]);
  ctx.emit(['bids', 'notes', 'balances', 'activity']);
  return toBid(ctx, stored, new Map());
}

/** Vault cost of a sealed bid: the same plan `placeBid` uses (whole units, relay fee inside the cap). */
export async function quoteBid(ctx: ChainContext, saleId: string, maxSpend: bigint): Promise<BidQuote> {
  if (maxSpend <= 0n) throw new DataSourceError('invalid_input');
  const { onchain } = await loadSale(ctx, saleId);
  const asset = assetOf(onchain);
  const config = await ctx.assetConfig(asset);
  const plan = await planPrivateBid({ maxSpend, units: UNIT_TABLE[asset], feeFor: async (w) => launchRelayFee(w, (await ctx.quote(asset, 'launch', w)).feeBps, config.maxRelayFeeBps) });
  return { escrow: plan.escrow, withdrawn: plan.withdrawn, relayFee: plan.relayFee };
}

/**
 * Claim through the relay: it submits `claim(commitment, refundPrecommitments)` and pays the gas, so no
 * wallet of ours appears. Tokens go to the bid's one-time address, refunds come back as vault notes.
 */
export async function claimBidViaRelay(ctx: ChainContext, bidId: string): Promise<Bid> {
  const stored = findStored(ctx, bidId);
  const onchain = await ctx.deps.chain.getSale(stored.sale);
  if (onchain.outcome === 0) throw new DataSourceError('phase_closed');
  const status = bidStatusName((await ctx.deps.chain.getBid(stored.sale, stored.id)).status);
  if (status === 'claimed') return toBid(ctx, stored, new Map());
  if (status !== 'revealed') throw new DataSourceError('phase_closed', 'only revealed bids can be claimed through the relay');
  const task = await ctx.deps.services.relay.claimSale({ sale: stored.sale, commitment: stored.id, precommitments: stored.refundPrecommitments });
  if (task.state === 'failed') throw new DataSourceError('relay_rejected', task.error ?? 'claim failed');
  if (task.txHash && (await ctx.deps.chain.waitForReceipt(task.txHash)) !== 'success') throw new DataSourceError('tx_failed');
  ctx.emit(['bids', 'notes', 'balances', 'activity']);
  return toBid(ctx, stored, new Map());
}

/** Finalize with p* computed from the revealed entries (LAUNCH.md 5), confirmed by `previewFinalize`. */
export async function finalizeSale(ctx: ChainContext, saleId: string): Promise<Sale> {
  const { onchain, nowSec } = await loadSale(ctx, saleId);
  if (onchain.outcome !== 0 || nowSec < onchain.revealEnd) throw new DataSourceError('phase_closed');
  const entries = await ctx.deps.chain.getSaleEntries(onchain.address, onchain.entryCount);
  const price = clearingPriceFromEntries(entries, onchain.saleSupply, onchain.floorPrice);
  if (!(await ctx.deps.chain.previewFinalize(onchain.address, price))) throw new DataSourceError('tx_failed', 'the contract rejects the computed clearing price');
  ctx.requireWallet();
  await ctx.sendWalletTxs([buildFinalizeTx(onchain.address, price)]);
  ctx.emit(['sales', 'bids']);
  return getSale(ctx, saleId);
}

export async function collectSaleFees(ctx: ChainContext, saleId: string): Promise<Sale> {
  const { onchain } = await loadSale(ctx, saleId);
  if (onchain.lpTokenId === 0n) throw new DataSourceError('phase_closed');
  ctx.requireWallet();
  await ctx.sendWalletTxs([buildCollectFeesTx(factory(ctx), onchain.saleId)]);
  ctx.emit(['sales']);
  return getSale(ctx, saleId);
}

/** Create a sale from the connected wallet (the creator is public by design). */
export async function createSale(ctx: ChainContext, input: CreateSaleInput): Promise<Sale> {
  if (validateSaleInput(input).length > 0) throw new DataSourceError('invalid_input');
  const usdt = ctx.deployments.pools.USDT.asset;
  const { params, issues } = buildLaunchParams(
    {
      name: input.tokenName,
      symbol: input.tokenSymbol,
      quoteAsset: input.quoteAsset === 'BNB' ? zeroAddress : usdt,
      totalSupply: input.totalSupply,
      saleSupply: input.saleAmount,
      creatorShareBps: input.creatorShareBps,
      floorPrice: input.floorPrice,
      minRaise: input.minRaise,
      commitSeconds: input.commitHours * 3600,
      revealSeconds: input.revealHours * 3600,
      liquidityBps: input.liquidityBps,
      vestingSeconds: input.creatorVestDays * 86_400,
    },
    usdt,
  );
  if (!params || issues.length > 0) throw new DataSourceError('invalid_input', issues.join(','));
  ctx.requireWallet();
  const tx = buildCreateSaleTx(factory(ctx), params);
  const hash = await ctx.deps.wallet.sendTransaction(tx);
  const receipt = await ctx.deps.chain.waitForReceiptLogs(hash);
  if (receipt.status !== 'success') throw new DataSourceError('tx_failed');
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== factory(ctx).toLowerCase()) continue;
    try {
      const event = decodeEventLog({ abi: LAUNCH_FACTORY_ABI, topics: log.topics as [`0x${string}`, ...`0x${string}`[]], data: log.data });
      if (event.eventName === 'SaleDeployed') {
        ctx.emit(['sales']);
        const [onchain, nowSec] = await Promise.all([ctx.deps.chain.getSale(event.args.sale), ctx.deps.chain.getLatestTimestamp()]);
        return toSale(ctx, onchain, null, nowSec);
      }
    } catch {
      // Other factory events.
    }
  }
  throw new DataSourceError('tx_failed', 'SaleDeployed not found in the receipt');
}
