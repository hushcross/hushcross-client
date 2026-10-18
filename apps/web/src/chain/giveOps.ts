import {
  ERC5564_ANNOUNCER_ABI,
  GIVE_ESCROW_ABI,
  NO_RECEIPT,
  STEALTH_SCHEME_ID,
  buildCreateCampaignTx,
  buildGiveReleaseTx,
  buildGiveSettleTx,
  buildGiveWithdrawal,
  buildPublicDonateTxs,
  buildRelayRequest,
  buildStealthSendFields,
  campaignIssues,
  campaignPhase,
  decodeCampaignStory,
  deriveChangeSecrets,
  encodeCampaignStory,
  giveRefundNoteCount,
  launchRelayFee,
  newReceiptSecret,
  parseMetaAddress,
  receiptBytes,
  receiptHashOf,
  stealthMetaFromMaster,
} from '@hushcross/core';
import { decodeEventLog, encodeFunctionData, getAddress, zeroAddress } from 'viem';
import { DataSourceError } from '../data/DataSource';
import type { Address, Asset, Campaign, CampaignStatus, CreateCampaignInput, DonateRequest, DonateResult, Donation, MyDonation, ReceiptVerification, RefundState } from '../data/types';
import type { ChainContext } from './context';
import { fundingNote } from './launchOps';
import { LogSync, syncFor } from './logSync';
import { campaignToJson, CAMPAIGNS_KEY, DONATIONS_KEY, donationToJson, readCampaigns, readDonations, type StoredDonation } from './marketMeta';
import type { CampaignFunds, GiveLog, OnchainCampaign } from './marketsPort';
import { activityToJson, readActivity, reservedNoteIds, withMeta } from './meta';
import { relayTask } from './relayTask';
import { resolveRecipient } from './sendOps';
import { UNIT_TABLE } from './vaultOps';

const LIST_LIMIT = 60;
const caches = new WeakMap<object, Map<string, LogSync<unknown>>>();

function escrow(ctx: ChainContext): Address {
  const e = ctx.deployments.giveEscrow;
  if (!e) throw new DataSourceError('not_found', 'no GiveEscrow in the deployments file');
  return e;
}

function registry(ctx: ChainContext): Address {
  const r = ctx.deployments.giveRegistry;
  if (!r) throw new DataSourceError('not_found', 'no GiveRegistry in the deployments file');
  return r;
}

function giveAdapter(ctx: ChainContext): Address {
  const a = ctx.deployments.giveAdapter;
  if (!a) throw new DataSourceError('not_found', 'no GiveAdapter in the deployments file');
  return a;
}

const assetOf = (c: OnchainCampaign): Asset => (c.asset.toLowerCase() === zeroAddress ? 'BNB' : 'USDT');

async function giveLogs(ctx: ChainContext): Promise<readonly GiveLog[]> {
  const e = escrow(ctx);
  const markets = ctx.requireMarkets();
  return syncFor<GiveLog>(caches, ctx, e, () => new LogSync(() => ctx.deps.chain.getBlockNumber(), (from, to) => markets.getGiveLogs(e, from, to), ctx.deployments.startBlock)).sync();
}

function statusOf(c: OnchainCampaign, funds: CampaignFunds, nowSec: bigint): CampaignStatus {
  const phase = campaignPhase({ kind: c.kind === 1 ? 'goal' : 'tip', deadline: c.deadline, goal: c.goal, total: funds.total, settled: funds.settled, reached: funds.reached, released: funds.released }, nowSec);
  if (phase === 'open') return 'active';
  if (phase === 'ended') return funds.total >= c.goal ? 'succeeded' : 'failed';
  return phase === 'missed' ? 'failed' : 'succeeded';
}

