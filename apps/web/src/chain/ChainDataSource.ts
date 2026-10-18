import { deriveIdentity, formatMetaAddress, stealthMetaFromMaster } from '@hushcross/core';
import type { DataSource } from '../data/DataSource';
import { DataSourceError } from '../data/DataSource';
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
  CreateGiftInput,
  CreateSaleInput,
  Sale,
  DataListener,
  DepositRequest,
  DepositResult,
  Gift,
  GiftClaimResult,
  GiftDestination,
  GiftView,
  IncomingPayment,
  Note,
  PaymentRequest,
  PaymentRequestInput,
  PoolStats,
  PrivacyContextRequest,
  RecipientResolution,
  RecoveryResult,
  RelayJob,
  SendQuote,
  SendRequest,
  ShortNameResult,
  Unsubscribe,
  VaultConfig,
  WalletPayment,
  WalletPaymentRequest,
  Campaign,
  CreateCampaignInput,
  DonateRequest,
  DonateResult,
  Donation,
  EpochClearing,
  EpochInfo,
  MyDonation,
  Order,
  OrderQuote,
  OrderRequest,
  Pair,
  ReceiptVerification,
  RevealedBook,
  OneTimeFunds,
  OneTimeSendRequest,
  OneTimeSendResult,
  SaleProfile,
  SaleProfileInput,
  Address,
} from '../data/types';
import type { PrivacyContext } from '../data/privacyCheck';
import { ChainContext, guard, type ChainDeps } from './context';
import * as book from './bookOps';
import * as gifts from './giftOps';
import * as give from './giveOps';
import * as launch from './launchOps';
import * as oneTime from './oneTimeOps';
import * as profiles from './profileOps';
import { readActivity, readString } from './meta';
import { getPrivacyContext } from './privacyOps';
import * as sending from './sendOps';
import * as vault from './vaultOps';

/** The DataSource methods backed by chain + services (W2: Vault, Send, Gift, Privacy Check; W3: Launch; W4: Book, Give). */
export type ChainBackedMethods =
  | 'getAccount'
  | 'connectWallet'
  | 'getBalances'
  | 'listActivity'
  | 'subscribe'
  | 'getVaultConfig'
  | 'getPoolStats'
  | 'listNotes'
  | 'deposit'
  | 'exitPublicly'
  | 'recoverFromPhrase'
  | 'getBackupStatus'
  | 'exportBackup'
  | 'resolveRecipient'
  | 'quoteSend'
  | 'send'
  | 'listRelayJobs'
  | 'payFromWallet'
  | 'claimShortName'
  | 'createPaymentRequest'
  | 'listPaymentRequests'
  | 'listIncoming'
  | 'redepositIncoming'
  | 'listOneTimeFunds'
  | 'moveOneTimeToVault'
  | 'sendFromOneTime'
  | 'createGift'
  | 'listMyGifts'
  | 'reclaimGift'
  | 'openGift'
  | 'claimGift'
  | 'getPrivacyContext'
  | 'listSales'
  | 'getSale'
  | 'listMyBids'
  | 'placeBid'
  | 'revealBid'
  | 'claimBid'
  | 'quoteBid'
  | 'claimBidViaRelay'
  | 'createSale'
  | 'finalizeSale'
  | 'collectSaleFees'
  | 'getSaleProfile'
  | 'saveSaleProfile'
  | 'listPairs'
  | 'getEpoch'
  | 'listMyOrders'
  | 'placeOrder'
  | 'listClearings'
  | 'quoteOrder'
  | 'settleEpoch'
  | 'claimOrder'
  | 'rolloverOrder'
  | 'getRevealedBook'
  | 'listCampaigns'
  | 'getCampaign'
  | 'listDonations'
  | 'donate'
  | 'createCampaign'
  | 'verifyReceipt'
  | 'listMyDonations'
  | 'claimRefund'
  | 'finishCampaign';

export interface ChainDataSourceOptions extends ChainDeps {
  readonly exportBackupFile: vault.BackupExporter;
  readonly passkeySupported: () => Promise<boolean>;
  /** Override the relay polling sleep (tests). */
  readonly sleep?: (ms: number) => Promise<void>;
}

export class ChainDataSource implements DataSource {
  readonly ctx: ChainContext;
  private readonly scanner = new sending.IncomingScanner();

  constructor(private readonly options: ChainDataSourceOptions) {
    this.ctx = new ChainContext(options);
    options.session.subscribe(() => this.ctx.emit(['account', 'notes', 'balances', 'activity', 'send', 'gifts', 'orders', 'campaigns']));
  }

  subscribe(listener: DataListener): Unsubscribe {
    return this.ctx.subscribe(listener);
  }

  getAccount(): Promise<Account> {
    return guard(async () => {
      const { keys, secrets } = this.ctx.requireAccount();
      return {
        hushId: readString(secrets, 'hushId'),
        metaAddress: formatMetaAddress(stealthMetaFromMaster(keys)),
        publicAddress: this.options.wallet.getAddress(),
        vaultCreatedAt: secrets.createdAt,
        identityAddress: this.identityOf(secrets.phrase),
      };
    });
  }

