import {
  buildGiftClaimToAddress,
  buildGiftClaimToVault,
  buildGiftFundingWithdrawal,
  buildRelayRequest,
  decodeGiftLink,
  deriveChangeSecrets,
  deriveGiftChange,
  encodeGiftLink,
  findGiftPacketStates,
  generateGiftSecret,
  giftLinkPath,
  giftPacketRefs,
  grossForNet,
  nullifierHash,
  personalPacketSecret,
  planGiftVaultFunding,
  planPrecommitmentDeposits,
  planReclaim,
  splitRedPacket,
  toBase64Url,
  type GiftLinkPayload,
  type GiftMode as CoreGiftMode,
  type GiftPacketStatus,
  type StoredGift,
} from '@hushcross/core';
import { DataSourceError } from '../data/DataSource';
import type { Asset, CreateGiftInput, Gift, GiftClaimResult, GiftDestination, GiftPacket, GiftView, Hex } from '../data/types';
import type { ChainContext } from './context';
import { activityToJson, readActivity, reservedNoteIds, withMeta } from './meta';
import { depositRecords, type PoolSnapshot } from './poolState';
import { gasDropFacts } from './sendOps';
import { UNIT_TABLE } from './vaultOps';

const CLAIM_WAIT_MS = 120_000;

function hex(bytes: Uint8Array): Hex {
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

function bytes(value: string): Uint8Array {
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  return Uint8Array.from(clean.match(/../g) ?? [], (b) => Number.parseInt(b, 16));
}

function packetStates(snap: PoolSnapshot, master: Uint8Array, mode: CoreGiftMode, count: number): GiftPacketStatus[] {
  const refs = giftPacketRefs(master, snap.scope, mode, count);
  const spent = new Set(snap.withdrawals.map((w) => w.spentNullifier));
  return findGiftPacketStates(refs, depositRecords(snap), spent);
}

export async function createGift(ctx: ChainContext, input: CreateGiftInput): Promise<Gift> {
  const packetsOk = input.mode === 'single' ? input.packets === 1 : input.packets >= 2 && input.packets <= 50;
  const valid = UNIT_TABLE[input.asset].includes(input.unit) && Number.isInteger(input.units) && input.units >= input.packets && input.units <= 100 && packetsOk && input.expiryHours >= 1 && input.expiryHours <= 168 && [...input.message].length <= 140;
  if (!valid) throw new DataSourceError('invalid_input');
  const { keys } = ctx.requireAccount();
  const pool = ctx.deployments.pools[input.asset];
  const amounts = (input.mode === 'single' ? [input.units] : splitRedPacket(input.units, input.packets)).map((u) => BigInt(u) * input.unit);
  const master = generateGiftSecret();
  const mode: CoreGiftMode = input.mode;
  const refs = giftPacketRefs(master, pool.scope, mode, amounts.length);
  const now = ctx.now();
  const expiry = Math.floor(now / 1000) + input.expiryHours * 3600;
  const config = await ctx.assetConfig(input.asset);

  if (input.funding === 'public') {
    const owner = ctx.requireWallet();
    const token = ctx.tokenOf(input.asset);
    const deposits = refs.map((ref, i) => ({ precommitment: ref.secrets.precommitment, gross: grossForNet(amounts[i] as bigint, config.vettingFeeBps) }));
    const total = deposits.reduce((s, d) => s + d.gross, 0n);
    const balance = token ? await ctx.deps.chain.getTokenBalance(token, owner) : await ctx.deps.chain.getNativeBalance(owner);
    if (balance < total) throw new DataSourceError('insufficient_wallet');
    const allowance = token ? await ctx.deps.chain.getAllowance(token, owner, ctx.deployments.entrypoint) : 0n;
    const plan = planPrecommitmentDeposits({ asset: token ? { kind: 'erc20', token } : { kind: 'native' }, entrypoint: ctx.deployments.entrypoint, deposits, allowance });
    await storeGift(ctx, input, master, amounts, expiry, now, []);
    await ctx.sendWalletTxs(plan.txs);
  } else {
    const reserved = reservedNoteIds(ctx.requireAccount().secrets);
    const allowed = input.noteIds ? new Set(input.noteIds) : null;
    const notes = (await ctx.accountNotes()).filter((n) => n.asset === input.asset && n.status === 'approved' && n.balance > 0n && (allowed ? allowed.has(n.id) : !reserved.has(n.id)));
    const total = amounts.reduce((s, a) => s + a, 0n);
    let bps = (await ctx.quote(input.asset, 'gift', total, { packets: amounts.length })).feeBps;
    let plan = planGiftVaultFunding({ packets: amounts, notes: notes.map((n) => ({ id: n.id, value: n.balance })), relayFeeBps: bps, vettingFeeBps: config.vettingFeeBps, minDeposit: config.minimumDeposit });
    const perCall = await Promise.all(plan.calls.map((c) => ctx.quote(input.asset, 'gift', c.withdrawn, { packets: c.values.length })));
    const needed = perCall.reduce((max, q) => (q.feeBps > max ? q.feeBps : max), bps);
    if (needed > bps) {
      bps = needed;
      plan = planGiftVaultFunding({ packets: amounts, notes: notes.map((n) => ({ id: n.id, value: n.balance })), relayFeeBps: bps, vettingFeeBps: config.vettingFeeBps, minDeposit: config.minimumDeposit });
    }
    const info = await ctx.relayInfo();
    await storeGift(ctx, input, master, amounts, expiry, now, []);
    for (const call of plan.calls) {
      const note = notes.find((n) => n.id === call.noteId);
      if (!note) throw new DataSourceError('insufficient_vault');
      const withdrawal = buildGiftFundingWithdrawal({ adapter: ctx.deployments.gift, call, precommitments: call.packetIndexes.map((i) => (refs[i] as (typeof refs)[number]).secrets.precommitment), feeRecipient: info.relayer, relayFeeBps: bps });
      const proof = await ctx.prove(input.asset, note, call.withdrawn, deriveChangeSecrets(keys, note.label, BigInt(note.withdrawalCount)), withdrawal);
      const request = buildRelayRequest({ target: 'gift', pool: pool.pool, scope: pool.scope, withdrawal, proof, gasDrop: false, delaySeconds: 0 });
      await ctx.submit(request, { target: 'gift', purpose: 'gift_fund', createdAt: ctx.now(), executeAfter: ctx.now(), asset: input.asset, amount: call.withdrawn, recipient: null });
    }
  }
  const total = amounts.reduce((s, a) => s + a, 0n);
  await ctx.updateAccount((s) => withMeta(s, { activity: [...readActivity(s).map(activityToJson), activityToJson({ id: `gift-${now.toString(36)}`, kind: 'gift', module: 'send', asset: input.asset, amount: total, at: now, status: 'pending' })] }));
  ctx.emit(['gifts', 'notes', 'balances', 'activity']);
  const stored = ctx.requireAccount().secrets.gifts.at(-1);
  if (!stored) throw new DataSourceError('network');
  return (await toGifts(ctx, [stored]))[0] as Gift;
}

async function storeGift(ctx: ChainContext, input: CreateGiftInput, master: Uint8Array, amounts: readonly bigint[], expiry: number, now: number, reclaimed: number[]): Promise<void> {
  const pool = ctx.deployments.pools[input.asset];
  const base: Omit<GiftLinkPayload, 'giftSecret' | 'packetCount'> = { version: 1, chainId: ctx.deps.chainId, scope: pool.scope, expiry, memo: input.message };
  const links =
    input.mode === 'personal'
      ? await Promise.all(amounts.map(async (_, i) => giftLinkPath(await encodeGiftLink({ ...base, giftSecret: personalPacketSecret(master, i), packetCount: 1 }))))
      : [giftLinkPath(await encodeGiftLink({ ...base, giftSecret: master, packetCount: amounts.length }))];
  const gift: StoredGift = {
    id: `gift-${toBase64Url(master.slice(0, 6))}`,
    mode: input.mode,
    asset: input.asset,
    chainId: ctx.deps.chainId,
    scope: pool.scope.toString(),
    secret: hex(master),
    packets: amounts.map(String),
    expiry,
    memo: input.message,
    funding: input.funding,
    createdAt: now,
    reclaimed,
    links,
  };
  await ctx.updateAccount((s) => ({ ...s, gifts: [...s.gifts, gift] }));
}

async function toGifts(ctx: ChainContext, gifts: readonly StoredGift[]): Promise<Gift[]> {
  const snaps = await ctx.snapshots();
  return Promise.all(
    gifts.map(async (g): Promise<Gift> => {
      const asset = g.asset as Asset;
      const snap = snaps[asset];
      const states = packetStates(snap, bytes(g.secret), g.mode, g.packets.length);
      const spentAt = new Map(snap.withdrawals.map((w) => [w.spentNullifier, w.block]));
      const packets = await Promise.all(
        states.map(async (st, index): Promise<GiftPacket> => {
          const reclaimed = g.reclaimed.includes(index);
          const block = st.spent ? spentAt.get(nullifierHash(st.ref.secrets.nullifier)) : undefined;
          const claimedAt = block === undefined ? null : await ctx.deps.chain.getBlockTime(block).catch(() => null);
          return { index, amount: BigInt(g.packets[index] ?? '0'), status: reclaimed ? 'reclaimed' : st.spent ? 'claimed' : 'unclaimed', claimedAt: reclaimed ? null : claimedAt };
        }),
      );
      return {
        id: g.id,
        mode: g.mode,
        asset,
        total: g.packets.reduce((s, p) => s + BigInt(p), 0n),
        message: g.memo,
        funding: g.funding,
        createdAt: g.createdAt,
        expiresAt: g.expiry * 1000,
        packets,
        links: g.links ?? [],
      };
    }),
  );
}

export async function listMyGifts(ctx: ChainContext): Promise<Gift[]> {
  const account = ctx.deps.session.current();
  if (!account) return [];
  return (await toGifts(ctx, account.secrets.gifts)).sort((a, b) => b.createdAt - a.createdAt);
}

export async function reclaimGift(ctx: ChainContext, id: string): Promise<Gift> {
  const { secrets } = ctx.requireAccount();
  const gift = secrets.gifts.find((g) => g.id === id);
  if (!gift) throw new DataSourceError('not_found');
  const asset = gift.asset as Asset;
  const snap = await ctx.pools[asset].sync();
  const states = packetStates(snap, bytes(gift.secret), gift.mode, gift.packets.length).filter((s) => !gift.reclaimed.includes(s.ref.index));
  const todo = planReclaim(states, gift.expiry * 1000, ctx.now());
  if (todo.length === 0) throw new DataSourceError('invalid_input', 'nothing left to reclaim');
  const fresh = await ctx.freshDepositSecrets(asset, todo.length);
  const done: number[] = [];
  for (const [i, state] of todo.entries()) {
    const target = fresh[i];
    if (!state.deposit || !target) continue;
    await claimPacket(ctx, asset, snap.scope, state, { kind: 'vault-precommitment', precommitment: target.secrets.precommitment }, 'gift_reclaim');
    done.push(state.ref.index);
  }
  await ctx.updateAccount((s) => ({ ...s, gifts: s.gifts.map((g) => (g.id === id ? { ...g, reclaimed: [...g.reclaimed, ...done] } : g)) }));
  ctx.emit(['gifts', 'notes', 'balances', 'activity']);
  const updated = ctx.requireAccount().secrets.gifts.find((g) => g.id === id);
  return (await toGifts(ctx, updated ? [updated] : [gift]))[0] as Gift;
}

interface OpenedLink {
  readonly payload: GiftLinkPayload;
  readonly asset: Asset;
  readonly states: GiftPacketStatus[];
  readonly snap: PoolSnapshot;
}

async function openLink(ctx: ChainContext, fragment: string): Promise<OpenedLink> {
  let payload: GiftLinkPayload;
  try {
    payload = await decodeGiftLink(fragment);
  } catch {
    throw new DataSourceError('not_found');
  }
  if (payload.chainId !== ctx.deps.chainId) throw new DataSourceError('wrong_network');
  const asset = ctx.assetOfScope(payload.scope);
  if (!asset) throw new DataSourceError('not_found');
  const snap = await ctx.pools[asset].sync();
  const mode: CoreGiftMode = payload.packetCount > 1 ? 'group' : 'single';
  return { payload, asset, snap, states: packetStates(snap, payload.giftSecret, mode, payload.packetCount) };
}

export async function openGift(ctx: ChainContext, fragment: string): Promise<GiftView> {
  const { payload, asset, states } = await openLink(ctx, fragment);
  const next = states.find((s) => s.funded && !s.spent);
  const left = states.filter((s) => !s.spent).length;
  let status: GiftView['status'];
  if (states.every((s) => s.funded && s.spent)) status = 'all_claimed';
  else if (ctx.now() > payload.expiry * 1000) status = 'expired';
  else if (!next?.deposit) status = 'in_review';
  else status = (await ctx.screenStatus(asset, next.deposit.label)) === 'approved' ? 'ready' : 'in_review';
  const amount = next?.deposit?.value ?? 0n;
  const drop = amount > 0n ? await gasDropFacts(ctx, asset, amount) : { offered: false, defaultOn: false, note: null };
  return {
    asset,
    mode: payload.packetCount > 1 ? 'group' : 'single',
    amount,
    message: payload.memo,
    status,
    packetsTotal: payload.packetCount,
    packetsLeft: left,
    expiresAt: payload.expiry * 1000,
    gasDropOffered: drop.offered,
    gasDropDefaultOn: drop.defaultOn,
    gasDropNote: drop.note,
  };
}

type ClaimTarget = { readonly kind: 'address'; readonly address: `0x${string}`; readonly gasDrop: boolean } | { readonly kind: 'vault-precommitment'; readonly precommitment: bigint };

async function claimPacket(ctx: ChainContext, asset: Asset, scope: bigint, state: GiftPacketStatus, target: ClaimTarget, purpose: 'gift_claim' | 'gift_reclaim'): Promise<{ readonly jobId: string; readonly gasDrop: bigint }> {
  const deposit = state.deposit;
  if (!deposit) throw new DataSourceError('in_review');
  const [info, config] = await Promise.all([ctx.relayInfo(), ctx.assetConfig(asset)]);
  const pool = ctx.deployments.pools[asset].pool;
  const note = { value: deposit.value, label: deposit.label, nullifier: state.ref.secrets.nullifier, secret: state.ref.secrets.secret };
  const next = deriveGiftChange(state.ref.linkSecret, deposit.label);
  if (target.kind === 'address') {
    const quote = await ctx.quote(asset, 'send', deposit.value, { gasDrop: target.gasDrop });
    const built = buildGiftClaimToAddress({ adapter: ctx.deployments.hushSend, packetValue: deposit.value, relayFeeBps: quote.feeBps, feeRecipient: info.relayer, recipient: target.address });
    const proof = await ctx.prove(asset, note, built.withdrawnValue, next, built.withdrawal);
    const view = await ctx.submit(buildRelayRequest({ target: 'send', pool, scope, withdrawal: built.withdrawal, proof, gasDrop: quote.gasDropApplied, delaySeconds: 0 }), { target: 'send', purpose, createdAt: ctx.now(), executeAfter: ctx.now(), asset, amount: deposit.value, recipient: { kind: 'address', address: target.address } });
    return { jobId: view.jobId, gasDrop: quote.gasDropWei };
  }
  const quote = await ctx.quote(asset, 'gift', deposit.value, { packets: 1 });
  const built = buildGiftClaimToVault({ adapter: ctx.deployments.gift, packetValue: deposit.value, relayFeeBps: quote.feeBps, feeRecipient: info.relayer, recipientPrecommitment: target.precommitment, minDeposit: config.minimumDeposit });
  const proof = await ctx.prove(asset, note, built.withdrawnValue, next, built.withdrawal);
  const view = await ctx.submit(buildRelayRequest({ target: 'gift', pool, scope, withdrawal: built.withdrawal, proof, gasDrop: false, delaySeconds: 0 }), { target: 'gift', purpose, createdAt: ctx.now(), executeAfter: ctx.now(), asset, amount: deposit.value, recipient: null });
  return { jobId: view.jobId, gasDrop: 0n };
}

export async function claimGift(ctx: ChainContext, fragment: string, destination: GiftDestination, wait: { readonly sleep?: (ms: number) => Promise<void> } = {}): Promise<GiftClaimResult> {
  const { asset, snap, states } = await openLink(ctx, fragment);
  const next = states.find((s) => s.funded && !s.spent);
  if (!next?.deposit) throw new DataSourceError(states.every((s) => s.spent) ? 'not_found' : 'in_review');
  if ((await ctx.screenStatus(asset, next.deposit.label)) !== 'approved') throw new DataSourceError('in_review');
  let target: ClaimTarget;
  if (destination.kind === 'address') {
    target = { kind: 'address', address: destination.address, gasDrop: destination.gasDrop };
  } else {
    const [fresh] = await ctx.freshDepositSecrets(asset, 1);
    if (!fresh) throw new DataSourceError('locked');
    target = { kind: 'vault-precommitment', precommitment: fresh.secrets.precommitment };
  }
  const { jobId, gasDrop } = await claimPacket(ctx, asset, snap.scope, next, target, 'gift_claim');
  const job = await ctx.deps.services.relay.waitForJob(jobId, { intervalMs: 2000, timeoutMs: CLAIM_WAIT_MS, ...(wait.sleep ? { sleep: wait.sleep } : {}) });
  if (job.state === 'failed' || !job.txHash) throw new DataSourceError(job.state === 'failed' ? 'tx_failed' : 'network');
  if (ctx.deps.session.current()) {
    await ctx.updateAccount((s) => withMeta(s, { activity: [...readActivity(s).map(activityToJson), activityToJson({ id: `claim-${jobId}`, kind: 'gift_claim', module: 'send', asset, amount: next.deposit?.value ?? 0n, at: ctx.now(), status: 'pending' })] }));
  }
  ctx.emit(['gifts', 'notes', 'balances', 'activity']);
  return { amount: next.deposit.value, asset, destination: destination.kind, txHash: job.txHash, gasDrop };
}
