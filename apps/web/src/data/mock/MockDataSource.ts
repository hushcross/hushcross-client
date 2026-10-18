import { clearSale, type SealedBid } from '../clearing';
import { DataSourceError, type DataSource } from '../DataSource';
import { decideGasDrop } from '../gasDrop';
import { validateSaleInput } from '../launchRules';
import type {
  Account,
  ActivityItem,
  Asset,
  BackupFile,
  BackupProtection,
  BackupStatus,
  Balances,
  Bid,
  BidQuote,
  BidRequest,
  Campaign,
  CreateCampaignInput,
  CreateSaleInput,
  DataListener,
  DataTopic,
  DepositRequest,
  DepositResult,
  DonateRequest,
  DonateResult,
  Donation,
  EpochClearing,
  EpochInfo,
  IncomingPayment,
  ModuleId,
  OneTimeFunds,
  OneTimeSendRequest,
  OneTimeSendResult,
  Note,
  Order,
  OrderQuote,
  MyDonation,
  RevealedBook,
  OrderRequest,
  Pair,
  PaymentRequest,
  PaymentRequestInput,
  PoolStats,
  ReceiptVerification,
  RecipientResolution,
  RecoveryResult,
  RelayJob,
  Sale,
  SaleProfile,
  SaleProfileInput,
  SalePhase,
  SendQuote,
  SendRequest,
  ShortNameResult,
  Unsubscribe,
  VaultConfig,
  WalletPayment,
  WalletPaymentRequest,
  CreateGiftInput,
  Gift,
  GiftClaimResult,
  GiftDestination,
  GiftView,
  PrivacyContextRequest,
  Address,
  Hex,
} from '../types';
import type { PrivacyContext } from '../privacyCheck';
import { MockBookGive } from './mockBookGive';
import { MockGifts } from './mockGifts';
import { MockOneTime } from './mockOneTime';
import { MOCK_LOGOS, MockProfiles, mockSaleAddress } from './mockProfiles';
import { buildPrivacyContext } from './mockPrivacy';
import { depositForSpend, splitIntoUnits, unitOptions, UNIT_VALUES, WAD } from '../units';
import { deriveBid } from './mockMarkets';
import {
  BNB_USD,
  createSeed,
  MIX_TICK_MS,
  RELAY_FEE_BPS,
  RELAY_MINUTE_MS,
  RELAY_SUBMIT_MS,
  REDEPOSIT_MS,
  REVIEW_MS,
  SETTLE_MS,
  type ActivityRecord,
  type BidRecord,
  type MockState,
  type NoteRecord,
  type SaleRecord,
} from './mockSeed';
import { createRng, HOUR, randomAddress, randomHex, randomTxHash } from './mockUtil';

export interface MockOptions {
  /** Simulated network latency per call. */
  readonly latencyMs?: number;
  /** Injected clock (tests advance it manually). */
  readonly now?: () => number;
  /** Interval for time-based change notifications; 0 disables the ticker. */
  readonly tickMs?: number;
  /** Start as a new account that has not exported a backup yet. */
  readonly fresh?: boolean;
}

const VETTING_FEE_BPS = 30;
const GAS_DROP = 400_000_000_000_000n;
const ALL_TOPICS: readonly DataTopic[] = ['balances', 'notes', 'activity', 'send', 'sales', 'bids', 'orders', 'campaigns', 'gifts'];
const zero = (): Record<Asset, bigint> => ({ BNB: 0n, USDT: 0n });

export class MockDataSource implements DataSource {
  private state: MockState;
  private readonly t0: number;
  private readonly now: () => number;
  private readonly latencyMs: number;
  private readonly tickMs: number;
  private readonly listeners = new Set<DataListener>();
  private readonly rng = createRng(7);
  private ticker: ReturnType<typeof setInterval> | null = null;
  private counter = 100;
  private readonly gifts: MockGifts;
  private readonly markets: MockBookGive;
  private readonly oneTime: MockOneTime;
  private readonly profiles: MockProfiles;
  /** Addresses this account deposited from, and an address they funded (privacy-check facts). */
  private readonly depositAddresses: readonly Address[];
  private readonly fundedByDeposit: readonly Address[];