  private identityOf(phrase: string): `0x${string}` {
    // Do not retain a recovery phrase in a data-source cache beyond the account session.
    return deriveIdentity(phrase).address;
  }

  connectWallet(): Promise<Account> {
    return guard(async () => {
      await this.options.wallet.connect();
      this.ctx.emit(['account', 'balances']);
      return this.getAccount();
    });
  }

  getBalances(): Promise<Balances> {
    return guard(async () => {
      const notes = this.options.session.current() ? await this.ctx.accountNotes() : [];
      const { vault: v, pending } = vault.balancesFrom(notes);
      return { vault: v, vaultPending: pending, publicWallet: await vault.walletBalances(this.ctx) };
    });
  }

  listActivity(limit: number): Promise<readonly ActivityItem[]> {
    return guard(async () => {
      const account = this.options.session.current();
      if (!account) return [];
      return readActivity(account.secrets)
        .sort((a, b) => b.at - a.at)
        .slice(0, Math.max(0, limit));
    });
  }

  getVaultConfig(): Promise<VaultConfig> {
    return guard(() => vault.getVaultConfig(this.ctx));
  }

  getPoolStats(asset: Asset): Promise<PoolStats> {
    return guard(() => vault.getPoolStats(this.ctx, asset));
  }

  listNotes(): Promise<readonly Note[]> {
    return guard(async () => {
      const notes = await vault.toNotes(this.ctx, await this.ctx.accountNotes());
      return notes.sort((a, b) => b.createdAt - a.createdAt);
    });
  }

  deposit(request: DepositRequest): Promise<DepositResult> {
    return guard(() => vault.deposit(this.ctx, request));
  }

  exitPublicly(noteId: string): Promise<Note> {
    return guard(() => vault.exitPublicly(this.ctx, noteId));
  }

  recoverFromPhrase(words: readonly string[]): Promise<RecoveryResult> {
    return guard(() => vault.recoverFromPhrase(this.ctx, words));
  }

  getBackupStatus(): Promise<BackupStatus> {
    return guard(async () => vault.getBackupStatus(this.ctx, await this.options.passkeySupported()));
  }

  exportBackup(protection: BackupProtection, passphrase: string | null): Promise<BackupFile> {
    return guard(() => vault.exportBackup(this.ctx, protection, passphrase, this.options.exportBackupFile));
  }

  resolveRecipient(input: string): Promise<RecipientResolution> {
    return guard(() => sending.resolveRecipient(this.ctx, input));
  }

  quoteSend(request: SendRequest): Promise<SendQuote> {
    return guard(() => sending.quoteSend(this.ctx, request));
  }

  send(request: SendRequest): Promise<RelayJob> {
    return guard(() => sending.send(this.ctx, request));
  }

  listRelayJobs(): Promise<readonly RelayJob[]> {
    return guard(() => sending.listRelayJobs(this.ctx));
  }

  payFromWallet(request: WalletPaymentRequest): Promise<WalletPayment> {
    return guard(() => sending.payFromWallet(this.ctx, request));
  }

  claimShortName(name: string): Promise<ShortNameResult> {
    return guard(() => sending.claimShortName(this.ctx, name));
  }

  createPaymentRequest(input: PaymentRequestInput): Promise<PaymentRequest> {
    return guard(() => sending.createPaymentRequest(this.ctx, input));
  }

  listPaymentRequests(): Promise<readonly PaymentRequest[]> {
    return guard(async () => sending.listPaymentRequests(this.ctx));
  }

  listIncoming(): Promise<readonly IncomingPayment[]> {
    return guard(() => sending.listIncoming(this.ctx, this.scanner));
  }

  redepositIncoming(id: string): Promise<IncomingPayment> {
    return guard(() => sending.redepositIncoming(this.ctx, this.scanner, id));
  }

  listOneTimeFunds(): Promise<readonly OneTimeFunds[]> {
    return guard(() => oneTime.listOneTimeFunds(this.ctx));
  }

  moveOneTimeToVault(id: string, asset: Asset): Promise<OneTimeFunds> {
    return guard(() => oneTime.moveOneTimeToVault(this.ctx, id, asset));
  }

  sendFromOneTime(request: OneTimeSendRequest): Promise<OneTimeSendResult> {
    return guard(() => oneTime.sendFromOneTime(this.ctx, request));
  }

  createGift(input: CreateGiftInput): Promise<Gift> {
    return guard(() => gifts.createGift(this.ctx, input));
  }

  listMyGifts(): Promise<readonly Gift[]> {
    return guard(() => gifts.listMyGifts(this.ctx));
  }

  reclaimGift(id: string): Promise<Gift> {
    return guard(() => gifts.reclaimGift(this.ctx, id));
  }

  /** The fragment is decoded locally; only derived precommitments / labels reach any service. */
  openGift(fragment: string): Promise<GiftView> {
    return guard(() => gifts.openGift(this.ctx, fragment));
  }