async function toCampaign(ctx: ChainContext, c: OnchainCampaign, funds: CampaignFunds, logs: readonly GiveLog[], nowSec: bigint): Promise<Campaign> {
  const created = logs.find((l) => l.kind === 'created' && l.campaignId === c.id);
  const account = ctx.deps.session.current();
  const mine = account ? readCampaigns(account.secrets).find((s) => s.id === c.id.toString()) : undefined;
  const wallet = ctx.deps.wallet.getAddress();
  const { story, link } = decodeCampaignStory(c.metadataURI);
  return {
    id: c.id.toString(),
    kind: c.kind === 1 ? 'goal' : 'tip',
    title: c.title,
    story,
    link,
    recipient: mine?.recipientLabel ?? c.beneficiary,
    escrowAddress: escrow(ctx),
    asset: assetOf(c),
    raised: funds.total,
    donationCount: Number(funds.donations),
    goal: c.kind === 1 ? c.goal : null,
    deadline: c.kind === 1 ? Number(c.deadline) * 1000 : null,
    createdAt: created ? await ctx.deps.chain.getBlockTime(created.block) : 0,
    status: statusOf(c, funds, nowSec),
    createdByMe: mine !== undefined || (wallet !== null && wallet.toLowerCase() === c.creator.toLowerCase()),
    settled: funds.settled,
    released: funds.released,
  };
}

async function load(ctx: ChainContext, id: bigint): Promise<{ readonly campaign: OnchainCampaign; readonly funds: CampaignFunds }> {
  const markets = ctx.requireMarkets();
  const count = await markets.getCampaignCount(registry(ctx));
  if (id < 1n || id > count) throw new DataSourceError('not_found');
  const [campaign, funds] = await Promise.all([markets.getCampaign(registry(ctx), id), markets.getCampaignFunds(escrow(ctx), id)]);
  return { campaign, funds };
}

const parseId = (id: string): bigint => {
  if (!/^\d+$/.test(id)) throw new DataSourceError('not_found');
  return BigInt(id);
};

export async function listCampaigns(ctx: ChainContext): Promise<Campaign[]> {
  if (!ctx.deployments.giveRegistry || !ctx.deployments.giveEscrow) return [];
  const markets = ctx.requireMarkets();
  const [count, logs, nowSec] = await Promise.all([markets.getCampaignCount(registry(ctx)), giveLogs(ctx), ctx.deps.chain.getLatestTimestamp()]);
  const ids = Array.from({ length: Number(count < BigInt(LIST_LIMIT) ? count : BigInt(LIST_LIMIT)) }, (_, i) => count - BigInt(i));
  return Promise.all(
    ids.map(async (id) => {
      const [campaign, funds] = await Promise.all([markets.getCampaign(registry(ctx), id), markets.getCampaignFunds(escrow(ctx), id)]);
      return toCampaign(ctx, campaign, funds, logs, nowSec);
    }),
  );
}

export async function getCampaign(ctx: ChainContext, id: string): Promise<Campaign> {
  const { campaign, funds } = await load(ctx, parseId(id));
  const [logs, nowSec] = await Promise.all([giveLogs(ctx), ctx.deps.chain.getLatestTimestamp()]);
  return toCampaign(ctx, campaign, funds, logs, nowSec);
}

/** Public history: amounts and times only (the escrow sees the adapter or a wallet, never the vault note). */
export async function listDonations(ctx: ChainContext, campaignId: string, limit: number): Promise<Donation[]> {
  const id = parseId(campaignId);
  const logs = (await giveLogs(ctx)).filter((l): l is Extract<GiveLog, { kind: 'donated' }> => l.kind === 'donated' && l.campaignId === id);
  const rows = logs.map((l, i) => ({ l, i })).reverse().slice(0, Math.max(0, limit));
  return Promise.all(rows.map(async ({ l, i }) => ({ id: `${campaignId}:${i}`, campaignId, amount: l.amount, at: await ctx.deps.chain.getBlockTime(l.block), hasReceipt: l.receiptHash.toLowerCase() !== NO_RECEIPT })));
}

/* -------------------------------------------------------------- donate */

