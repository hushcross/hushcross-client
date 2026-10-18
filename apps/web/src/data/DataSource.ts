import type {
  Account,
  ActivityItem,
  BackupFile,
  BackupProtection,
  BackupStatus,
  Balances,
  Bid,
  BidRequest,
  BidQuote,
  Campaign,
  CreateCampaignInput,
  CreateSaleInput,
  DataListener,
  DepositRequest,
  DepositResult,
  DonateRequest,
  DonateResult,
  Donation,
  EpochClearing,
  EpochInfo,
  IncomingPayment,
  Note,
  Order,
  OrderRequest,
  Pair,
  PaymentRequest,
  PaymentRequestInput,
  PoolStats,
  Asset,
  Address,
  ReceiptVerification,
  RecipientResolution,
  RecoveryResult,
  RelayJob,
  Sale,
  SendQuote,
  SendRequest,
  ShortNameResult,
  Unsubscribe,
  VaultConfig,
  WalletPayment,
  WalletPaymentRequest,
  PrivacyContextRequest,
  CreateGiftInput,
  Gift,
  GiftView,
  GiftDestination,
  GiftClaimResult,
  MyDonation,
  OrderQuote,
  RevealedBook,
  OneTimeFunds,
  OneTimeSendRequest,
  OneTimeSendResult,
  SaleProfile,
  SaleProfileInput,
} from './types';
import type { PrivacyContext } from './privacyCheck';

/**
 * Error codes a DataSource may raise. Pages map each code to the
 * `errors.<code>` i18n key, so new codes must be added to both locales.
 */
export type DataErrorCode =
  | 'invalid_input'
  | 'insufficient_vault'
  | 'insufficient_wallet'
  | 'not_found'
  | 'phase_closed'
  | 'wallet_required'
  | 'network'
  | 'locked'
  | 'wrong_network'
  | 'in_review'
  | 'relay_rejected'
  | 'tx_failed'
  | 'not_creator';

export class DataSourceError extends Error {
  readonly code: DataErrorCode;

  constructor(code: DataErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'DataSourceError';
    this.code = code;
  }
}

export function isDataSourceError(value: unknown): value is DataSourceError {
  return value instanceof DataSourceError;
}

/**
 * Everything the web app reads or writes. Pages only talk to this interface
 * (via `useDataSource()`), so the mock and the on-chain implementation are
 * interchangeable. All methods are async; writes resolve once the action is
 * accepted (signed / submitted), and progress is observed by re-reading after
 * a `subscribe` notification.
 */
export interface DataSource {
  /* Session */
  getAccount(): Promise<Account>;
  /** Connect a public wallet (EIP-1193 in the real implementation). */
  connectWallet(): Promise<Account>;
  getBalances(): Promise<Balances>;
  listActivity(limit: number): Promise<readonly ActivityItem[]>;
  /** Notified with the topics whose data changed (writes or time-based progress). */
  subscribe(listener: DataListener): Unsubscribe;

  /* Vault */
  getVaultConfig(): Promise<VaultConfig>;
  getPoolStats(asset: Asset): Promise<PoolStats>;
  listNotes(): Promise<readonly Note[]>;
  /** Public deposit from the connected wallet; each unit becomes one note. */
  deposit(request: DepositRequest): Promise<DepositResult>;
  /** Public exit back to the original depositor address (reveals the link). */
  exitPublicly(noteId: string): Promise<Note>;
  /** Scan both pools with the 24-word phrase and rebuild the local note set. */
  recoverFromPhrase(words: readonly string[]): Promise<RecoveryResult>;
  getBackupStatus(): Promise<BackupStatus>;
  exportBackup(protection: BackupProtection, passphrase: string | null): Promise<BackupFile>;

  /* Send */
  resolveRecipient(input: string): Promise<RecipientResolution>;
  quoteSend(request: SendRequest): Promise<SendQuote>;
  send(request: SendRequest): Promise<RelayJob>;
  listRelayJobs(): Promise<readonly RelayJob[]>;
  /** Pay from the public wallet (to a one-time address for Hush IDs). Links the payer's wallet. */
  payFromWallet(request: WalletPaymentRequest): Promise<WalletPayment>;
  claimShortName(name: string): Promise<ShortNameResult>;
  createPaymentRequest(input: PaymentRequestInput): Promise<PaymentRequest>;
  listPaymentRequests(): Promise<readonly PaymentRequest[]>;
  listIncoming(): Promise<readonly IncomingPayment[]>;
  /** Move funds received at a one-time address back into the vault. */
  redepositIncoming(id: string): Promise<IncomingPayment>;
  /** One-time addresses that Book trades and Give refunds paid, with their balances. */
  listOneTimeFunds(): Promise<readonly OneTimeFunds[]>;
  /** Public deposit from the one-time address back into the vault (USDT / BNB at or above the smallest unit). */
  moveOneTimeToVault(id: string, asset: Asset): Promise<OneTimeFunds>;
  /** Send one whole holding from a one-time address to a regular address, gas paid from the address's BNB. */
  sendFromOneTime(request: OneTimeSendRequest): Promise<OneTimeSendResult>;

