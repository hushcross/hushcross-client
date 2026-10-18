import {
  ERC20_ABI,
  ERC5564_ANNOUNCER_ABI,
  FINAL_TASK_STATES,
  STEALTH_SCHEME_ID,
  ServiceError,
  deriveIdentity,
  metaFromRegistryBytes,
  normalizeShortName,
  signNameRecord,
  signRegisterKeys,
  verifyNameRecord,
  type Identity,
  type MetaAddress,
  buildRelayRequest,
  buildStealthSendFields,
  deriveChangeSecrets,
  encodeSendData,
  formatMetaAddress,
  gasDropPolicy,
  metaAddressBytes,
  parseMetaAddress,
  planSweep,
  scanIndexerAnnouncements,
  stealthMetaFromMaster,
  type IndexerAnnouncement,
  type RelayJobView,
} from '@hushcross/core';
import { encodeFunctionData, getAddress } from 'viem';
import { DataSourceError } from '../data/DataSource';
import type {
  Address,
  Asset,
  GasDropNote,
  IncomingPayment,
  PaymentRequest,
  PaymentRequestInput,
  RecipientResolution,
  RelayJob,
  RelayJobStatus,
  SendQuote,
  SendRequest,
  ShortNameResult,
  WalletPayment,
  WalletPaymentRequest,
} from '../data/types';
import type { AccountNote, ChainContext } from './context';
import { activityToJson, readActivity, readJobs, readRequests, readString, readStrings, requestToJson, reservedNoteIds, withMeta } from './meta';
import { UNIT_TABLE } from './vaultOps';

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const WAD = 10n ** 18n;

/**
 * Approved notes for each unit: exact balance first, then the smallest larger one; each note once.
 * Notes in `reserved` (held by unfinished one-step jobs) are skipped.
 */
export function selectNotes(notes: readonly AccountNote[], asset: Asset, units: readonly bigint[], reserved: ReadonlySet<string> = new Set()): AccountNote[] {
  const pool = notes.filter((n) => n.asset === asset && n.status === 'approved' && n.balance > 0n && !reserved.has(n.id)).sort((a, b) => (a.balance < b.balance ? -1 : a.balance > b.balance ? 1 : 0));
  const used = new Set<string>();
  const chosen: AccountNote[] = [];
  for (const unit of [...units].sort((a, b) => (a > b ? -1 : a < b ? 1 : 0))) {
    const note = pool.find((n) => !used.has(n.id) && n.balance === unit) ?? pool.find((n) => !used.has(n.id) && n.balance > unit);
    if (!note) throw new DataSourceError('insufficient_vault');
    used.add(note.id);
    chosen.push(note);
  }
  return chosen;
}

export function ownMeta(ctx: ChainContext): string {
  return formatMetaAddress(stealthMetaFromMaster(ctx.requireAccount().keys));
}

/**
 * Hush ID recipients: a `st:` meta-address, or a short name from the relay's off-chain directory. A name
 * record only counts when it is signed by its identity and the ERC-6538 registry holds the same
 * meta-address for that identity, so the directory can hide a name but cannot redirect it.
 */
export async function resolveRecipient(ctx: ChainContext, input: string): Promise<RecipientResolution> {
  const value = input.trim();
  if (ADDRESS.test(value)) return { ok: true, recipient: { kind: 'address', address: getAddress(value) } };
  if (value.startsWith('st:') || /^0x[0-9a-fA-F]{132}$/.test(value)) {
    try {
      const meta = formatMetaAddress(parseMetaAddress(value));
      return { ok: true, recipient: { kind: 'hushId', hushId: `${meta.slice(0, 16)}…`, metaAddress: meta } };
    } catch {
      return { ok: false, reason: 'format' };
    }
  }
  const name = normalizeShortName(value);
  if (name === null) return { ok: false, reason: 'format' };
  const account = ctx.deps.session.current();
  if (account && readString(account.secrets, 'hushId') === name) return { ok: true, recipient: { kind: 'hushId', hushId: name, metaAddress: ownMeta(ctx) } };
  const record = await ctx.deps.services.relay.getName(name).catch(() => null);
  if (record === null || record.name !== name || !(await verifyNameRecord(record, ctx.deps.chainId))) return { ok: false, reason: 'not_found' };
  const onchain = (await ctx.deps.chain.getRegisteredMeta(ctx.deployments.registry, record.identity)).toLowerCase();
  if (onchain !== record.stealthMetaAddress.toLowerCase()) return { ok: false, reason: 'not_found' };
  return { ok: true, recipient: { kind: 'hushId', hushId: name, metaAddress: formatMetaAddress(metaFromRegistryBytes(record.stealthMetaAddress)) } };
}