async function remember(ctx: ChainContext, donation: StoredDonation): Promise<void> {
  await ctx.updateAccount((s) => withMeta(s, { [DONATIONS_KEY]: [...readDonations(s).filter((d) => d.id !== donation.id).map(donationToJson), donationToJson(donation)] }));
}

/**
 * Donate `count` x `unit`. Vault: each unit is one note -> GiveAdapter (relay target `give`); for a goal it
 * carries refund precommitments from the account's own index line, so a missed goal refunds privately into
 * the vault. Public: approve + `donate` from the wallet (refunds go to a one-time address of this account).
 * One optional receipt secret covers the whole donation (the escrow sums amounts per receipt hash).
 */
export async function donate(ctx: ChainContext, request: DonateRequest): Promise<DonateResult> {
  const { keys, secrets } = ctx.requireAccount();
  const id = parseId(request.campaignId);
  const { campaign, funds } = await load(ctx, id);
  const nowSec = await ctx.deps.chain.getLatestTimestamp();
  if (statusOf(campaign, funds, nowSec) !== 'active') throw new DataSourceError('phase_closed');
  const asset = assetOf(campaign);
  const units = UNIT_TABLE[asset];
  if (!units.includes(request.unit) || request.count < 1 || request.count > 20) throw new DataSourceError('invalid_input');
  const kind = campaign.kind === 1 ? 'goal' : 'tip';
  const receiptSecret = request.withReceipt ? newReceiptSecret() : null;
  const receiptHash = receiptSecret ? receiptHashOf(receiptSecret) : NO_RECEIPT;
  // The ephemeral key is kept with the donation so the payout address's key can be re-derived later.
  const payoutFields = buildStealthSendFields(stealthMetaFromMaster(keys));
  const payout = payoutFields.recipient;
  const payoutEphemeral = payoutFields.ephemeralPubKey;
  const funding = request.funding ?? 'vault';
  let credited = 0n;
  const at = ctx.now();
  if (funding === 'vault') {
    const info = await ctx.relayInfo();
    const config = await ctx.assetConfig(asset);
    const notes = await ctx.accountNotes();
    const taken = new Set(reservedNoteIds(secrets));
    for (let i = 0; i < request.count; i += 1) {
      const note = fundingNote(notes, asset, request.unit, taken, request.noteIds?.[i]);
      taken.add(note.id);
      const notesFor = giveRefundNoteCount(kind, request.unit, units, config.vettingFeeBps);
      const relayFee = launchRelayFee(request.unit, (await ctx.quote(asset, 'give', request.unit, { packets: notesFor })).feeBps, config.maxRelayFeeBps);
      const amount = request.unit - relayFee;
      const refunds = kind === 'goal' ? await ctx.freshDepositSecrets(asset, giveRefundNoteCount('goal', amount, units, config.vettingFeeBps)) : [];
      const precommitments = refunds.map((r) => r.secrets.precommitment);
      const stored: StoredDonation = { id: `don-${id}-${at}-${i}`, campaignId: request.campaignId, asset, amount, funding, precommitments, payout, payoutEphemeral, receiptSecret, index: null, at };
      await remember(ctx, stored);
      const withdrawal = buildGiveWithdrawal({ adapter: giveAdapter(ctx), campaignId: id, receiptHash, precommitments, dustRecipient: payout, feeRecipient: info.relayer, relayFee });
      const next = deriveChangeSecrets(keys, note.label, BigInt(note.withdrawalCount));
      const proof = await ctx.prove(asset, note, request.unit, next, withdrawal);
      await ctx.submit(buildRelayRequest({ target: 'give', pool: note.pool, scope: note.scope, withdrawal, proof, gasDrop: false, delaySeconds: 0 }), { target: 'give', purpose: 'give_donation', createdAt: ctx.now(), executeAfter: ctx.now(), asset, amount: request.unit, recipient: null });
      credited += amount;
    }
  } else {
    const owner = ctx.requireWallet();
    const amount = request.unit * BigInt(request.count);
    const token = asset === 'USDT' ? ctx.deployments.pools.USDT.asset : null;
    const balance = token ? await ctx.deps.chain.getTokenBalance(token, owner) : await ctx.deps.chain.getNativeBalance(owner);
    if (balance < amount) throw new DataSourceError('insufficient_wallet');
    const stored: StoredDonation = { id: `don-${id}-${at}-p`, campaignId: request.campaignId, asset, amount, funding, precommitments: [], payout, payoutEphemeral, receiptSecret, index: null, at };
    await remember(ctx, stored);
    const allowance = token ? await ctx.deps.chain.getAllowance(token, owner, escrow(ctx)) : 0n;
    await ctx.sendWalletTxs(buildPublicDonateTxs({ escrow: escrow(ctx), campaignId: id, amount, receiptHash, refundTo: payout, token, allowance }));
    if (kind === 'goal') await remember(ctx, { ...stored, index: await findDonationIndex(ctx, id, stored) });
    credited = amount;
  }
  await ctx.updateAccount((s) => withMeta(s, { activity: [...readActivity(s).map(activityToJson), activityToJson({ id: `donation-${id}-${at}`, kind: 'donation', module: 'give', asset, amount: credited, at, status: 'done', subject: campaign.title })] }));
  ctx.emit(['campaigns', 'notes', 'balances', 'activity']);
  return { donation: { id: `${request.campaignId}:${at}`, campaignId: request.campaignId, amount: credited, at, hasReceipt: receiptSecret !== null }, receiptSecret };
}

