import { GIVE_ESCROW_ABI, GIVE_REGISTRY_ABI, SEALED_BOOK_ABI } from '@hushcross/core';
import { createPublicClient, http, type PublicClient, type Transport } from 'viem';
import type { Address } from '../data/types';
import type { BookLog, GiveLog, MarketsPort } from './marketsPort';
import { MAX_LOG_RANGE, chainFor } from './viemPort';

const BOOK_EVENTS = SEALED_BOOK_ABI.filter((item) => item.type === 'event');
const GIVE_EVENTS = GIVE_ESCROW_ABI.filter((item) => item.type === 'event');

const byPosition = <T extends { readonly block: bigint; readonly logIndex: number }>(a: T, b: T): number => (a.block === b.block ? a.logIndex - b.logIndex : a.block < b.block ? -1 : 1);

async function chunked<T>(fromBlock: bigint, toBlock: bigint, load: (from: bigint, to: bigint) => Promise<readonly T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let start = fromBlock; start <= toBlock; start += MAX_LOG_RANGE) {
    const end = start + MAX_LOG_RANGE - 1n < toBlock ? start + MAX_LOG_RANGE - 1n : toBlock;
    out.push(...(await load(start, end)));
  }
  return out;
}

/** MarketsPort over viem (same RPC as the ChainPort). */
export function createViemMarketsPort(options: { readonly chainId: number; readonly rpcUrl: string; readonly transport?: Transport }): MarketsPort {
  const chain = chainFor(options.chainId, options.rpcUrl);
  const client = createPublicClient({ chain, transport: options.transport ?? http(options.rpcUrl, { batch: { batchSize: 20 }, retryCount: 2 }) }) as PublicClient;

  return {
    async getBookEpoch(book, marketId, epoch) {
      const [head, tail, count] = await Promise.all([
        client.readContract({ address: book, abi: SEALED_BOOK_ABI, functionName: 'epochHead', args: [marketId, epoch] }),
        client.readContract({ address: book, abi: SEALED_BOOK_ABI, functionName: 'epochTail', args: [marketId, epoch] }),
        client.readContract({ address: book, abi: SEALED_BOOK_ABI, functionName: 'orderCount', args: [marketId, epoch] }),
      ]);
      return { status: head[0], voidReason: head[1], longSide: head[2], finalizedAt: head[3], price: head[4], volume: head[5], quoteVolume: tail[3], filledOrders: tail[4], orderCount: count };
    },
    async getOrderBrief(book, commitment) {
      const [epoch, side, validity, flags, vaultFunded, claimed, escrow, recipient] = await client.readContract({ address: book, abi: SEALED_BOOK_ABI, functionName: 'orderBrief', args: [commitment] });
      return { epoch, side, validity, flags, vaultFunded, claimed, escrow, recipient };
    },
    async getOrderPayment(book, commitment) {
      try {
        const p = await client.readContract({ address: book, abi: SEALED_BOOK_ABI, functionName: 'previewPayment', args: [commitment] });
        return { fill: p.fill, quoteAmount: p.quoteAmount, fee: p.fee, baseOut: p.baseOut, quoteOut: p.quoteOut, baseRefund: p.baseRefund, quoteRefund: p.quoteRefund };
      } catch {
        return null;
      }
    },
    async getReferencePrice(book, marketId) {
      try {
        return await client.readContract({ address: book, abi: SEALED_BOOK_ABI, functionName: 'referencePrice', args: [marketId] });
      } catch {
        return null;
      }
    },
    async getMinEscrow(book, marketId) {
      const [minQuote, minBase] = await client.readContract({ address: book, abi: SEALED_BOOK_ABI, functionName: 'minEscrow', args: [marketId] });
      return { minQuote, minBase };
    },
    async previewSettle(book, marketId, epoch, p) {
      const [code] = await client.readContract({ address: book, abi: SEALED_BOOK_ABI, functionName: 'preview', args: [marketId, epoch, p.pLow, p.pHigh, p.pivot, p.marginalLevel] });
      return code;
    },
    async previewNoCross(book, marketId, epoch) {
      return client.readContract({ address: book, abi: SEALED_BOOK_ABI, functionName: 'previewNoCross', args: [marketId, epoch] });
    },
    async getBookLogs(book: Address, fromBlock, toBlock) {
      const logs = await chunked(fromBlock, toBlock, (from, to) => client.getLogs({ address: book, events: BOOK_EVENTS, fromBlock: from, toBlock: to, strict: true }));
      const out: BookLog[] = [];
      for (const log of logs) {
        const base = { block: log.blockNumber, logIndex: log.logIndex, tx: log.transactionHash };
        switch (log.eventName) {
          case 'OrderCommitted':
            out.push({ ...base, kind: 'committed', marketId: BigInt(log.args.pairId), epoch: log.args.epoch, commitment: log.args.commitment });
            break;
          case 'OrderRevealed':
            out.push({ ...base, kind: 'revealed', commitment: log.args.commitment, validity: log.args.validity });
            break;
          case 'EpochSettled':
            out.push({ ...base, kind: 'settled', marketId: BigInt(log.args.pairId), epoch: log.args.epoch, price: log.args.clearingPrice, volume: log.args.baseVolume, quoteVolume: log.args.quoteVolume, filledOrders: log.args.filledOrders });
            break;
          case 'EpochVoided':
            out.push({ ...base, kind: 'voided', marketId: BigInt(log.args.pairId), epoch: log.args.epoch, reason: log.args.reason });
            break;
          case 'OrderCarried':
            out.push({ ...base, kind: 'carried', marketId: BigInt(log.args.pairId), fromEpoch: log.args.fromEpoch, toEpoch: log.args.toEpoch, commitment: log.args.commitment });
            break;
          case 'ReferenceRead':
            out.push({ ...base, kind: 'reference', marketId: log.args.marketId, epoch: log.args.epoch, price: log.args.price });
            break;
          case 'OrderClaimed':
            out.push({ ...base, kind: 'claimed', commitment: log.args.commitment, baseAmount: log.args.baseAmount, quoteAmount: log.args.quoteAmount });
            break;
          default:
            break;
        }
      }
      return out.sort(byPosition);
    },
    async getTransactionInput(hash) {
      return (await client.getTransaction({ hash })).input;
    },
    getCampaignCount: (registry) => client.readContract({ address: registry, abi: GIVE_REGISTRY_ABI, functionName: 'campaignCount' }),
    async getCampaign(registry, id) {
      const c = await client.readContract({ address: registry, abi: GIVE_REGISTRY_ABI, functionName: 'campaign', args: [id] });
      return { id, beneficiary: c.beneficiary, asset: c.asset, kind: c.kind, deadline: c.deadline, goal: c.goal, creator: c.creator, title: c.title, metadataURI: c.metadataURI };
    },
    async getCampaignFunds(escrow, id) {
      const f = await client.readContract({ address: escrow, abi: GIVE_ESCROW_ABI, functionName: 'funds', args: [id] });
      return { total: f.total, escrowed: f.escrowed, donations: f.donations, settled: f.settled, reached: f.reached, released: f.released };
    },
    async getDonation(escrow, id, index) {
      const d = await client.readContract({ address: escrow, abi: GIVE_ESCROW_ABI, functionName: 'donation', args: [id, index] });
      return { amount: d.amount, receiptHash: d.receiptHash, payout: d.payout, vaultFunded: d.vaultFunded, refunded: d.refunded };
    },
    async getDonationNotes(escrow, id, index) {
      return client.readContract({ address: escrow, abi: GIVE_ESCROW_ABI, functionName: 'donationNotes', args: [id, index] });
    },
    verifyReceipt: (escrow, secret, id) => client.readContract({ address: escrow, abi: GIVE_ESCROW_ABI, functionName: 'verifyReceipt', args: [secret, id] }),
    async getGiveLogs(escrow, fromBlock, toBlock) {
      const logs = await chunked(fromBlock, toBlock, (from, to) => client.getLogs({ address: escrow, events: GIVE_EVENTS, fromBlock: from, toBlock: to, strict: true }));
      const out: GiveLog[] = [];
      for (const log of logs) {
        const base = { block: log.blockNumber, logIndex: log.logIndex, tx: log.transactionHash };
        switch (log.eventName) {
          case 'CampaignCreated':
            out.push({ ...base, kind: 'created', campaignId: log.args.campaignId });
            break;
          case 'Donated':
            out.push({ ...base, kind: 'donated', campaignId: log.args.campaignId, amount: log.args.amount, receiptHash: log.args.receiptHash });
            break;
          case 'CampaignSettled':
            out.push({ ...base, kind: 'settled', campaignId: log.args.campaignId, reached: log.args.reached, total: log.args.total });
            break;
          case 'FundsReleased':
            out.push({ ...base, kind: 'released', campaignId: log.args.campaignId, amount: log.args.amount });
            break;
          case 'Refunded':
            out.push({ ...base, kind: 'refunded', campaignId: log.args.campaignId, amount: log.args.amount });
            break;
          default:
            break;
        }
      }
      return out.sort(byPosition);
    },
  };
}