  constructor(options: MockOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.latencyMs = options.latencyMs ?? 350;
    this.tickMs = options.tickMs ?? 5000;
    this.t0 = this.now();
    this.state = createSeed(this.t0);
    if (options.fresh) this.state = { ...this.state, backupExportedAt: null };
    this.depositAddresses = [...(this.state.publicAddress ? [this.state.publicAddress] : []), '0x3f5ce5fbfe3e9af3971dd833d26ba9b5c936f0be'];
    this.fundedByDeposit = ['0x8894e0a0c962cb723c1976a4421c95949be2d4e3'];
    this.gifts = new MockGifts({
      now: this.now,
      rng: this.rng,
      fund: (asset, amount, funding) => this.fund(asset, amount, funding, 'send'),
      appendVaultNote: (asset, amount, approvedAt) => {
        this.appendNote(asset, amount, approvedAt);
      },
      record: (activity, topics) => this.update(activity ? { activity: [...this.state.activity, activity] } : {}, topics),
      log: (kind, asset, amount, resolveInMs, subject) => this.log(kind, 'send', asset, amount, resolveInMs, subject),
    });
    this.profiles = new MockProfiles(this.now);
    this.seedProfiles();
    this.oneTime = new MockOneTime({
      now: this.now,
      rng: this.rng,
      appendVaultNote: (asset, amount, approvedAt) => {
        this.appendNote(asset, amount, approvedAt);
      },
      record: (activity, topics) => this.update(activity ? { activity: [...this.state.activity, activity] } : {}, topics),
      log: (kind, module, asset, amount, resolveInMs) => this.log(kind, module, asset, amount, resolveInMs),
    });
    this.markets = new MockBookGive({
      now: this.now,
      rng: this.rng,
      wait: () => this.wait(),
      state: () => this.state,
      update: (patch, topics) => this.update(patch, topics),
      log: (kind, module, asset, amount, resolveInMs, subject) => this.log(kind, module, asset, amount, resolveInMs, subject),
      fund: (asset, amount, funding, module, noteId) => (noteId !== undefined && funding === 'vault' ? this.spendNote(noteId, asset, amount, module) : this.fund(asset, amount, funding, module)),
      appendVaultNote: (asset, amount, approvedAt) => {
        this.appendNote(asset, amount, approvedAt);
      },
      credit: (asset, amount) => {
        this.state = { ...this.state, publicWallet: { ...this.state.publicWallet, [asset]: this.state.publicWallet[asset] + amount } };
      },
      nextId: (prefix) => this.nextId(prefix),
    });
  }

  /* ------------------------------------------------------------ plumbing */

