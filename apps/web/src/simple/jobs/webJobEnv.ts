import { JobAttentionError, JobWaitError, type Job, type JobEnv, type JobNote, type PrivacyStatus, type SaleProgress, type WorkItem } from '@hushcross/core';
import { isDataSourceError, type DataSource } from '../../data/DataSource';
import { assessPrivacy, type PrivacyThresholds } from '../../data/privacyCheck';
import type { Asset, BidStatus, PrivacyAction } from '../../data/types';
import { orderParams } from '../../data/bookJobs';
import { donateParams, giftParams, saleParams, sendParams } from './drafts';

export interface WebJobEnvOptions {
  readonly source: DataSource;
  readonly thresholds: () => PrivacyThresholds;
  readonly now?: () => number;
}

/** A data-source failure that certainly did not move funds becomes a question for the user. */
function attentionFor(error: unknown): never {
  if (isDataSourceError(error)) {
    if (error.code === 'wallet_required' || error.code === 'wrong_network') throw new JobAttentionError('wallet_needed', error.message);
    if (error.code === 'insufficient_wallet') throw new JobAttentionError('wallet_funds', error.message);
    if (error.code === 'relay_rejected') throw new JobAttentionError('relay_failed', error.message);
    if (error.code === 'insufficient_vault' || error.code === 'in_review') throw new JobAttentionError('note_gone', error.message);
    if (error.code === 'phase_closed') throw new JobAttentionError('phase_closed', error.message);
    if (error.code === 'invalid_input' || error.code === 'not_found') throw new JobAttentionError('error', error.message);
  }
  throw error;
}

/** Proving and relaying a Book order must fit inside what is left of the commit window. */
const ORDER_COMMIT_MARGIN_MS = 120_000;

const ACTION: Readonly<Record<Job['kind'], PrivacyAction>> = { send: 'send', gift: 'gift_create', sale: 'order', donate: 'withdraw', order: 'order' };

const BID: Readonly<Record<BidStatus, SaleProgress['bid']>> = {
  sealed: 'sealed',
  revealed: 'revealed',
  won: 'revealed',
  partial: 'revealed',
  lost: 'revealed',
  unrevealed: 'unrevealed',
  claimed: 'claimed',
  refunded: 'claimed',
};

/**
 * `JobEnv` over the web `DataSource` (mock or chain). Wallet deposits only happen for jobs the user is
 * looking at right now (created or retried in this tab): a job resumed in the background never pops up
 * a wallet; it asks for attention instead.
 */
export class WebJobEnv implements JobEnv {
  private readonly interactive = new Set<string>();
  private readonly source: DataSource;

  constructor(private readonly options: WebJobEnvOptions) {
    this.source = options.source;
  }

  /** Allow wallet prompts for this job (it was just created or the user pressed "continue"). */
  allowWallet(jobId: string): void {
    this.interactive.add(jobId);
  }

  now(): number {
    return (this.options.now ?? Date.now)();
  }

  async listNotes(): Promise<readonly JobNote[]> {
    const notes = await this.source.listNotes();
    return notes.map((n) => ({ id: n.id, asset: n.asset, balance: n.amount, status: n.status }));
  }

  async deposit(job: Job, deposits: readonly { readonly unit: bigint; readonly count: number }[]): Promise<{ readonly txHash: string; readonly noteIds: readonly string[] }> {
    if (!this.interactive.has(job.id)) throw new JobAttentionError('wallet_needed', 'confirm from this device');
    const account = await this.source.getAccount();
    if (account.publicAddress === null) {
      try {
        await this.source.connectWallet();
      } catch (error: unknown) {
        attentionFor(isDataSourceError(error) ? error : new JobAttentionError('wallet_needed'));
      }
    }
    const noteIds: string[] = [];
    let txHash = '';
    for (const [i, d] of deposits.entries()) {
      try {
        const result = await this.source.deposit({ asset: job.asset as Asset, unit: d.unit, count: d.count });
        noteIds.push(...result.notes.map((n) => n.id));
        txHash = result.txHash;
      } catch (error: unknown) {
        // Only the first deposit can fail "cleanly"; after one went out, let the runner ask.
        if (i === 0) attentionFor(error);
        throw error;
      }
    }
    return { txHash, noteIds };
  }

