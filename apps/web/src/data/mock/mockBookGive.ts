import { bookEscrowRequired, escrowUnitsFor } from '@hushcross/core';
import { DataSourceError } from '../DataSource';
import type {
  Asset,
  Campaign,
  CreateCampaignInput,
  DataTopic,
  DonateRequest,
  DonateResult,
  Donation,
  EpochClearing,
  EpochInfo,
  ModuleId,
  MyDonation,
  Order,
  OrderPayout,
  OrderQuote,
  OrderRequest,
  Pair,
  ReceiptVerification,
  RevealedBook,
} from '../types';
import { UNIT_VALUES, WAD, splitIntoUnits } from '../units';
import { bookClearing, currentEpoch, orderStatus, syntheticDonations } from './mockMarkets';
import { REVIEW_MS, RELAY_SUBMIT_MS, type ActivityRecord, type CampaignRecord, type DonationRecord, type MockState, type OrderRecord } from './mockSeed';
import { createRng, DAY, hashString, randomAddress, randomHex } from './mockUtil';

type Rng = () => number;

/** What the Book / Give mock needs from the main mock (state, clock, vault helpers). */
export interface MockHost {
  readonly now: () => number;
  readonly rng: Rng;
  wait(): Promise<void>;
  state(): MockState;
  update(patch: Partial<MockState>, topics: readonly DataTopic[]): void;
  log(kind: ActivityRecord['kind'], module: ModuleId, asset: string, amount: bigint, resolveInMs: number, subject?: string): ActivityRecord;
  fund(asset: Asset, amount: bigint, funding: 'vault' | 'public', module: ModuleId, noteId?: string): void;
  appendVaultNote(asset: Asset, amount: bigint, approvedAt: number): void;
  credit(asset: Asset, amount: bigint): void;
  nextId(prefix: string): string;
}

const MOCK_RELAY_BPS = 20n;
const FEE_BPS = 5n;

/** Book and Give over the in-memory demo state. */
export class MockBookGive {
  constructor(private readonly host: MockHost) {}

  private get s(): MockState {
    return this.host.state();
  }

  /* ----------------------------------------------------------------- book */

  async listPairs(): Promise<readonly Pair[]> {
    await this.host.wait();
    const now = this.host.now();
    return this.s.pairs.map((pair) => {
      const last = bookClearing(pair, currentEpoch(now).epoch - 1, now);
      return { ...pair, lastClearingPrice: last.price ?? pair.lastClearingPrice };
    });
  }

  private findPair(id: string): Pair {
    const pair = this.s.pairs.find((p) => p.id === id);
    if (!pair) throw new DataSourceError('not_found');
    return pair;
  }

  async getEpoch(pairId: string): Promise<EpochInfo> {
    await this.host.wait();
    this.findPair(pairId);
    const info = currentEpoch(this.host.now());
    const mine = this.s.orders.filter((o) => o.pairId === pairId && o.epoch === info.epoch).length;
    const elapsed = this.host.now() - info.startsAt;
    return { pairId, ...info, sealedOrders: 4 + (info.epoch % 7) + Math.floor(elapsed / 40_000) + mine, settling: null };
  }

  private view(record: OrderRecord): Order {
    const pair = this.findPair(record.pairId);
    const now = this.host.now();
    const base = orderStatus(record, pair, now);
    const escrow = record.escrow ?? bookEscrowRequired(record.side, record.amount, record.limitPrice);
    const final = record.epoch < currentEpoch(now).epoch;
    const claimed = record.claimedAt !== undefined && record.claimedAt !== null;
    const payout = final ? payoutOf(record, base.filled, base.clearingPrice, escrow) : null;
    const unfilledStatus = record.rolledInto ? 'rolled' : claimed ? 'refunded' : 'unfilled';
    const status = final && base.filled === 0n ? unfilledStatus : base.status;
    return { ...base, status, escrow, claimable: final && !claimed, claimed, payout, delegatedReveal: record.funding === 'vault', rolledInto: record.rolledInto ?? null };
  }