/** The escrow's index of a stored donation: its refund precommitments (vault) or its payout (public). */
async function findDonationIndex(ctx: ChainContext, id: bigint, stored: StoredDonation): Promise<number | null> {
  const markets = ctx.requireMarkets();
  const funds = await markets.getCampaignFunds(escrow(ctx), id);
  for (let i = funds.donations - 1n; i >= 0n && i >= funds.donations - 200n; i -= 1n) {
    if (stored.funding === 'vault') {
      const notes = await markets.getDonationNotes(escrow(ctx), id, i);
      if (notes.length > 0 && notes.length === stored.precommitments.length && notes.every((n, k) => n === stored.precommitments[k])) return Number(i);
    } else {
      const d = await markets.getDonation(escrow(ctx), id, i);
      if (d.payout.toLowerCase() === stored.payout.toLowerCase()) return Number(i);
    }
  }
  return null;
}

/* ------------------------------------------------------------ campaigns */

/**
 * Create from the connected wallet (the creator is public by design). A Hush ID recipient gets a one-time
 * address announced through ERC-5564 from the same wallet, so the recipient's scan finds the payouts.
 */
export async function createCampaign(ctx: ChainContext, input: CreateCampaignInput): Promise<Campaign> {
  ctx.requireWallet();
  const e = escrow(ctx);
  const nowSec = await ctx.deps.chain.getLatestTimestamp();
  const recipient = input.recipient.trim();
  const resolved = await resolveRecipient(ctx, recipient);
  if (!resolved.ok) throw new DataSourceError('invalid_input', `recipient: ${resolved.reason}`);
  let beneficiary: Address;
  let announce: { readonly ephemeralPubKey: `0x${string}`; readonly metadata: `0x${string}` } | null = null;
  if (resolved.recipient.kind === 'address') beneficiary = getAddress(resolved.recipient.address);
  else {
    const fields = buildStealthSendFields(parseMetaAddress(resolved.recipient.metaAddress));
    beneficiary = fields.recipient;
    announce = { ephemeralPubKey: fields.ephemeralPubKey, metadata: fields.metadata };
  }
  const draft = {
    kind: input.kind,
    asset: input.asset === 'BNB' ? null : ctx.deployments.pools.USDT.asset,
    beneficiary,
    goal: input.kind === 'goal' ? (input.goal ?? 0n) : 0n,
    deadline: input.kind === 'goal' ? nowSec + BigInt(Math.round((input.deadlineDays ?? 0) * 86_400)) : 0n,
    title: input.title.trim(),
    metadataURI: encodeCampaignStory(input.story),
  };
  const issues = campaignIssues(draft, nowSec);
  if (issues.length > 0) throw new DataSourceError('invalid_input', issues.join(','));
  if (announce) {
    await ctx.sendWalletTxs([{ to: ctx.deployments.announcer, data: encodeFunctionData({ abi: ERC5564_ANNOUNCER_ABI, functionName: 'announce', args: [STEALTH_SCHEME_ID, beneficiary, announce.ephemeralPubKey, announce.metadata] }), value: 0n }]);
  }
  const hash = await ctx.deps.wallet.sendTransaction(buildCreateCampaignTx(e, draft));
  const receipt = await ctx.deps.chain.waitForReceiptLogs(hash);
  if (receipt.status !== 'success') throw new DataSourceError('tx_failed');
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== e.toLowerCase()) continue;
    try {
      const event = decodeEventLog({ abi: GIVE_ESCROW_ABI, topics: log.topics as [`0x${string}`, ...`0x${string}`[]], data: log.data });
      if (event.eventName !== 'CampaignCreated') continue;
      const id = event.args.campaignId.toString();
      if (ctx.deps.session.current()) await ctx.updateAccount((s) => withMeta(s, { [CAMPAIGNS_KEY]: [...readCampaigns(s).map(campaignToJson), campaignToJson({ id, recipientLabel: recipient })] }));
      ctx.emit(['campaigns']);
      return getCampaign(ctx, id);
    } catch {
      // Not a GiveEscrow event we read.
    }
  }
  throw new DataSourceError('tx_failed', 'CampaignCreated not found in the receipt');
}

