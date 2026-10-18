import { deriveGiftPacket, decodeGiftLink, nullifierHash, type PrivacyContext, type RecipientFacts, type SpentNoteFacts } from '@hushcross/core';
import type { Address, PrivacyContextRequest } from '../data/types';
import type { AccountNote, ChainContext } from './context';
import { readJobs } from './meta';
import { depositsAfter, depositsInTx, type PoolSnapshot } from './poolState';

const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

function choose(notes: readonly AccountNote[], request: PrivacyContextRequest): AccountNote[] {
  if (request.noteIds) return request.noteIds.flatMap((id) => notes.filter((n) => n.id === id));
  const pool = notes.filter((n) => n.asset === request.asset && n.status === 'approved' && n.balance > 0n);
  const used = new Set<string>();
  const chosen: AccountNote[] = [];
  for (const unit of request.units) {
    const note = pool.find((n) => !used.has(n.id) && n.balance === unit) ?? pool.find((n) => !used.has(n.id) && n.balance > unit);
    if (note) {
      used.add(note.id);
      chosen.push(note);
    }
  }
  return chosen;
}

async function recipientFacts(ctx: ChainContext, request: PrivacyContextRequest, depositors: readonly Address[]): Promise<RecipientFacts> {
  if (request.recipientAddress === null) return request.action === 'send' ? { kind: 'stealth' } : { kind: 'none' };
  const address = request.recipientAddress;
  const wallet = ctx.deps.wallet.getAddress();
  let firstFundingFromOwnDeposit: boolean | null = null;
  const funding = await ctx.deps.chain.getFirstTokenFunding(ctx.deployments.pools.USDT.asset, address);
  if (funding.kind === 'found') firstFundingFromOwnDeposit = depositors.some((d) => same(d, funding.from)) || (wallet !== null && same(wallet, funding.from));
  return {
    kind: 'address',
    ownDepositAddress: depositors.some((d) => same(d, address)),
    ownPublicWallet: wallet !== null && same(wallet, address),
    firstFundingFromOwnDeposit,
  };
}

/** SPEC 2.1 facts from chain data and local history only; the rating happens in core. */
export async function getPrivacyContext(ctx: ChainContext, request: PrivacyContextRequest): Promise<PrivacyContext> {
  const account = ctx.deps.session.current();
  const now = ctx.now();
  const snaps = await ctx.snapshots();
  const notes = account ? await ctx.accountNotes() : [];
  const depositors = [...new Set(notes.map((n) => n.depositor))];
  const recipient = await recipientFacts(ctx, request, depositors);
  const prior = account && request.recipientAddress ? readJobs(account.secrets).filter((j) => j.recipient?.kind === 'address' && same(j.recipient.address, request.recipientAddress ?? '')).length : 0;

  if (request.action === 'gift_claim' && request.giftSecret) {
    const facts = await giftFacts(ctx, request.giftSecret, snaps);
    return { notes: facts ? [facts] : [], total: facts?.amount ?? 0n, sameDepositAllUnits: false, recipient, relayDelayMinutes: request.relayDelayMinutes, priorWithdrawalsToRecipient: prior };
  }

  const chosen = choose(notes, request);
  const facts: SpentNoteFacts[] = await Promise.all(
    chosen.map(async (n) => {
      const snap = snaps[n.asset];
      const created = await ctx.deps.chain.getBlockTime(n.depositBlock).catch(() => now);
      return { mixedAfter: depositsAfter(snap, n.depositBlock, n.depositLogIndex), ageMs: now - created, amount: n.balance, depositTotal: depositsInTx(snap, n.depositTx).reduce((s, d) => s + d.value, 0n) };
    }),
  );
  const txs = new Set(chosen.map((n) => n.depositTx));
  const [onlyTx] = [...txs];
  const siblings = onlyTx === undefined ? [] : notes.filter((n) => n.depositTx === onlyTx);
  const sameDepositAllUnits = recipient.kind === 'address' && txs.size === 1 && siblings.length >= 2 && siblings.every((s) => chosen.some((c) => c.id === s.id));
  return { notes: facts, total: request.units.reduce((s, u) => s + u, 0n), sameDepositAllUnits, recipient, relayDelayMinutes: request.relayDelayMinutes, priorWithdrawalsToRecipient: prior };
}

async function giftFacts(ctx: ChainContext, fragment: string, snaps: Record<'BNB' | 'USDT', PoolSnapshot>): Promise<SpentNoteFacts | null> {
  try {
    const payload = await decodeGiftLink(fragment);
    const asset = ctx.assetOfScope(payload.scope);
    if (!asset) return null;
    const snap = snaps[asset];
    const spent = new Set(snap.withdrawals.map((w) => w.spentNullifier));
    for (let i = 0; i < payload.packetCount; i += 1) {
      const packet = deriveGiftPacket(payload.giftSecret, payload.scope, BigInt(i));
      const deposit = snap.deposits.find((d) => d.precommitment === packet.precommitment);
      if (!deposit) continue;
      if (spent.has(nullifierHash(packet.nullifier))) continue;
      const created = await ctx.deps.chain.getBlockTime(deposit.block).catch(() => ctx.now());
      return { mixedAfter: depositsAfter(snap, deposit.block, deposit.logIndex), ageMs: ctx.now() - created, amount: deposit.value, depositTotal: depositsInTx(snap, deposit.tx).reduce((s, d) => s + d.value, 0n) };
    }
    return null;
  } catch {
    return null;
  }
}