/** Gas-drop facts for one withdrawal of `amount`: policy plus whether the drop fits under the fee cap. */
export async function gasDropFacts(ctx: ChainContext, asset: Asset, amount: bigint): Promise<{ readonly offered: boolean; readonly defaultOn: boolean; readonly note: GasDropNote | null; readonly fits: boolean }> {
  const policy = gasDropPolicy(asset, amount);
  if (!policy.offered) return { offered: false, defaultOn: false, note: policy.reason, fits: false };
  let fits = false;
  try {
    fits = (await ctx.quote(asset, 'send', amount, { gasDrop: true })).gasDropApplied;
  } catch {
    fits = false;
  }
  if (!fits) return { offered: policy.offered, defaultOn: false, note: 'gas_drop_over_cap', fits };
  return { offered: policy.offered, defaultOn: policy.defaultOn, note: policy.reason, fits };
}

/** One drop per send, attached to the largest withdrawal, and only where the rules and the fee cap allow it. */
export async function quoteSend(ctx: ChainContext, request: SendRequest): Promise<SendQuote> {
  validateSend(request);
  const units = [...request.units].sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));
  const facts = await gasDropFacts(ctx, request.asset, units[0] as bigint);
  const quotes = await Promise.all(units.map((unit, i) => ctx.quote(request.asset, 'send', unit, { gasDrop: i === 0 && request.gasDrop && facts.fits })));
  const amount = request.units.reduce((sum, u) => sum + u, 0n);
  const relayFee = quotes.reduce((sum, q) => sum + q.fee, 0n);
  const maxBps = quotes.reduce((max, q) => (q.feeBps > max ? q.feeBps : max), 0n);
  const gasDrop = quotes.reduce((sum, q) => sum + q.gasDropWei, 0n);
  return { amount, relayFee, relayFeeBps: Number(maxBps), gasDrop, recipientGets: amount - relayFee, notesUsed: request.units.length, gasDropOffered: facts.offered, gasDropDefaultOn: facts.defaultOn, gasDropNote: facts.note };
}

function validateSend(request: SendRequest): void {
  if (request.units.length === 0 || request.units.length > 10 || request.units.some((u) => !UNIT_TABLE[request.asset].includes(u))) throw new DataSourceError('invalid_input');
  if (!Number.isInteger(request.relayDelayMinutes) || request.relayDelayMinutes < 0 || request.relayDelayMinutes > 30) throw new DataSourceError('invalid_input');
}

/**
 * Notes named by a one-step job, aligned with `units`: each must be this account's, approved, of the
 * asset and large enough for its unit.
 */
export function pickNotes(notes: readonly AccountNote[], asset: Asset, units: readonly bigint[], ids: readonly string[]): AccountNote[] {
  if (ids.length !== units.length || new Set(ids).size !== ids.length) throw new DataSourceError('invalid_input');
  return ids.map((id, i) => {
    const note = notes.find((n) => n.id === id);
    if (!note || note.asset !== asset || note.balance < (units[i] as bigint)) throw new DataSourceError('insufficient_vault');
    if (note.status !== 'approved') throw new DataSourceError(note.status === 'in_review' ? 'in_review' : 'insufficient_vault');
    return note;
  });
}