  /* Gift (SPEC §3.1) */
  createGift(input: CreateGiftInput): Promise<Gift>;
  listMyGifts(): Promise<readonly Gift[]>;
  /** Return unclaimed packets of an expired gift to the sender's vault. */
  reclaimGift(id: string): Promise<Gift>;
  /** Look up a gift from the secret in a link fragment (without the leading #). */
  openGift(fragment: string): Promise<GiftView>;
  claimGift(fragment: string, destination: GiftDestination): Promise<GiftClaimResult>;

  /* Privacy check (SPEC §2.1) — chain facts only; the rating is computed locally. */
  getPrivacyContext(request: PrivacyContextRequest): Promise<PrivacyContext>;

  /* Launch */
  listSales(): Promise<readonly Sale[]>;
  getSale(id: string): Promise<Sale>;
  listMyBids(saleId?: string): Promise<readonly Bid[]>;
  placeBid(request: BidRequest): Promise<Bid>;
  revealBid(bidId: string): Promise<Bid>;
  claimBid(bidId: string): Promise<Bid>;
  /** Vault cost of a sealed bid (escrow in whole units plus the relay fee). */
  quoteBid(saleId: string, maxSpend: bigint): Promise<BidQuote>;
  /**
   * Claim through the relay (it pays the gas and submits `claim` with the stored refund
   * precommitments), so no public wallet appears. Only for revealed bids after finalisation.
   */
  claimBidViaRelay(bidId: string): Promise<Bid>;
  createSale(input: CreateSaleInput): Promise<Sale>;
  /** Submit the clearing price once the reveal window is over (anyone may; the contract verifies it). */
  finalizeSale(saleId: string): Promise<Sale>;
  /** Collect trading fees of the locked pool position (anyone may; split creator / treasury). */
  collectSaleFees(saleId: string): Promise<Sale>;
  /**
   * The sale's verified profile, or null (none, hidden, unreachable, or any hash mismatch): callers then
   * show the monogram. Never throws for a missing or bad profile.
   */
  getSaleProfile(sale: Address): Promise<SaleProfile | null>;
  /**
   * Publish a profile from the creator's public wallet: sign the upload, store it on the profile host,
   * then point the sale at it on chain (`LaunchFactory.setProfile`). `not_creator` for any other wallet.
   */
  saveSaleProfile(input: SaleProfileInput): Promise<SaleProfile>;

  /* Book */
  listPairs(): Promise<readonly Pair[]>;
  getEpoch(pairId: string): Promise<EpochInfo>;
  listMyOrders(pairId?: string): Promise<readonly Order[]>;
  placeOrder(request: OrderRequest): Promise<Order>;
  listClearings(pairId: string, limit: number): Promise<readonly EpochClearing[]>;
  /** Vault cost of an order (escrow in whole units + relay fee), the same plan `placeOrder` uses. */
  quoteOrder(request: OrderRequest): Promise<OrderQuote>;
  /** Submit the clearing of a finished epoch (anyone may; the contract verifies the certificate). Public action. */
  settleEpoch(pairId: string, epoch: number): Promise<EpochClearing>;
  /** Claim a final order through the relay (vault notes come back; no wallet appears). */
  claimOrder(orderId: string): Promise<Order>;
  /** Unfilled rest of a claimed order as a new sealed order in the current epoch (new commitment). */
  rolloverOrder(orderId: string): Promise<Order>;
  /** Revealed orders of the latest finished epoch with reveals (public after reveal); null when none. */
  getRevealedBook(pairId: string): Promise<RevealedBook | null>;

  /* Give */
  listCampaigns(): Promise<readonly Campaign[]>;
  getCampaign(id: string): Promise<Campaign>;
  listDonations(campaignId: string, limit: number): Promise<readonly Donation[]>;
  donate(request: DonateRequest): Promise<DonateResult>;
  createCampaign(input: CreateCampaignInput): Promise<Campaign>;
  verifyReceipt(campaignId: string, secret: string): Promise<ReceiptVerification>;
  listMyDonations(campaignId?: string): Promise<readonly MyDonation[]>;
  /** A missed goal: refund through the relay (vault donations re-enter the vault privately). */
  claimRefund(donationId: string): Promise<MyDonation>;
  /** After the deadline: settle the goal and, when reached, release the funds (anyone may). Public action. */
  finishCampaign(campaignId: string): Promise<Campaign>;
}