  claimGift(fragment: string, destination: GiftDestination): Promise<GiftClaimResult> {
    if (destination.kind === 'vault' && !this.options.session.current()) return Promise.reject(new DataSourceError('locked'));
    return guard(() => gifts.claimGift(this.ctx, fragment, destination, this.options.sleep ? { sleep: this.options.sleep } : {}));
  }

  getPrivacyContext(request: PrivacyContextRequest): Promise<PrivacyContext> {
    return guard(() => getPrivacyContext(this.ctx, request));
  }

  listSales(): Promise<readonly Sale[]> {
    return guard(() => launch.listSales(this.ctx));
  }

  getSale(id: string): Promise<Sale> {
    return guard(() => launch.getSale(this.ctx, id));
  }

  listMyBids(saleId?: string): Promise<readonly Bid[]> {
    return guard(() => launch.listMyBids(this.ctx, saleId));
  }

  placeBid(request: BidRequest): Promise<Bid> {
    return guard(() => launch.placeBid(this.ctx, request));
  }

  revealBid(bidId: string): Promise<Bid> {
    return guard(() => launch.revealBid(this.ctx, bidId));
  }

  claimBid(bidId: string): Promise<Bid> {
    return guard(() => launch.claimBid(this.ctx, bidId));
  }

  quoteBid(saleId: string, maxSpend: bigint): Promise<BidQuote> {
    return guard(() => launch.quoteBid(this.ctx, saleId, maxSpend));
  }

  claimBidViaRelay(bidId: string): Promise<Bid> {
    return guard(() => launch.claimBidViaRelay(this.ctx, bidId));
  }

  createSale(input: CreateSaleInput): Promise<Sale> {
    return guard(() => launch.createSale(this.ctx, input));
  }
  getSaleProfile(sale: Address): Promise<SaleProfile | null> {
    return profiles.getSaleProfile(this.ctx, sale);
  }

  saveSaleProfile(input: SaleProfileInput): Promise<SaleProfile> {
    return guard(() => profiles.saveSaleProfile(this.ctx, input));
  }


  finalizeSale(saleId: string): Promise<Sale> {
    return guard(() => launch.finalizeSale(this.ctx, saleId));
  }

  collectSaleFees(saleId: string): Promise<Sale> {
    return guard(() => launch.collectSaleFees(this.ctx, saleId));
  }

  /* ------------------------------------------------------------- book */

  listPairs(): Promise<readonly Pair[]> {
    return guard(() => book.listPairs(this.ctx));
  }

  getEpoch(pairId: string): Promise<EpochInfo> {
    return guard(() => book.getEpoch(this.ctx, pairId));
  }

  listMyOrders(pairId?: string): Promise<readonly Order[]> {
    return guard(() => book.listMyOrders(this.ctx, pairId));
  }

  placeOrder(request: OrderRequest): Promise<Order> {
    return guard(() => book.placeOrder(this.ctx, request));
  }

  listClearings(pairId: string, limit: number): Promise<readonly EpochClearing[]> {
    return guard(() => book.listClearings(this.ctx, pairId, limit));
  }

  quoteOrder(request: OrderRequest): Promise<OrderQuote> {
    return guard(() => book.quoteOrder(this.ctx, request));
  }

  settleEpoch(pairId: string, epoch: number): Promise<EpochClearing> {
    return guard(() => book.settleEpoch(this.ctx, pairId, epoch));
  }

  claimOrder(orderId: string): Promise<Order> {
    return guard(() => book.claimOrder(this.ctx, orderId));
  }

  rolloverOrder(orderId: string): Promise<Order> {
    return guard(() => book.rolloverOrder(this.ctx, orderId));
  }

  getRevealedBook(pairId: string): Promise<RevealedBook | null> {
    return guard(() => book.getRevealedBook(this.ctx, pairId));
  }

  /* ------------------------------------------------------------- give */

  listCampaigns(): Promise<readonly Campaign[]> {
    return guard(() => give.listCampaigns(this.ctx));
  }

  getCampaign(id: string): Promise<Campaign> {
    return guard(() => give.getCampaign(this.ctx, id));
  }

  listDonations(campaignId: string, limit: number): Promise<readonly Donation[]> {
    return guard(() => give.listDonations(this.ctx, campaignId, limit));
  }

  donate(request: DonateRequest): Promise<DonateResult> {
    return guard(() => give.donate(this.ctx, request));
  }

  createCampaign(input: CreateCampaignInput): Promise<Campaign> {
    return guard(() => give.createCampaign(this.ctx, input));
  }

  verifyReceipt(campaignId: string, secret: string): Promise<ReceiptVerification> {
    return guard(() => give.verifyReceipt(this.ctx, campaignId, secret));
  }

  listMyDonations(campaignId?: string): Promise<readonly MyDonation[]> {
    return guard(() => give.listMyDonations(this.ctx, campaignId));
  }

  claimRefund(donationId: string): Promise<MyDonation> {
    return guard(() => give.claimRefund(this.ctx, donationId));
  }

  finishCampaign(campaignId: string): Promise<Campaign> {
    return guard(() => give.finishCampaign(this.ctx, campaignId));
  }
}