export async function verifyReceipt(ctx: ChainContext, campaignId: string, secret: string): Promise<ReceiptVerification> {
  const id = parseId(campaignId);
  let bytes: `0x${string}`;
  try {
    bytes = receiptBytes(secret);
  } catch {
    return { valid: false };
  }
  const total = await ctx.requireMarkets().verifyReceipt(escrow(ctx), bytes, id);
  if (total === 0n) return { valid: false };
  const hash = receiptHashOf(secret).toLowerCase();
  const log = [...(await giveLogs(ctx))].reverse().find((l) => l.kind === 'donated' && l.campaignId === id && l.receiptHash.toLowerCase() === hash);
  const at = log ? await ctx.deps.chain.getBlockTime(log.block) : ctx.now();
  return { valid: true, donation: { id: `${campaignId}:receipt`, campaignId, amount: total, at, hasReceipt: true } };
}

/* ------------------------------------------------------------- refunds */

async function refundState(ctx: ChainContext, stored: StoredDonation, campaign: OnchainCampaign, funds: CampaignFunds, nowSec: bigint): Promise<RefundState> {
  if (campaign.kind !== 1) return 'none';
  const status = statusOf(campaign, funds, nowSec);
  if (status !== 'failed') return 'none';
  const index = stored.index ?? (await findDonationIndex(ctx, campaign.id, stored));
  if (index === null) return 'pending';
  const onchain = await ctx.requireMarkets().getDonation(escrow(ctx), campaign.id, BigInt(index));
  return onchain.refunded ? 'refunded' : 'available';
}

export async function listMyDonations(ctx: ChainContext, campaignId?: string): Promise<MyDonation[]> {
  const account = ctx.deps.session.current();
  if (!account || !ctx.deployments.giveEscrow) return [];
  const stored = readDonations(account.secrets).filter((d) => campaignId === undefined || d.campaignId === campaignId);
  const nowSec = await ctx.deps.chain.getLatestTimestamp();
  const cache = new Map<string, Promise<{ campaign: OnchainCampaign; funds: CampaignFunds }>>();
  const rows = await Promise.all(
    stored.map(async (d): Promise<MyDonation> => {
      let entry = cache.get(d.campaignId);
      if (!entry) {
        entry = load(ctx, BigInt(d.campaignId));
        cache.set(d.campaignId, entry);
      }
      const { campaign, funds } = await entry;
      return { id: d.id, campaignId: d.campaignId, amount: d.amount, at: d.at, funding: d.funding, refund: await refundState(ctx, d, campaign, funds, nowSec), receiptSecret: d.receiptSecret };
    }),
  );
  return rows.sort((a, b) => b.at - a.at);
}