  async privacy(job: Job): Promise<PrivacyStatus> {
    const thresholds = this.options.thresholds();
    const send = job.kind === 'send' ? sendParams(job) : null;
    const recipientAddress = send?.recipient.kind === 'address' ? send.recipient.address : null;
    const context = await this.source.getPrivacyContext({
      action: ACTION[job.kind],
      asset: job.asset as Asset,
      units: [...job.pieces],
      recipientAddress,
      relayDelayMinutes: send?.relayDelayMinutes ?? 0,
      noteIds: job.noteIds.filter((id): id is string => id !== null),
    });
    const assessment = assessPrivacy(context, thresholds);
    const mixed = context.notes.reduce((min, f) => Math.min(min, f.mixedAfter), Number.POSITIVE_INFINITY);
    const youngest = context.notes.reduce((min, f) => Math.min(min, f.ageMs), Number.POSITIVE_INFINITY);
    const ageNeed = thresholds.ageWeakMinutes * 60_000;
    const readyAt = Number.isFinite(youngest) && youngest < ageNeed ? this.now() + (ageNeed - youngest) : null;
    return { level: assessment.level, mixed: Number.isFinite(mixed) ? mixed : 0, needed: thresholds.anonymityWeak, readyAt };
  }

  async mark(job: Job, item: WorkItem): Promise<string | null> {
    const id = this.noteFor(job, item);
    if (id === null) return null;
    const note = (await this.listNotes()).find((n) => n.id === id);
    return note ? `${note.balance.toString()}:${note.status}` : 'missing';
  }

  async submit(job: Job, item: WorkItem, index: number): Promise<{ readonly ref: string; readonly outputs?: Record<string, string | string[]> }> {
    try {
      return await this.submitOnce(job, item, index);
    } catch (error: unknown) {
      return attentionFor(error);
    }
  }

  private async submitOnce(job: Job, item: WorkItem, index: number): Promise<{ readonly ref: string; readonly outputs?: Record<string, string | string[]> }> {
    const asset = job.asset as Asset;
    if (job.kind === 'send') {
      const params = sendParams(job);
      if (!params) throw new JobAttentionError('error', 'recipient missing');
      const piece = job.pieces[index] as bigint;
      const largest = job.pieces.indexOf(job.pieces.reduce((max, p) => (p > max ? p : max), 0n));
      const noteId = job.noteIds[index];
      if (!noteId) throw new JobAttentionError('note_gone');
      const relay = await this.source.send({ recipient: params.recipient, asset, units: [piece], relayDelayMinutes: params.relayDelayMinutes, gasDrop: params.gasDrop && index === largest, noteIds: [noteId] });
      return { ref: relay.id };
    }
    if (job.kind === 'donate') {
      const params = donateParams(job);
      const noteId = job.noteIds[index];
      if (!noteId) throw new JobAttentionError('note_gone');
      const result = await this.source.donate({ campaignId: params.campaignId, unit: job.pieces[index] as bigint, count: 1, withReceipt: false, funding: 'vault', noteIds: [noteId] });
      return { ref: result.donation.id };
    }
    if (job.kind === 'order') {
      const p = orderParams(job);
      const noteId = job.noteIds[0];
      if (!noteId) throw new JobAttentionError('note_gone');
      // The commitment names its epoch: wait for a fresh commit window rather than miss this one.
      const epoch = await this.source.getEpoch(p.pairId);
      if (epoch.phase !== 'commit' || epoch.commitEndsAt - this.now() < ORDER_COMMIT_MARGIN_MS) throw new JobWaitError('commit_window');
      const order = await this.source.placeOrder({ pairId: p.pairId, side: p.side, limitPrice: p.limitPrice, amount: p.amount, rollover: p.rollover, funding: 'vault', noteId });
      return { ref: order.id, outputs: { orderId: order.id } };
    }
    if (job.kind === 'gift') {
      const p = giftParams(job);
      const gift = await this.source.createGift({ mode: p.mode, asset, unit: p.unit, units: p.units, packets: p.mode === 'single' ? 1 : p.packets, expiryHours: p.expiryHours, message: p.message, funding: 'vault', noteIds: job.noteIds.filter((id): id is string => id !== null) });
      return { ref: gift.id, outputs: { giftId: gift.id, links: [...gift.links] } };
    }
    const p = saleParams(job);
    const noteId = job.noteIds[0];
    if (!noteId) throw new JobAttentionError('note_gone');
    const bid = await this.source.placeBid({ saleId: p.saleId, price: p.price, maxSpend: p.maxSpend, funding: 'vault', delegateReveal: true, noteId });
    void item;
    return { ref: bid.id, outputs: { bidId: bid.id } };
  }