  subscribe(listener: DataListener): Unsubscribe {
    this.listeners.add(listener);
    if (this.tickMs > 0 && this.ticker === null) {
      this.ticker = setInterval(() => this.emit(ALL_TOPICS), this.tickMs);
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0 && this.ticker !== null) {
        clearInterval(this.ticker);
        this.ticker = null;
      }
    };
  }

  private emit(topics: readonly DataTopic[]): void {
    for (const listener of this.listeners) listener(topics);
  }

  private async wait(): Promise<void> {
    if (this.latencyMs <= 0) return;
    await new Promise<void>((resolve) => setTimeout(resolve, this.latencyMs));
  }

  private nextId(prefix: string): string {
    this.counter += 1;
    return `${prefix}-${this.counter}`;
  }

  private update(patch: Partial<MockState>, topics: readonly DataTopic[]): void {
    this.state = { ...this.state, ...patch };
    this.emit(topics);
  }

  private log(kind: ActivityRecord['kind'], module: ModuleId, asset: string, amount: bigint, resolveInMs: number, subject?: string): ActivityRecord {
    const at = this.now();
    return { id: this.nextId('act'), kind, module, asset, amount, at, resolveAt: at + resolveInMs, failed: false, ...(subject === undefined ? {} : { subject }) };
  }

  /* -------------------------------------------------------------- session */

  async getAccount(): Promise<Account> {
    await this.wait();
    const s = this.state;
    return { hushId: s.hushId, metaAddress: s.metaAddress, publicAddress: s.publicAddress, vaultCreatedAt: s.vaultCreatedAt, identityAddress: null };
  }

  async connectWallet(): Promise<Account> {
    await this.wait();
    if (this.state.publicAddress === null) this.update({ publicAddress: randomAddress(this.rng) }, ['account', 'balances']);
    return this.getAccount();
  }

  async getBalances(): Promise<Balances> {
    await this.wait();
    const vault = zero();
    const vaultPending = zero();
    for (const note of this.notes()) {
      if (note.status === 'approved') vault[note.asset] += note.amount;
      if (note.status === 'in_review') vaultPending[note.asset] += note.amount;
    }
    return { vault, vaultPending, publicWallet: this.state.publicAddress === null ? null : { ...this.state.publicWallet } };
  }

  async listActivity(limit: number): Promise<readonly ActivityItem[]> {
    await this.wait();
    const now = this.now();
    return [...this.state.activity]
      .sort((a, b) => b.at - a.at)
      .slice(0, limit)
      .map(({ resolveAt, failed, ...item }) => ({ ...item, status: failed ? 'failed' : resolveAt <= now ? 'done' : 'pending' }));
  }

  /* ---------------------------------------------------------------- vault */

  async getVaultConfig(): Promise<VaultConfig> {
    await this.wait();
    return {
      vettingFeeBps: VETTING_FEE_BPS,
      maxRelayFeeBps: 150,
      units: { BNB: unitOptions('BNB', VETTING_FEE_BPS), USDT: unitOptions('USDT', VETTING_FEE_BPS) },
      defaultGasDrop: GAS_DROP,
      maxRelayDelayMinutes: 30,
      recoveryGapLimit: 128,
    };
  }

  async getPoolStats(asset: Asset): Promise<PoolStats> {
    await this.wait();
    const growth = Math.floor((this.now() - this.t0) / MIX_TICK_MS);
    const base = asset === 'BNB' ? 1840 : 2620;
    return { asset, approvedDeposits: base + growth, totalDeposits: base + growth + 37 };
  }

  private toNote(record: NoteRecord): Note {
    const now = this.now();
    const status = record.exited ? 'exited' : record.spentIn ? 'spent' : record.declined ? 'declined' : now < record.approvedAt ? 'in_review' : 'approved';
    const mixedWith = status === 'in_review' || status === 'declined' ? 0 : record.baseMixed + Math.floor(Math.max(0, now - record.approvedAt) / MIX_TICK_MS);
    return {
      id: record.id,
      asset: record.asset,
      amount: record.amount,
      status,
      createdAt: record.createdAt,
      index: record.index,
      depositTx: record.depositTx,
      mixedWith,
      ...(record.spentIn ? { spentIn: record.spentIn } : {}),
    };
  }

  private notes(): Note[] {
    return this.state.notes.map((record) => this.toNote(record));
  }

  async listNotes(): Promise<readonly Note[]> {
    await this.wait();
    return this.notes().sort((a, b) => b.createdAt - a.createdAt);
  }

  /** Append a new note record to the state and return it. */
  private appendNote(asset: Asset, amount: bigint, approvedAt: number, depositTx?: Hex, baseMixed?: number): NoteRecord {
    const index = this.state.notes.reduce((max, n) => Math.max(max, n.index), -1) + 1;
    const record: NoteRecord = { id: `note-${index}`, asset, amount, index, createdAt: this.now(), approvedAt, declined: false, depositTx: depositTx ?? randomTxHash(this.rng), baseMixed: baseMixed ?? 60 + Math.floor(this.rng() * 300), spentIn: null, exited: false };
    this.state = { ...this.state, notes: [...this.state.notes, record] };
    return record;
  }

  async deposit(request: DepositRequest): Promise<DepositResult> {
    await this.wait();
    const option = unitOptions(request.asset, VETTING_FEE_BPS).find((u) => u.net === request.unit);
    if (!option || !Number.isInteger(request.count) || request.count < 1 || request.count > 20) throw new DataSourceError('invalid_input');
    if (this.state.publicAddress === null) throw new DataSourceError('wallet_required');
    const grossPaid = option.gross * BigInt(request.count);
    if (this.state.publicWallet[request.asset] < grossPaid) throw new DataSourceError('insufficient_wallet');
    const txHash = randomTxHash(this.rng);
    // A fresh deposit has nobody after it yet: its mix count starts at zero and grows with the pool.
    const created = Array.from({ length: request.count }, () => this.appendNote(request.asset, request.unit, this.now() + REVIEW_MS, txHash, 0));
    const wallet = { ...this.state.publicWallet, [request.asset]: this.state.publicWallet[request.asset] - grossPaid };
    const entry = this.log('deposit', 'vault', request.asset, request.unit * BigInt(request.count), REVIEW_MS);
    this.update({ publicWallet: wallet, activity: [...this.state.activity, entry] }, ['notes', 'balances', 'activity']);
    return { notes: created.map((r) => this.toNote(r)), txHash, grossPaid };
  }

  async exitPublicly(noteId: string): Promise<Note> {
    await this.wait();
    const record = this.state.notes.find((n) => n.id === noteId);
    if (!record) throw new DataSourceError('not_found');
    const status = this.toNote(record).status;
    if (status !== 'approved' && status !== 'declined' && status !== 'in_review') throw new DataSourceError('invalid_input');
    const updated = { ...record, exited: true };
    const wallet = { ...this.state.publicWallet, [record.asset]: this.state.publicWallet[record.asset] + record.amount };
    const entry = this.log('exit', 'vault', record.asset, record.amount, RELAY_SUBMIT_MS);
    this.update({ notes: this.state.notes.map((n) => (n.id === noteId ? updated : n)), publicWallet: wallet, activity: [...this.state.activity, entry] }, ['notes', 'balances', 'activity']);
    return this.toNote(updated);
  }

  async recoverFromPhrase(words: readonly string[]): Promise<RecoveryResult> {
    await this.wait();
    if (words.length !== 24 || words.some((w) => !/^[a-z]{3,8}$/.test(w))) throw new DataSourceError('invalid_input');
    const highestIndex = this.state.notes.reduce((max, n) => Math.max(max, n.index), -1);
    return { notesFound: this.state.notes.length, highestIndex, scannedIndices: highestIndex + 1 + 128 };
  }

  async getBackupStatus(): Promise<BackupStatus> {
    await this.wait();
    return { protection: 'passkey', lastExportAt: this.state.backupExportedAt, passkeySupported: true };
  }

  async exportBackup(protection: BackupProtection, passphrase: string | null): Promise<BackupFile> {
    await this.wait();
    if (protection === 'passphrase' && (passphrase === null || passphrase.length < 12)) throw new DataSourceError('invalid_input');
    const createdAt = this.now();
    const contents = JSON.stringify({ format: 'hushcross-backup', version: 1, kdf: protection === 'passkey' ? 'webauthn-prf' : 'pbkdf2-sha256-600000', iv: randomHex(this.rng, 12), ciphertext: randomHex(this.rng, 96), createdAt }, null, 2);
    this.update({ backupExportedAt: createdAt }, ['account']);
    const day = new Date(createdAt).toISOString().slice(0, 10).replace(/-/g, '');
    return { fileName: `hushcross-backup-${day}.json`, mimeType: 'application/json', contents, createdAt };
  }

  /** Spend exactly this note (one-step jobs reserve notes); change returns as new unit notes. */
  private spendNote(noteId: string, asset: Asset, amount: bigint, module: ModuleId): void {
    const note = this.notes().find((n) => n.id === noteId);
    if (!note || note.asset !== asset || note.amount < amount) throw new DataSourceError('insufficient_vault');
    if (note.status !== 'approved') throw new DataSourceError(note.status === 'in_review' ? 'in_review' : 'insufficient_vault');
    this.state = { ...this.state, notes: this.state.notes.map((n) => (n.id === noteId ? { ...n, spentIn: module } : n)) };
    for (const value of splitIntoUnits(asset, note.amount - amount)) this.appendNote(asset, value, this.now());
  }

  /** Consume approved notes worth at least `amount`; change returns as new unit notes. */
  private spendFromVault(asset: Asset, amount: bigint, module: ModuleId): void {
    const available = this.notes()
      .filter((n) => n.asset === asset && n.status === 'approved')
      .sort((a, b) => (a.amount > b.amount ? -1 : a.amount < b.amount ? 1 : 0));
    const chosen: Note[] = [];
    let sum = 0n;
    const exact = available.find((n) => n.amount === amount);
    if (exact) {
      chosen.push(exact);
      sum = amount;
    } else {
      for (const note of [...available].reverse()) {
        if (sum >= amount) break;
        chosen.push(note);
        sum += note.amount;
      }
    }
    if (sum < amount) throw new DataSourceError('insufficient_vault');
    const ids = new Set(chosen.map((n) => n.id));
    const spent = this.state.notes.map((n) => (ids.has(n.id) ? { ...n, spentIn: module } : n));
    this.state = { ...this.state, notes: spent };
    for (const value of splitIntoUnits(asset, sum - amount)) this.appendNote(asset, value, this.now());
  }

  private fund(asset: Asset, amount: bigint, funding: 'vault' | 'public', module: ModuleId): void {
    if (funding === 'vault') {
      this.spendFromVault(asset, amount, module);
      return;
    }
    if (this.state.publicAddress === null) throw new DataSourceError('wallet_required');
    if (this.state.publicWallet[asset] < amount) throw new DataSourceError('insufficient_wallet');
    this.state = { ...this.state, publicWallet: { ...this.state.publicWallet, [asset]: this.state.publicWallet[asset] - amount } };
  }

  /* ----------------------------------------------------------------- send */

  async resolveRecipient(input: string): Promise<RecipientResolution> {
    await this.wait();
    const value = input.trim();
    if (/^0x[0-9a-fA-F]{40}$/.test(value)) return { ok: true, recipient: { kind: 'address', address: value as `0x${string}` } };
    const name = value.replace(/^@/, '').toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(name)) return { ok: false, reason: 'format' };
    if (!this.state.takenNames.includes(name) && name !== this.state.hushId) return { ok: false, reason: 'not_found' };
    return { ok: true, recipient: { kind: 'hushId', hushId: name, metaAddress: `st:bsc:0x02${randomHex(createRng(name.length * 97), 32)}03${randomHex(createRng(name.length * 89), 32)}` } };
  }

  private quote(request: SendRequest): SendQuote {
    const amount = request.units.reduce((sum, u) => sum + u, 0n);
    const relayFee = (amount * BigInt(RELAY_FEE_BPS)) / 10_000n;
    // One drop per send, on the largest withdrawal, under the decided rules (see data/gasDrop.ts).
    const largest = request.units.reduce((max, u) => (u > max ? u : max), 0n);
    const drop = decideGasDrop({ asset: request.asset, amount: largest, wanted: request.gasDrop, gasDropWei: GAS_DROP, relayFee: (largest * BigInt(RELAY_FEE_BPS)) / 10_000n, dropCostInAsset: GAS_DROP * BNB_USD });
    const gasCost = drop.gasDrop * BNB_USD;
    return { amount, relayFee, relayFeeBps: RELAY_FEE_BPS, gasDrop: drop.gasDrop, recipientGets: amount - relayFee - gasCost, notesUsed: request.units.length, gasDropOffered: drop.offered, gasDropDefaultOn: drop.defaultOn, gasDropNote: drop.note };
  }

  async quoteSend(request: SendRequest): Promise<SendQuote> {
    await this.wait();
    return this.quote(request);
  }

  async send(request: SendRequest): Promise<RelayJob> {
    await this.wait();
    const allowed = UNIT_VALUES[request.asset];
    if (request.units.length === 0 || request.units.some((u) => !allowed.includes(u))) throw new DataSourceError('invalid_input');
    if (request.relayDelayMinutes < 0 || request.relayDelayMinutes > 30) throw new DataSourceError('invalid_input');
    const amount = request.units.reduce((sum, u) => sum + u, 0n);
    if (request.noteIds) {
      if (request.noteIds.length !== request.units.length || new Set(request.noteIds).size !== request.noteIds.length) throw new DataSourceError('invalid_input');
      request.units.forEach((unit, i) => this.spendNote(request.noteIds?.[i] ?? '', request.asset, unit, 'send'));
    } else {
      for (const unit of request.units) this.spendFromVault(request.asset, unit, 'send');
    }
    const createdAt = this.now();
    const record = { id: this.nextId('job'), createdAt, executeAfter: createdAt + request.relayDelayMinutes * RELAY_MINUTE_MS, recipient: request.recipient, asset: request.asset, amount, txHash: randomTxHash(this.rng) };
    const subject = request.recipient.kind === 'hushId' ? `@${request.recipient.hushId}` : request.recipient.address;
    const entry = this.log('send', 'send', request.asset, amount, record.executeAfter - createdAt + RELAY_SUBMIT_MS, subject);
    this.update({ relayJobs: [...this.state.relayJobs, record], activity: [...this.state.activity, entry] }, ['notes', 'balances', 'send', 'activity']);
    return this.toJob(record);
  }

  private toJob(record: MockState['relayJobs'][number]): RelayJob {
    const now = this.now();
    const status = now < record.executeAfter ? 'delayed' : now < record.executeAfter + RELAY_SUBMIT_MS ? 'submitted' : 'confirmed';
    return { ...record, status, txHash: status === 'delayed' ? null : record.txHash };
  }

  async listRelayJobs(): Promise<readonly RelayJob[]> {
    await this.wait();
    return this.state.relayJobs.map((r) => this.toJob(r)).sort((a, b) => b.createdAt - a.createdAt);
  }

  async payFromWallet(request: WalletPaymentRequest): Promise<WalletPayment> {
    await this.wait();
    if (request.amount <= 0n) throw new DataSourceError('invalid_input');
    this.fund(request.asset, request.amount, 'public', 'send');
    const subject = request.recipient.kind === 'hushId' ? `@${request.recipient.hushId}` : request.recipient.address;
    const entry = this.log('send', 'send', request.asset, request.amount, RELAY_SUBMIT_MS, subject);
    this.update({ activity: [...this.state.activity, entry] }, ['balances', 'activity']);
    return { txHash: randomTxHash(this.rng), oneTimeAddress: request.recipient.kind === 'hushId' ? randomAddress(this.rng) : null };
  }

  async claimShortName(name: string): Promise<ShortNameResult> {
    await this.wait();
    const clean = name.replace(/^@/, '').toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(clean)) return { ok: false, reason: 'invalid' };
    if (this.state.takenNames.includes(clean)) return { ok: false, reason: 'taken' };
    this.update({ hushId: clean }, ['account']);
    return { ok: true };
  }

  async createPaymentRequest(input: PaymentRequestInput): Promise<PaymentRequest> {
    await this.wait();
    if (this.state.hushId === null) throw new DataSourceError('invalid_input');
    if (!UNIT_VALUES[input.asset].includes(input.unit) || input.count < 1 || input.count > 20) throw new DataSourceError('invalid_input');
    const whole = input.unit / WAD;
    const unitsLabel = input.unit % WAD === 0n ? whole.toString() : (Number(input.unit) / 1e18).toString();
    const request: PaymentRequest = {
      id: this.nextId('req'),
      hushId: this.state.hushId,
      asset: input.asset,
      unit: input.unit,
      count: input.count,
      note: input.note.slice(0, 80),
      path: `/pay/${this.state.hushId}?asset=${input.asset}&units=${unitsLabel}${input.count > 1 ? `&count=${input.count}` : ''}`,
      createdAt: this.now(),
      status: 'open',
    };
    this.update({ paymentRequests: [...this.state.paymentRequests, request] }, ['send']);
    return request;
  }

  async listPaymentRequests(): Promise<readonly PaymentRequest[]> {
    await this.wait();
    return [...this.state.paymentRequests].sort((a, b) => b.createdAt - a.createdAt);
  }

  private toIncoming(record: MockState['incoming'][number]): IncomingPayment {
    const { redepositAt, ...rest } = record;
    const status = redepositAt === null ? 'unclaimed' : this.now() < redepositAt + REDEPOSIT_MS ? 'redepositing' : 'in_vault';
    return { ...rest, status };
  }

  async listIncoming(): Promise<readonly IncomingPayment[]> {
    await this.wait();
    return this.state.incoming.map((r) => this.toIncoming(r)).sort((a, b) => b.at - a.at);
  }

  async redepositIncoming(id: string): Promise<IncomingPayment> {
    await this.wait();
    const record = this.state.incoming.find((r) => r.id === id);
    if (!record) throw new DataSourceError('not_found');
    if (record.redepositAt !== null) throw new DataSourceError('invalid_input');
    const updated = { ...record, redepositAt: this.now() };
    this.appendNote(record.asset, record.amount, this.now() + REDEPOSIT_MS + REVIEW_MS);
    const entry = this.log('deposit', 'vault', record.asset, record.amount, REDEPOSIT_MS + REVIEW_MS);
    this.update({ incoming: this.state.incoming.map((r) => (r.id === id ? updated : r)), activity: [...this.state.activity, entry] }, ['send', 'notes', 'balances', 'activity']);
    return this.toIncoming(updated);
  }

  async listOneTimeFunds(): Promise<readonly OneTimeFunds[]> {
    await this.wait();
    return this.oneTime.list();
  }

  async moveOneTimeToVault(id: string, asset: Asset): Promise<OneTimeFunds> {
    await this.wait();
    return this.oneTime.moveToVault(id, asset);
  }

  async sendFromOneTime(request: OneTimeSendRequest): Promise<OneTimeSendResult> {
    await this.wait();
    return this.oneTime.send(request);
  }

  /* ----------------------------------------------------------------- gift */

  async createGift(input: CreateGiftInput): Promise<Gift> {
    await this.wait();
    return this.gifts.create(input);
  }

  async listMyGifts(): Promise<readonly Gift[]> {
    await this.wait();
    return this.gifts.list();
  }

  async reclaimGift(id: string): Promise<Gift> {
    await this.wait();
    return this.gifts.reclaim(id);
  }

  async openGift(fragment: string): Promise<GiftView> {
    await this.wait();
    return this.gifts.open(fragment);
  }

  async claimGift(fragment: string, destination: GiftDestination): Promise<GiftClaimResult> {
    await this.wait();
    return this.gifts.claim(fragment, destination);
  }

  async getPrivacyContext(request: PrivacyContextRequest): Promise<PrivacyContext> {
    await this.wait();
    return buildPrivacyContext({
      request,
      notes: this.notes(),
      now: this.now(),
      publicAddress: this.state.publicAddress,
      depositAddresses: this.depositAddresses,
      fundedByDepositAddresses: this.fundedByDeposit,
      previousRecipients: this.state.relayJobs.flatMap((j) => (j.recipient.kind === 'address' ? [j.recipient.address] : [])),
      ...(request.giftSecret ? { gift: this.gifts.depositFacts(request.giftSecret) } : {}),
    });
  }

  /* --------------------------------------------------------------- launch */

  private phaseOf(record: SaleRecord, succeeded: () => boolean): SalePhase {
    const now = this.now();
    if (now < record.commitStart) return 'upcoming';
    if (now < record.commitEnd) return 'commit';
    if (now < record.revealEnd) return 'reveal';
    if (now < record.revealEnd + SETTLE_MS) return 'settle';
    return succeeded() ? 'claim' : 'failed';
  }

  private isRevealed(bid: BidRecord, sale: SaleRecord): boolean {
    return bid.revealedAt !== null || (bid.delegatedReveal && this.now() >= sale.commitEnd);
  }

  private saleBids(record: SaleRecord): SealedBid[] {
    const mine = this.state.bids.filter((b) => b.saleId === record.id && this.isRevealed(b, record));
    return [...record.syntheticBids, ...mine.map((b) => ({ id: b.id, price: b.price, maxSpend: b.maxSpend }))];
  }

  private clearingOf(record: SaleRecord): ReturnType<typeof clearSale> {
    return clearSale({ saleAmount: record.saleAmount, floorPrice: record.floorPrice, minRaise: record.minRaise, bids: this.saleBids(record) });
  }

  private toSale(record: SaleRecord): Sale {
    const { syntheticBids, ...rest } = record;
    const result = this.now() >= record.revealEnd + SETTLE_MS ? this.clearingOf(record) : null;
    const phase = this.phaseOf(record, () => result?.succeeded ?? false);
    const mine = this.state.bids.filter((b) => b.saleId === record.id);
    const deposits = [...syntheticBids.map((b) => depositForSpend(record.quoteAsset, b.maxSpend)), ...mine.map((b) => b.deposit)];
    return {
      ...rest,
      phase,
      bidCount: syntheticBids.length + mine.length,
      totalDeposits: deposits.reduce((sum, d) => sum + d, 0n),
      clearing: result
        ? { price: result.price, tokensSold: result.tokensSold, raised: result.raised, succeeded: result.succeeded, winningBids: result.allocations.filter((a) => a.tokens > 0n).length, poolAddress: result.succeeded ? randomAddress(createRng(record.id.length * 31)) : null }
        : null,
    };
  }

  private findSale(id: string): SaleRecord {
    const record = this.state.sales.find((s) => s.id === id);
    if (!record) throw new DataSourceError('not_found');
    return record;
  }

  async listSales(): Promise<readonly Sale[]> {
    await this.wait();
    return this.state.sales.map((s) => this.toSale(s));
  }

  async getSale(id: string): Promise<Sale> {
    await this.wait();
    return this.toSale(this.findSale(id));
  }

  private toBid(bid: BidRecord): Bid {
    const sale = this.findSale(bid.saleId);
    const phase = this.toSale(sale).phase;
    const allocation = phase === 'claim' ? this.clearingOf(sale).allocations.find((a) => a.id === bid.id) : undefined;
    return deriveBid(bid, phase, this.isRevealed(bid, sale), allocation);
  }

  async listMyBids(saleId?: string): Promise<readonly Bid[]> {
    await this.wait();
    return this.state.bids
      .filter((b) => saleId === undefined || b.saleId === saleId)
      .map((b) => this.toBid(b))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async placeBid(request: BidRequest): Promise<Bid> {
    await this.wait();
    const sale = this.toSale(this.findSale(request.saleId));
    if (sale.phase !== 'commit') throw new DataSourceError('phase_closed');
    if (request.price < sale.floorPrice || request.maxSpend <= 0n) throw new DataSourceError('invalid_input');
    const deposit = depositForSpend(sale.quoteAsset, request.maxSpend);
    if (request.funding === 'vault' && request.noteId !== undefined) this.spendNote(request.noteId, sale.quoteAsset, deposit, 'launch');
    else this.fund(sale.quoteAsset, deposit, request.funding, 'launch');
    const bid: BidRecord = { id: this.nextId('bid'), saleId: sale.id, price: request.price, maxSpend: request.maxSpend, deposit, funding: request.funding, delegatedReveal: request.delegateReveal, createdAt: this.now(), revealedAt: null, claimedAt: null };
    const entry = this.log('bid', 'launch', sale.quoteAsset, deposit, 4000, sale.tokenSymbol);
    this.update({ bids: [...this.state.bids, bid], activity: [...this.state.activity, entry] }, ['bids', 'sales', 'notes', 'balances', 'activity']);
    return this.toBid(bid);
  }

  async revealBid(bidId: string): Promise<Bid> {
    await this.wait();
    const bid = this.state.bids.find((b) => b.id === bidId);
    if (!bid) throw new DataSourceError('not_found');
    if (this.toSale(this.findSale(bid.saleId)).phase !== 'reveal') throw new DataSourceError('phase_closed');
    const updated = { ...bid, revealedAt: this.now() };
    this.update({ bids: this.state.bids.map((b) => (b.id === bidId ? updated : b)) }, ['bids', 'sales']);
    return this.toBid(updated);
  }

  async claimBid(bidId: string): Promise<Bid> {
    await this.wait();
    const bid = this.state.bids.find((b) => b.id === bidId);
    if (!bid) throw new DataSourceError('not_found');
    const sale = this.findSale(bid.saleId);
    const current = this.toBid(bid);
    const phase = this.toSale(sale).phase;
    if ((phase !== 'claim' && phase !== 'failed') || bid.claimedAt !== null) throw new DataSourceError('phase_closed');
    for (const value of splitIntoUnits(sale.quoteAsset, current.refund)) this.appendNote(sale.quoteAsset, value, this.now() + REVIEW_MS);
    const updated = { ...bid, claimedAt: this.now() };
    const entry = this.log(current.tokensAllocated > 0n ? 'claim' : 'refund', 'launch', current.tokensAllocated > 0n ? sale.tokenSymbol : sale.quoteAsset, current.tokensAllocated > 0n ? current.tokensAllocated : current.refund, 4000, sale.tokenSymbol);
    this.update({ bids: this.state.bids.map((b) => (b.id === bidId ? updated : b)), activity: [...this.state.activity, entry] }, ['bids', 'notes', 'balances', 'activity']);
    return this.toBid(updated);
  }

  async quoteBid(saleId: string, maxSpend: bigint): Promise<BidQuote> {
    await this.wait();
    const sale = this.findSale(saleId);
    if (maxSpend <= 0n) throw new DataSourceError('invalid_input');
    const escrow = depositForSpend(sale.quoteAsset, maxSpend);
    // The mock charges no relay fee on bids; the quote keeps the same shape as the chain one.
    return { escrow, withdrawn: escrow, relayFee: 0n };
  }

  async claimBidViaRelay(bidId: string): Promise<Bid> {
    const bid = this.state.bids.find((b) => b.id === bidId);
    if (!bid) throw new DataSourceError('not_found');
    if (bid.claimedAt !== null) return this.toBid(bid);
    if (!this.isRevealed(bid, this.findSale(bid.saleId))) throw new DataSourceError('phase_closed');
    return this.claimBid(bidId);
  }

  async finalizeSale(saleId: string): Promise<Sale> {
    await this.wait();
    const sale = this.toSale(this.findSale(saleId));
    // The mock settles on its own clock; finalizing is only accepted once the reveal window is over.
    if (sale.phase === 'commit' || sale.phase === 'reveal') throw new DataSourceError('phase_closed');
    return sale;
  }

  async collectSaleFees(saleId: string): Promise<Sale> {
    await this.wait();
    const sale = this.toSale(this.findSale(saleId));
    if (sale.phase !== 'claim' || sale.clearing?.poolAddress == null) throw new DataSourceError('phase_closed');
    return sale;
  }

  async createSale(input: CreateSaleInput): Promise<Sale> {
    await this.wait();
    if (validateSaleInput(input).length > 0) throw new DataSourceError('invalid_input');
    if (this.state.publicAddress === null) throw new DataSourceError('wallet_required');
    const start = this.now();
    const record: SaleRecord = {
      id: input.tokenSymbol.toLowerCase() + this.nextId(''),
      address: mockSaleAddress(`${input.tokenSymbol}:${this.now()}`),
      tokenName: input.tokenName.trim(),
      tokenSymbol: input.tokenSymbol,
      description: input.description.trim(),
      creator: this.state.publicAddress,
      tokenAddress: randomAddress(this.rng),
      totalSupply: input.totalSupply,
      saleAmount: input.saleAmount,
      floorPrice: input.floorPrice,
      minRaise: input.minRaise,
      quoteAsset: input.quoteAsset,
      commitStart: start,
      commitEnd: start + input.commitHours * HOUR,
      revealEnd: start + (input.commitHours + input.revealHours) * HOUR,
      liquidityBps: input.liquidityBps,
      tokenLiquidityBps: input.tokenLiquidityBps,
      creatorShareBps: input.creatorShareBps,
      creatorVestDays: input.creatorVestDays,
      syntheticBids: [],
    };
    this.update({ sales: [record, ...this.state.sales] }, ['sales']);
    return this.toSale(record);
  }

  /* ------------------------------------------------------- sale profiles */

  private seedProfiles(): void {
    const at = (id: string): Address | null => this.state.sales.find((s) => s.id === id)?.address ?? null;
    const seeds: readonly [string, string, string | null, string | null, string | null, string][] = [
      ['fern', 'A slow-living forum run by its members. Proceeds seed a PancakeSwap pool with locked liquidity; the rest funds hosting for three years.', 'https://quietfern.example', 'quietfern', 'quietfern_forum', MOCK_LOGOS.fern],
      ['loom', 'Shared ledgers for small co-ops: one book per co-op, readable by every member, kept in sync without a central server.', 'https://loom.example', 'loomledger', null, MOCK_LOGOS.loom],
      ['orbit', 'Prepaid credits for an end-to-end encrypted mail relay. Credits never expire.', 'https://orbitmail.example', null, 'orbitmail', MOCK_LOGOS.orbit],
    ];
    for (const [id, description, website, x, telegram, logo] of seeds) {
      const sale = at(id);
      if (sale) this.profiles.seed(sale, { description, website, x, telegram }, logo);
    }
  }

  async getSaleProfile(sale: Address): Promise<SaleProfile | null> {
    await this.wait();
    return this.profiles.get(sale);
  }

  async saveSaleProfile(input: SaleProfileInput): Promise<SaleProfile> {
    await this.wait();
    const profile = this.profiles.save(input, this.state.publicAddress);
    this.emit(['sales']);
    return profile;
  }

  /* ---------------------------------------------------------- book & give */

  listPairs = (): Promise<readonly Pair[]> => this.markets.listPairs();
  getEpoch = (pairId: string): Promise<EpochInfo> => this.markets.getEpoch(pairId);
  listMyOrders = (pairId?: string): Promise<readonly Order[]> => this.markets.listMyOrders(pairId);
  placeOrder = (request: OrderRequest): Promise<Order> => this.markets.placeOrder(request);
  listClearings = (pairId: string, limit: number): Promise<readonly EpochClearing[]> => this.markets.listClearings(pairId, limit);
  quoteOrder = (request: OrderRequest): Promise<OrderQuote> => this.markets.quoteOrder(request);
  settleEpoch = (pairId: string, epoch: number): Promise<EpochClearing> => this.markets.settleEpoch(pairId, epoch);
  claimOrder = (orderId: string): Promise<Order> => this.markets.claimOrder(orderId);
  rolloverOrder = (orderId: string): Promise<Order> => this.markets.rolloverOrder(orderId);
  getRevealedBook = (pairId: string): Promise<RevealedBook | null> => this.markets.getRevealedBook(pairId);
  listCampaigns = (): Promise<readonly Campaign[]> => this.markets.listCampaigns();
  getCampaign = (id: string): Promise<Campaign> => this.markets.getCampaign(id);
  listDonations = (campaignId: string, limit: number): Promise<readonly Donation[]> => this.markets.listDonations(campaignId, limit);
  donate = (request: DonateRequest): Promise<DonateResult> => this.markets.donate(request);
  createCampaign = (input: CreateCampaignInput): Promise<Campaign> => this.markets.createCampaign(input);
  verifyReceipt = (campaignId: string, secret: string): Promise<ReceiptVerification> => this.markets.verifyReceipt(campaignId, secret);
  listMyDonations = (campaignId?: string): Promise<readonly MyDonation[]> => this.markets.listMyDonations(campaignId);
  claimRefund = (donationId: string): Promise<MyDonation> => this.markets.claimRefund(donationId);
  finishCampaign = (campaignId: string): Promise<Campaign> => this.markets.finishCampaign(campaignId);
}