export async function send(ctx: ChainContext, request: SendRequest): Promise<RelayJob> {
  validateSend(request);
  const { keys, secrets } = ctx.requireAccount();
  const all = await ctx.accountNotes();
  // With explicit notes the units keep the caller's order; otherwise largest first (selectNotes order).
  const units = request.noteIds ? [...request.units] : [...request.units].sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));
  const notes = request.noteIds ? pickNotes(all, request.asset, units, request.noteIds) : selectNotes(all, request.asset, request.units, reservedNoteIds(secrets));
  const info = await ctx.relayInfo();
  const jobs: RelayJob[] = [];
  const largest = units.reduce((max, u) => (u > max ? u : max), 0n);
  const dropIndex = units.indexOf(largest);
  const dropFits = request.gasDrop ? (await gasDropFacts(ctx, request.asset, largest)).fits : false;
  for (const [i, note] of notes.entries()) {
    const unit = units[i] as bigint;
    const quote = await ctx.quote(request.asset, 'send', unit, { gasDrop: i === dropIndex && dropFits });
    const fields = request.recipient.kind === 'hushId' ? buildStealthSendFields(parseMetaAddress(request.recipient.metaAddress)) : { recipient: request.recipient.address, ephemeralPubKey: '0x' as const, metadata: '0x' as const };
    const withdrawal = { processooor: ctx.deployments.hushSend, data: encodeSendData({ recipient: fields.recipient, feeRecipient: info.relayer, relayFeeBPS: quote.feeBps, ephemeralPubKey: fields.ephemeralPubKey, metadata: fields.metadata }) };
    const next = deriveChangeSecrets(keys, note.label, BigInt(note.withdrawalCount));
    const proof = await ctx.prove(request.asset, note, unit, next, withdrawal);
    const delaySeconds = Math.min(1800, request.relayDelayMinutes * 60);
    const relayRequest = buildRelayRequest({ target: 'send', pool: note.pool, scope: note.scope, withdrawal, proof, gasDrop: quote.gasDropApplied, delaySeconds });
    const createdAt = ctx.now();
    const view = await ctx.submit(relayRequest, { target: 'send', purpose: 'send', createdAt, executeAfter: createdAt + delaySeconds * 1000, asset: request.asset, amount: unit, recipient: request.recipient });
    jobs.push(toRelayJob(view, { createdAt, executeAfter: createdAt + delaySeconds * 1000, recipient: request.recipient, asset: request.asset, amount: unit }, null));
  }
  const total = request.units.reduce((sum, u) => sum + u, 0n);
  const subject = request.recipient.kind === 'hushId' ? `@${request.recipient.hushId}` : request.recipient.address;
  await ctx.updateAccount((s) => withMeta(s, { activity: [...readActivity(s).map(activityToJson), activityToJson({ id: `send-${jobs[0]?.id ?? createdId(ctx)}`, kind: 'send', module: 'send', asset: request.asset, amount: total, at: ctx.now(), status: 'pending', subject })] }));
  ctx.emit(['notes', 'balances', 'send', 'activity']);
  const first = jobs[0];
  if (!first) throw new DataSourceError('invalid_input');
  return { ...first, amount: total };
}

function createdId(ctx: ChainContext): string {
  return ctx.now().toString(36);
}

export function mapJobState(state: string, receipt: 'success' | 'reverted' | null): RelayJobStatus {
  if (state === 'failed' || receipt === 'reverted') return 'failed';
  if (receipt === 'success' || state === 'confirmed' || state === 'mined') return 'confirmed';
  if (state === 'scheduled' || state === 'delayed') return 'delayed';
  return 'submitted';
}

function toRelayJob(view: RelayJobView, base: Omit<RelayJob, 'id' | 'status' | 'txHash'>, receipt: 'success' | 'reverted' | null): RelayJob {
  return { ...base, id: view.jobId, status: mapJobState(view.state, receipt), txHash: view.txHash, executeAfter: view.executeAtMs ?? base.executeAfter };
}