  async listMyOrders(pairId?: string): Promise<readonly Order[]> {
    await this.host.wait();
    return this.s.orders
      .filter((o) => pairId === undefined || o.pairId === pairId)
      .map((o) => this.view(o))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  private quote(pair: Pair, request: OrderRequest): OrderQuote {
    const required = bookEscrowRequired(request.side, request.amount, request.limitPrice);
    const fee = request.side === 'buy' ? required - (required * 10_000n) / (10_000n + FEE_BPS) : (request.amount * request.limitPrice * FEE_BPS) / (WAD * 10_000n);
    const fundingAsset: Asset | null = request.side === 'buy' ? 'USDT' : pair.vaultSell ? 'BNB' : null;
    if (fundingAsset === null || request.funding === 'public') return { fundingAsset, required, escrow: required, withdrawn: 0n, relayFee: 0n, fee };
    let withdrawn = escrowUnitsFor(required, UNIT_VALUES[fundingAsset]).total;
    let relayFee = (withdrawn * MOCK_RELAY_BPS + 9_999n) / 10_000n;
    if (withdrawn - relayFee < required) {
      withdrawn = escrowUnitsFor(required + relayFee, UNIT_VALUES[fundingAsset]).total;
      relayFee = (withdrawn * MOCK_RELAY_BPS + 9_999n) / 10_000n;
    }
    return { fundingAsset, required, escrow: withdrawn - relayFee, withdrawn, relayFee, fee };
  }

  async quoteOrder(request: OrderRequest): Promise<OrderQuote> {
    await this.host.wait();
    if (request.amount <= 0n || request.limitPrice <= 0n) throw new DataSourceError('invalid_input');
    return this.quote(this.findPair(request.pairId), request);
  }

  async placeOrder(request: OrderRequest): Promise<Order> {
    await this.host.wait();
    const pair = this.findPair(request.pairId);
    const info = currentEpoch(this.host.now());
    if (info.phase !== 'commit') throw new DataSourceError('phase_closed');
    if (request.amount <= 0n || request.limitPrice <= 0n || request.limitPrice % pair.tick !== 0n || request.amount % pair.lot !== 0n) throw new DataSourceError('invalid_input');
    const q = this.quote(pair, request);
    if (request.funding === 'vault' && q.fundingAsset === null) throw new DataSourceError('invalid_input');
    if (request.funding === 'vault') this.host.fund(q.fundingAsset as Asset, q.withdrawn, 'vault', 'book', request.noteId);
    else if (request.side === 'buy') this.host.fund('USDT', q.escrow, 'public', 'book');
    else if (pair.vaultSell) this.host.fund('BNB', q.escrow, 'public', 'book');
    const order: OrderRecord = { id: this.host.nextId('ord'), pairId: pair.id, side: request.side, limitPrice: request.limitPrice, amount: request.amount, epoch: info.epoch, rollover: request.rollover, funding: request.funding, createdAt: this.host.now(), escrow: q.escrow, claimedAt: null, rolledInto: null };
    const entry = this.host.log('order', 'book', pair.base, request.amount, 4000, `${pair.base}/${pair.quote}`);
    this.host.update({ orders: [...this.s.orders, order], activity: [...this.s.activity, entry] }, ['orders', 'notes', 'balances', 'activity']);
    return this.view(order);
  }

  async listClearings(pairId: string, limit: number): Promise<readonly EpochClearing[]> {
    await this.host.wait();
    const pair = this.findPair(pairId);
    const now = this.host.now();
    const { epoch } = currentEpoch(now);
    return Array.from({ length: limit }, (_, i) => withReference(pair, bookClearing(pair, epoch - 1 - i, now)));
  }

  async settleEpoch(pairId: string, epoch: number): Promise<EpochClearing> {
    await this.host.wait();
    const pair = this.findPair(pairId);
    if (epoch >= currentEpoch(this.host.now()).epoch) throw new DataSourceError('phase_closed');
    return withReference(pair, bookClearing(pair, epoch, this.host.now()));
  }

  async claimOrder(orderId: string): Promise<Order> {
    await this.host.wait();
    const record = this.s.orders.find((o) => o.id === orderId);
    if (!record) throw new DataSourceError('not_found');
    const order = this.view(record);
    if (!order.claimable) return order;
    const pair = this.findPair(record.pairId);
    const payout = order.payout;
    if (payout) {
      const quote = payout.quoteOut + payout.quoteRefund;
      if (record.funding === 'vault') for (const unit of splitIntoUnits('USDT', quote)) this.host.appendVaultNote('USDT', unit, this.host.now() + REVIEW_MS);
      else this.host.credit('USDT', quote);
      const base = payout.baseOut + payout.baseRefund;
      if (pair.vaultSell && record.funding === 'vault') for (const unit of splitIntoUnits('BNB', base)) this.host.appendVaultNote('BNB', unit, this.host.now() + REVIEW_MS);
    }
    const next = { ...record, claimedAt: this.host.now() };
    this.host.update({ orders: this.s.orders.map((o) => (o.id === orderId ? next : o)) }, ['orders', 'notes', 'balances']);
    return this.view(next);
  }

  async rolloverOrder(orderId: string): Promise<Order> {
    const record = this.s.orders.find((o) => o.id === orderId);
    if (!record) throw new DataSourceError('not_found');
    const order = this.view(record);
    const rest = record.amount - order.filled;
    if (!order.claimed || rest <= 0n || record.rolledInto) throw new DataSourceError('phase_closed');
    const placed = await this.placeOrder({ pairId: record.pairId, side: record.side, limitPrice: record.limitPrice, amount: rest, rollover: record.rollover, funding: record.funding });
    this.host.update({ orders: this.s.orders.map((o) => (o.id === orderId ? { ...o, rolledInto: placed.id } : o)) }, ['orders']);
    return placed;
  }

  async getRevealedBook(pairId: string): Promise<RevealedBook | null> {
    await this.host.wait();
    const pair = this.findPair(pairId);
    const epoch = currentEpoch(this.host.now()).epoch - 1;
    const rng = createRng(hashString(pair.id) ^ epoch);
    const level = (bps: number): bigint => (pair.referencePrice * BigInt(10_000 + bps)) / 10_000n / pair.tick * pair.tick;
    const size = (): bigint => ((BigInt(1 + Math.floor(rng() * 40)) * WAD) / 10n / pair.lot) * pair.lot;
    const buys = [60, 35, 10, -15, -45].map((bps) => ({ price: level(bps + Math.floor(rng() * 10)), amount: size() }));
    const sells = [-55, -20, 5, 30, 70].map((bps) => ({ price: level(bps - Math.floor(rng() * 10)), amount: size() }));
    return { pairId, epoch, buys, sells, referencePrice: pair.referencePrice };
  }

  /* ----------------------------------------------------------------- give */

  private toCampaign(record: CampaignRecord): Campaign {
    const { baseRaised, baseCount, ...rest } = record;
    const mine = this.s.donations.filter((d) => d.campaignId === record.id);
    const raised = baseRaised + mine.reduce((sum, d) => sum + d.amount, 0n);
    const ended = record.deadline !== null && this.host.now() >= record.deadline;
    const status = record.kind === 'tip' || !ended ? 'active' : raised >= (record.goal ?? 0n) ? 'succeeded' : 'failed';
    return { ...rest, raised, donationCount: baseCount + mine.length, status, settled: record.kind === 'goal' && ended, released: status === 'succeeded', link: null };
  }

  private findCampaign(id: string): CampaignRecord {
    const record = this.s.campaigns.find((c) => c.id === id);
    if (!record) throw new DataSourceError('not_found');
    return record;
  }

  async listCampaigns(): Promise<readonly Campaign[]> {
    await this.host.wait();
    return this.s.campaigns.map((c) => this.toCampaign(c));
  }

  async getCampaign(id: string): Promise<Campaign> {
    await this.host.wait();
    return this.toCampaign(this.findCampaign(id));
  }

  async listDonations(campaignId: string, limit: number): Promise<readonly Donation[]> {
    await this.host.wait();
    const record = this.findCampaign(campaignId);
    const mine = this.s.donations.filter((d) => d.campaignId === record.id).map((d) => ({ id: d.id, campaignId: d.campaignId, amount: d.amount, at: d.at, hasReceipt: d.receiptSecret !== null }));
    return [...mine, ...syntheticDonations(record, 12, this.host.now())].sort((a, b) => b.at - a.at).slice(0, limit);
  }

  async donate(request: DonateRequest): Promise<DonateResult> {
    await this.host.wait();
    const record = this.findCampaign(request.campaignId);
    const campaign = this.toCampaign(record);
    if (campaign.status !== 'active') throw new DataSourceError('phase_closed');
    if (!UNIT_VALUES[campaign.asset].includes(request.unit) || request.count < 1 || request.count > 20) throw new DataSourceError('invalid_input');
    const amount = request.unit * BigInt(request.count);
    const funding = request.funding ?? 'vault';
    if (funding === 'vault' && request.noteIds && request.noteIds.length > 0) request.noteIds.forEach((id) => this.host.fund(campaign.asset, request.unit, 'vault', 'give', id));
    else this.host.fund(campaign.asset, amount, funding, 'give');
    const receiptSecret = request.withReceipt ? `hcr_${randomHex(this.host.rng, 32)}` : null;
    const donation: DonationRecord = { id: this.host.nextId('don'), campaignId: record.id, amount, at: this.host.now(), receiptSecret, funding, refundedAt: null };
    const entry = this.host.log('donation', 'give', campaign.asset, amount, RELAY_SUBMIT_MS, campaign.title);
    this.host.update({ donations: [...this.s.donations, donation], activity: [...this.s.activity, entry] }, ['campaigns', 'notes', 'balances', 'activity']);
    return { donation: { id: donation.id, campaignId: donation.campaignId, amount, at: donation.at, hasReceipt: receiptSecret !== null }, receiptSecret };
  }

  async createCampaign(input: CreateCampaignInput): Promise<Campaign> {
    await this.host.wait();
    const recipientOk = /^0x[0-9a-fA-F]{40}$/.test(input.recipient) || /^@[a-z0-9_]{3,20}$/.test(input.recipient);
    const goalOk = input.kind === 'tip' || (input.goal !== null && input.goal > 0n && input.deadlineDays !== null && input.deadlineDays >= 1 && input.deadlineDays <= 90);
    if (input.title.trim().length < 4 || !recipientOk || !goalOk) throw new DataSourceError('invalid_input');
    const record: CampaignRecord = {
      id: this.host.nextId('c'),
      kind: input.kind,
      title: input.title.trim(),
      story: input.story.trim(),
      recipient: input.recipient,
      escrowAddress: randomAddress(this.host.rng),
      asset: input.asset,
      goal: input.kind === 'goal' ? input.goal : null,
      deadline: input.kind === 'goal' && input.deadlineDays !== null ? this.host.now() + input.deadlineDays * DAY : null,
      createdAt: this.host.now(),
      createdByMe: true,
      baseRaised: 0n,
      baseCount: 0,
    };
    this.host.update({ campaigns: [record, ...this.s.campaigns] }, ['campaigns']);
    return this.toCampaign(record);
  }

  async verifyReceipt(campaignId: string, secret: string): Promise<ReceiptVerification> {
    await this.host.wait();
    const found = this.s.donations.find((d) => d.campaignId === campaignId && d.receiptSecret !== null && d.receiptSecret === secret.trim());
    if (!found) return { valid: false };
    return { valid: true, donation: { id: found.id, campaignId: found.campaignId, amount: found.amount, at: found.at, hasReceipt: true } };
  }

  private myDonation(d: DonationRecord): MyDonation {
    const campaign = this.toCampaign(this.findCampaign(d.campaignId));
    const refund = d.refundedAt ? 'refunded' : campaign.kind === 'goal' && campaign.status === 'failed' ? 'available' : 'none';
    return { id: d.id, campaignId: d.campaignId, amount: d.amount, at: d.at, funding: d.funding ?? 'vault', refund, receiptSecret: d.receiptSecret };
  }

  async listMyDonations(campaignId?: string): Promise<readonly MyDonation[]> {
    await this.host.wait();
    return this.s.donations.filter((d) => campaignId === undefined || d.campaignId === campaignId).map((d) => this.myDonation(d)).sort((a, b) => b.at - a.at);
  }

  async claimRefund(donationId: string): Promise<MyDonation> {
    await this.host.wait();
    const record = this.s.donations.find((d) => d.id === donationId);
    if (!record) throw new DataSourceError('not_found');
    const view = this.myDonation(record);
    if (view.refund !== 'available') throw new DataSourceError('phase_closed');
    const asset = this.toCampaign(this.findCampaign(record.campaignId)).asset;
    if (view.funding === 'vault') for (const unit of splitIntoUnits(asset, record.amount)) this.host.appendVaultNote(asset, unit, this.host.now() + REVIEW_MS);
    else this.host.credit(asset, record.amount);
    const next = { ...record, refundedAt: this.host.now() };
    this.host.update({ donations: this.s.donations.map((d) => (d.id === donationId ? next : d)) }, ['campaigns', 'notes', 'balances']);
    return this.myDonation(next);
  }

  async finishCampaign(campaignId: string): Promise<Campaign> {
    await this.host.wait();
    return this.toCampaign(this.findCampaign(campaignId));
  }
}

function withReference(pair: Pair, clearing: EpochClearing): EpochClearing {
  if (clearing.outcome === 'no_cross') return { ...clearing, referencePrice: null };
  const drift = BigInt((hashString(`${pair.id}:${clearing.epoch}`) % 600) - 300);
  return { ...clearing, referencePrice: (pair.referencePrice * (1_000_000n + drift)) / 1_000_000n };
}

function payoutOf(record: OrderRecord, filled: bigint, price: bigint | null, escrow: bigint): OrderPayout {
  if (filled === 0n || price === null) return record.side === 'buy' ? { baseOut: 0n, quoteOut: 0n, baseRefund: 0n, quoteRefund: escrow, fee: 0n } : { baseOut: 0n, quoteOut: 0n, baseRefund: escrow, quoteRefund: 0n, fee: 0n };
  if (record.side === 'buy') {
    const cost = (filled * price + WAD - 1n) / WAD;
    const fee = (cost * FEE_BPS) / 10_000n;
    return { baseOut: filled, quoteOut: 0n, baseRefund: 0n, quoteRefund: escrow > cost + fee ? escrow - cost - fee : 0n, fee };
  }
  const gross = (filled * price) / WAD;
  const fee = (gross * FEE_BPS) / 10_000n;
  return { baseOut: 0n, quoteOut: gross - fee, baseRefund: escrow > filled ? escrow - filled : 0n, quoteRefund: 0n, fee };
}