/** Missed goal: `refund(id, index)` through the relay when it offers Give refunds, otherwise from the wallet. */
export async function claimRefund(ctx: ChainContext, donationId: string): Promise<MyDonation> {
  const stored = readDonations(ctx.requireAccount().secrets).find((d) => d.id === donationId);
  if (!stored) throw new DataSourceError('not_found');
  const id = BigInt(stored.campaignId);
  const { campaign, funds } = await load(ctx, id);
  const nowSec = await ctx.deps.chain.getLatestTimestamp();
  if (statusOf(campaign, funds, nowSec) !== 'failed') throw new DataSourceError('phase_closed');
  if (!funds.settled) throw new DataSourceError('phase_closed', 'the campaign has to be closed first');
  const index = stored.index ?? (await findDonationIndex(ctx, id, stored));
  if (index === null) throw new DataSourceError('not_found', 'donation not found in the escrow');
  if (stored.index === null) await remember(ctx, { ...stored, index });
  const onchain = await ctx.requireMarkets().getDonation(escrow(ctx), id, BigInt(index));
  if (!onchain.refunded) {
    const task = await relayTask(() => ctx.deps.services.relay.refundGive({ campaignId: id, index: BigInt(index) }));
    if (task === null) {
      // This relay offers no Give refunds. A vault donation must not be tied to the wallet; a public one may refund from it.
      if (stored.funding === 'vault') throw new DataSourceError('relay_rejected', 'the relay does not offer Give refunds');
      ctx.requireWallet();
      await ctx.sendWalletTxs([{ to: escrow(ctx), data: encodeFunctionData({ abi: GIVE_ESCROW_ABI, functionName: 'refund', args: [id, BigInt(index)] }), value: 0n }]);
    } else {
      const done = task.txHash || task.state === 'failed' ? task : await ctx.deps.services.relay.waitForTask(task.id, { intervalMs: 2000, timeoutMs: 120_000 });
      if (done.state === 'failed' || !done.txHash) throw new DataSourceError('relay_rejected', done.error ?? 'refund failed');
      if ((await ctx.deps.chain.waitForReceipt(done.txHash)) !== 'success') throw new DataSourceError('tx_failed');
    }
  }
  ctx.emit(['campaigns', 'notes', 'balances']);
  const [after] = await listMyDonations(ctx, stored.campaignId).then((rows) => rows.filter((r) => r.id === donationId));
  if (!after) throw new DataSourceError('not_found');
  return after;
}

/** After the deadline: `settle`, then `release` when the goal was reached (anyone may; a public action). */
export async function finishCampaign(ctx: ChainContext, campaignId: string): Promise<Campaign> {
  const id = parseId(campaignId);
  const { campaign, funds } = await load(ctx, id);
  const nowSec = await ctx.deps.chain.getLatestTimestamp();
  if (campaign.kind !== 1 || nowSec < campaign.deadline || funds.released) throw new DataSourceError('phase_closed');
  ctx.requireWallet();
  if (!funds.settled) await ctx.sendWalletTxs([buildGiveSettleTx(escrow(ctx), id)]);
  const after = await ctx.requireMarkets().getCampaignFunds(escrow(ctx), id);
  if (after.reached && !after.released) await ctx.sendWalletTxs([buildGiveReleaseTx(escrow(ctx), id)]);
  ctx.emit(['campaigns']);
  return getCampaign(ctx, campaignId);
}