export async function listRelayJobs(ctx: ChainContext): Promise<RelayJob[]> {
  const account = ctx.deps.session.current();
  if (!account) return [];
  const stored = readJobs(account.secrets).filter((j) => j.purpose === 'send');
  const jobs = await Promise.all(
    stored.map(async (job): Promise<RelayJob> => {
      const base = { createdAt: job.createdAt, executeAfter: job.executeAfter, recipient: job.recipient ?? { kind: 'address' as const, address: '0x0000000000000000000000000000000000000000' as const }, asset: job.asset, amount: job.amount };
      try {
        const view = await ctx.deps.services.relay.job(job.id);
        const receipt = view.txHash ? await ctx.deps.chain.getReceipt(view.txHash) : null;
        return toRelayJob(view, base, receipt);
      } catch {
        return { ...base, id: job.id, status: 'submitted', txHash: null };
      }
    }),
  );
  return jobs.sort((a, b) => b.createdAt - a.createdAt);
}

export async function payFromWallet(ctx: ChainContext, request: WalletPaymentRequest): Promise<WalletPayment> {
  if (request.amount <= 0n) throw new DataSourceError('invalid_input');
  const owner = ctx.requireWallet();
  const token = ctx.tokenOf(request.asset);
  const balance = token ? await ctx.deps.chain.getTokenBalance(token, owner) : await ctx.deps.chain.getNativeBalance(owner);
  if (balance < request.amount) throw new DataSourceError('insufficient_wallet');
  const stealth = request.recipient.kind === 'hushId' ? buildStealthSendFields(parseMetaAddress(request.recipient.metaAddress)) : null;
  const to: Address = stealth ? stealth.recipient : request.recipient.kind === 'address' ? request.recipient.address : owner;
  const txs = [token ? { to: token, data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'transfer', args: [to, request.amount] }), value: 0n } : { to, data: '0x' as const, value: request.amount }];
  if (stealth) {
    txs.push({ to: ctx.deployments.announcer, data: encodeFunctionData({ abi: ERC5564_ANNOUNCER_ABI, functionName: 'announce', args: [STEALTH_SCHEME_ID, stealth.recipient, stealth.ephemeralPubKey, stealth.metadata] }), value: 0n });
  }
  const txHash = await ctx.sendWalletTxs(txs);
  ctx.emit(['balances', 'activity']);
  return { txHash, oneTimeAddress: stealth ? stealth.recipient : null };
}

/**
 * Hush ID without the public wallet: the account's identity key (HKDF `hushcross/v1/identity`) signs the
 * ERC-6538 entry, the relay submits `registerKeysOnBehalf` and pays the gas, then the short name goes to
 * the relay's off-chain directory as a record signed by the same identity.
 */
export async function claimShortName(ctx: ChainContext, name: string): Promise<ShortNameResult> {
  const clean = normalizeShortName(name);
  if (clean === null) return { ok: false, reason: 'invalid' };
  const { keys, secrets } = ctx.requireAccount();
  const identity = deriveIdentity(secrets.phrase);
  const meta = stealthMetaFromMaster(keys);
  const relay = ctx.deps.services.relay;
  const existing = await relay.getName(clean).catch(() => null);
  if (existing !== null && existing.identity !== identity.address) return { ok: false, reason: 'taken' };
  await registerIdentity(ctx, identity, meta);
  try {
    await relay.putName(await signNameRecord({ name: clean, identity, meta, chainId: ctx.deps.chainId, issuedAt: Math.floor(ctx.now() / 1000) }));
  } catch (error: unknown) {
    if (error instanceof ServiceError && error.code === 'name_taken') return { ok: false, reason: 'taken' };
    throw error;
  }
  await ctx.updateAccount((s) => withMeta(s, { hushId: clean }));
  ctx.emit(['account']);
  return { ok: true };
}