  /**
   * Did an interrupted submission land? Sends: the note changed since `mark`, or the relay job is in the
   * local list. Gifts and bids are written to the vault before anything is sent, so they are found by
   * their details.
   */
  async recover(job: Job, item: WorkItem, index: number): Promise<string | null> {
    const taken = new Set(job.work.flatMap((w) => (w.ref ? [w.ref] : [])));
    if (job.kind === 'send' || job.kind === 'donate') {
      const current = await this.mark(job, item);
      if (item.mark !== undefined && current !== item.mark) return `landed:${index}`;
      if (job.kind === 'donate') return null;
      const piece = job.pieces[index] as bigint;
      const since = job.timeline.find((e) => e.step === 'submit')?.at ?? job.createdAt;
      const relayJobs = await this.source.listRelayJobs();
      const found = relayJobs.find((r) => r.createdAt >= since - 1000 && r.amount === piece && r.asset === job.asset && !taken.has(r.id));
      return found?.id ?? null;
    }
    if (job.kind === 'gift') {
      const p = giftParams(job);
      const gifts = await this.source.listMyGifts();
      const found = gifts.find((g) => g.createdAt >= job.createdAt && g.total === p.unit * BigInt(p.units) && g.asset === job.asset && !taken.has(g.id));
      return found?.id ?? null;
    }
    if (job.kind === 'order') {
      const p = orderParams(job);
      const orders = await this.source.listMyOrders(p.pairId);
      const found = orders.find((o) => o.createdAt >= job.createdAt && o.limitPrice === p.limitPrice && o.amount === p.amount && o.side === p.side && o.funding === 'vault' && !taken.has(o.id));
      return found?.id ?? null;
    }
    const p = saleParams(job);
    const bids = await this.source.listMyBids(p.saleId);
    const found = bids.find((b) => b.createdAt >= job.createdAt && b.price === p.price && b.maxSpend === p.maxSpend && b.funding === 'vault' && !taken.has(b.id));
    return found?.id ?? null;
  }

  async confirm(job: Job): Promise<'pending' | 'done' | 'failed'> {
    if (job.kind === 'send') {
      const refs = job.work.flatMap((w) => (w.ref && !w.ref.startsWith('landed:') ? [w.ref] : []));
      if (refs.length === 0) return 'done';
      const relayJobs = await this.source.listRelayJobs();
      const states = refs.map((ref) => relayJobs.find((r) => r.id === ref)?.status ?? 'submitted');
      if (states.includes('failed')) return 'failed';
      return states.every((st) => st === 'confirmed') ? 'done' : 'pending';
    }
    if (job.kind === 'order') {
      const orderId = job.work[0]?.ref;
      if (!orderId) return 'pending';
      const orders = await this.source.listMyOrders(orderParams(job).pairId);
      return orders.some((o) => o.id === orderId) ? 'done' : 'pending';
    }
    if (job.kind === 'sale') {
      const bidId = job.work[0]?.ref;
      if (!bidId) return 'pending';
      const bids = await this.source.listMyBids(saleParams(job).saleId);
      return bids.some((b) => b.id === bidId) ? 'done' : 'pending';
    }
    return 'done';
  }

  async saleProgress(job: Job): Promise<SaleProgress> {
    if (job.kind === 'order') return this.orderProgress(job);
    const p = saleParams(job);
    const [sale, bids] = await Promise.all([this.source.getSale(p.saleId), this.source.listMyBids(p.saleId)]);
    const bid = bids.find((b) => b.id === job.work[0]?.ref);
    return { phase: sale.phase, bid: bid ? BID[bid.status] : 'sealed' };
  }

  /** A Book order maps onto the sale phases: sealed -> revealed (relay) -> epoch final -> claimed. */
  private async orderProgress(job: Job): Promise<SaleProgress> {
    const orders = await this.source.listMyOrders(orderParams(job).pairId);
    const order = orders.find((o) => o.id === job.work[0]?.ref);
    if (!order) return { phase: 'commit', bid: 'sealed' };
    if (order.claimed) return { phase: 'claim', bid: 'claimed' };
    if (order.claimable) return { phase: 'claim', bid: order.status === 'sealed' ? 'unrevealed' : 'revealed' };
    const epoch = await this.source.getEpoch(order.pairId);
    if (order.epoch >= epoch.epoch) return { phase: epoch.phase, bid: order.status === 'sealed' ? 'sealed' : 'revealed' };
    return { phase: 'settle', bid: order.status === 'sealed' ? 'unrevealed' : 'revealed' };
  }

  async claim(job: Job): Promise<{ readonly ref: string }> {
    if (job.kind === 'order') {
      const orderId = job.work[0]?.ref;
      if (!orderId) throw new JobAttentionError('error', 'order missing');
      try {
        return { ref: (await this.source.claimOrder(orderId)).id };
      } catch (error: unknown) {
        return attentionFor(error);
      }
    }
    const bidId = job.work[0]?.ref;
    if (!bidId) throw new JobAttentionError('error', 'bid missing');
    try {
      const bid = await this.source.claimBidViaRelay(bidId);
      return { ref: bid.id };
    } catch (error: unknown) {
      return attentionFor(error);
    }
  }

  private noteFor(job: Job, item: WorkItem): string | null {
    if (!item.key.startsWith('piece:')) return null;
    return job.noteIds[Number(item.key.slice(6))] ?? null;
  }
}