/** Register the meta-address under the identity address through the relay unless it is already there. */
export async function registerIdentity(ctx: ChainContext, identity: Identity, meta: MetaAddress): Promise<void> {
  const registry = ctx.deployments.registry;
  const wanted = metaAddressBytes(meta).toLowerCase();
  if ((await ctx.deps.chain.getRegisteredMeta(registry, identity.address)).toLowerCase() === wanted) return;
  const nonce = await ctx.deps.chain.getRegistryNonce(registry, identity.address);
  const relay = ctx.deps.services.relay;
  const task = await relay.registerKeys(await signRegisterKeys({ identity, meta, registry, chainId: ctx.deps.chainId, nonce }));
  const done = FINAL_TASK_STATES.includes(task.state) ? task : await relay.waitForTask(task.id, { intervalMs: 1500, timeoutMs: 120_000 });
  if (done.state === 'skipped') return;
  if (done.state !== 'broadcast' || done.txHash === null) throw new DataSourceError('relay_rejected', done.error ?? done.state);
  if ((await ctx.deps.chain.waitForReceipt(done.txHash)) !== 'success') throw new DataSourceError('tx_failed');
}

export async function createPaymentRequest(ctx: ChainContext, input: PaymentRequestInput): Promise<PaymentRequest> {
  if (!UNIT_TABLE[input.asset].includes(input.unit) || !Number.isInteger(input.count) || input.count < 1 || input.count > 20) throw new DataSourceError('invalid_input');
  const { secrets } = ctx.requireAccount();
  const id = readString(secrets, 'hushId') ?? ownMeta(ctx);
  const label = input.unit % WAD === 0n ? (input.unit / WAD).toString() : (Number(input.unit) / 1e18).toString();
  const request: PaymentRequest = {
    id: `req-${ctx.now().toString(36)}`,
    hushId: id,
    asset: input.asset,
    unit: input.unit,
    count: input.count,
    note: input.note.slice(0, 80),
    path: `/pay/${encodeURIComponent(id)}?asset=${input.asset}&units=${label}${input.count > 1 ? `&count=${input.count}` : ''}`,
    createdAt: ctx.now(),
    status: 'open',
  };
  await ctx.updateAccount((s) => withMeta(s, { requests: [...readRequests(s).map(requestToJson), requestToJson(request)] }));
  ctx.emit(['send']);
  return request;
}

export function listPaymentRequests(ctx: ChainContext): PaymentRequest[] {
  const account = ctx.deps.session.current();
  return account ? readRequests(account.secrets).sort((a, b) => b.createdAt - a.createdAt) : [];
}

interface OwnedItem {
  readonly id: string;
  readonly item: IndexerAnnouncement;
  readonly privateKey: `0x${string}`;
}

/** Scan indexer announcements for this account (cursor kept in memory for the session). */
export class IncomingScanner {
  private cursor: bigint | null = null;
  private owned: OwnedItem[] = [];
  private phrase: string | null = null;

  async scan(ctx: ChainContext): Promise<readonly OwnedItem[]> {
    const { secrets, keys } = ctx.requireAccount();
    if (this.phrase !== secrets.phrase) {
      this.phrase = secrets.phrase;
      this.cursor = ctx.deployments.startBlock;
      this.owned = [];
    }
    for (let page = 0; page < 50; page += 1) {
      const from = this.cursor ?? ctx.deployments.startBlock;
      const result = await ctx.deps.services.indexer.announcements({ fromBlock: from, limit: 500 });
      const found = scanIndexerAnnouncements(keys, result.items);
      for (const f of found) {
        const id = `${f.tx}:${f.logIndex}`;
        if (!this.owned.some((o) => o.id === id)) this.owned.push({ id, item: f, privateKey: f.stealthPrivateKey });
      }
      const maxBlock = result.items.reduce((max, i) => (BigInt(i.block) > max ? BigInt(i.block) : max), from - 1n);
      const next = result.nextFromBlock ?? (result.items.length > 0 ? maxBlock + 1n : null);
      if (next === null || next <= from || result.items.length === 0) {
        if (next !== null && next > from) this.cursor = next;
        break;
      }
      this.cursor = next;
    }
    return this.owned;
  }
}

export async function listIncoming(ctx: ChainContext, scanner: IncomingScanner): Promise<IncomingPayment[]> {
  if (!ctx.deps.session.current()) return [];
  const owned = await scanner.scan(ctx);
  const { secrets } = ctx.requireAccount();
  const swept = new Set(readStrings(secrets, 'swept'));
  const token = ctx.deployments.pools.USDT.asset;
  const items = await Promise.all(
    owned.map(async (o): Promise<IncomingPayment> => {
      const [native, usdt, at] = await Promise.all([
        ctx.deps.chain.getNativeBalance(o.item.stealthAddress),
        ctx.deps.chain.getTokenBalance(token, o.item.stealthAddress),
        ctx.deps.chain.getBlockTime(BigInt(o.item.block)).catch(() => 0),
      ]);
      const asset: Asset = usdt > 0n ? 'USDT' : 'BNB';
      const amount = asset === 'USDT' ? usdt : native;
      const status = swept.has(o.id) ? (amount === 0n ? 'in_vault' : 'redepositing') : amount === 0n ? 'in_vault' : 'unclaimed';
      return { id: o.id, stealthAddress: o.item.stealthAddress, asset, amount, at, status };
    }),
  );
  return items.sort((a, b) => b.at - a.at);
}

export async function redepositIncoming(ctx: ChainContext, scanner: IncomingScanner, id: string): Promise<IncomingPayment> {
  const owned = (await scanner.scan(ctx)).find((o) => o.id === id);
  if (!owned) throw new DataSourceError('not_found');
  const address = owned.item.stealthAddress;
  const token = ctx.deployments.pools.USDT.asset;
  const [native, usdt, gasPrice] = await Promise.all([ctx.deps.chain.getNativeBalance(address), ctx.deps.chain.getTokenBalance(token, address), ctx.deps.chain.getGasPrice()]);
  const asset: Asset = usdt > 0n ? 'USDT' : 'BNB';
  const config = await ctx.assetConfig(asset);
  const [fresh] = await ctx.freshDepositSecrets(asset, 1);
  if (!fresh) throw new DataSourceError('invalid_input');
  const plan =
    asset === 'USDT'
      ? planSweep({ kind: 'erc20', entrypoint: ctx.deployments.entrypoint, token, precommitment: fresh.secrets.precommitment, tokenBalance: usdt, nativeBalance: native, gasPriceWei: gasPrice, minDeposit: config.minimumDeposit })
      : planSweep({ kind: 'native', entrypoint: ctx.deployments.entrypoint, precommitment: fresh.secrets.precommitment, nativeBalance: native, gasPriceWei: gasPrice, minDeposit: config.minimumDeposit });
  await ctx.updateAccount((s) => withMeta(s, { swept: [...readStrings(s, 'swept'), id] }));
  for (const tx of plan.txs) {
    const hash = await ctx.deps.chain.sendFromKey(owned.privateKey, tx);
    if ((await ctx.deps.chain.waitForReceipt(hash)) !== 'success') throw new DataSourceError('tx_failed');
  }
  await ctx.updateAccount((s) => withMeta(s, { activity: [...readActivity(s).map(activityToJson), activityToJson({ id: `sweep-${id}`, kind: 'deposit', module: 'vault', asset, amount: plan.depositValue, at: ctx.now(), status: 'done' })] }));
  ctx.emit(['send', 'notes', 'balances', 'activity']);
  return { id, stealthAddress: address, asset, amount: plan.depositValue, at: ctx.now(), status: 'redepositing' };
}
