/**
 * Domain types shared by every page. All token amounts are `bigint` in the
 * asset's smallest unit (BNB and BSC-USD both use 18 decimals). Prices are
 * `bigint` scaled by 1e18 (quote asset per 1 whole base token). Timestamps are
 * milliseconds since the Unix epoch.
 */

export type Asset = 'BNB' | 'USDT';
export const ASSETS: readonly Asset[] = ['BNB', 'USDT'];

export type Address = `0x${string}`;
export type Hex = `0x${string}`;
export type Millis = number;

export type ModuleId = 'vault' | 'send' | 'launch' | 'book' | 'give';

/* ------------------------------------------------------------------ Vault */

export interface UnitOption {
  readonly asset: Asset;
  /** Net amount that lands in the pool (what the user owns afterwards). */
  readonly net: bigint;
  /** Amount the wallet sends; gross - fee === net. */
  readonly gross: bigint;
  /** Vetting fee withheld by the pool. */
  readonly fee: bigint;
}

export interface VaultConfig {
  readonly vettingFeeBps: number;
  readonly maxRelayFeeBps: number;
  readonly units: Readonly<Record<Asset, readonly UnitOption[]>>;
  /** Default optional gas drop attached to relayed withdrawals, in BNB wei. */
  readonly defaultGasDrop: bigint;
  readonly maxRelayDelayMinutes: number;
  /** Recovery stops after this many consecutive unused note indices. */
  readonly recoveryGapLimit: number;
}

export interface Balances {
  /** Private balance: sum of approved, unspent notes. */
  readonly vault: Readonly<Record<Asset, bigint>>;
  /** Notes still under review (not yet spendable). */
  readonly vaultPending: Readonly<Record<Asset, bigint>>;
  /** Public wallet balance; `null` when no wallet is connected. */
  readonly publicWallet: Readonly<Record<Asset, bigint>> | null;
}

export type NoteStatus = 'in_review' | 'approved' | 'declined' | 'spent' | 'exited';

export interface Note {
  readonly id: string;
  readonly asset: Asset;
  readonly amount: bigint;
  readonly status: NoteStatus;
  readonly createdAt: Millis;
  /** Per-account sequence number used to derive the note secrets. */
  readonly index: number;
  readonly depositTx: Hex;
  /** Approved deposits in the same pool that this note is indistinguishable from. */
  readonly mixedWith: number;
  readonly spentIn?: ModuleId;
}

export interface DepositRequest {
  readonly asset: Asset;
  readonly unit: bigint;
  readonly count: number;
}

export interface DepositResult {
  readonly notes: readonly Note[];
  readonly txHash: Hex;
  readonly grossPaid: bigint;
}

export interface PoolStats {
  readonly asset: Asset;
  readonly approvedDeposits: number;
  readonly totalDeposits: number;
}

export interface RecoveryResult {
  readonly notesFound: number;
  readonly highestIndex: number;
  readonly scannedIndices: number;
}

export type BackupProtection = 'passkey' | 'passphrase';

export interface BackupFile {
  readonly fileName: string;
  readonly mimeType: string;
  readonly contents: string;
  readonly createdAt: Millis;
}

export interface BackupStatus {
  readonly protection: BackupProtection;
  readonly lastExportAt: Millis | null;
  readonly passkeySupported: boolean;
}

/* --------------------------------------------------------------- Activity */

export type ActivityKind =
  | 'deposit'
  | 'send'
  | 'receive'
  | 'bid'
  | 'order'
  | 'donation'
  | 'refund'
  | 'claim'
  | 'exit'
  | 'gift'
  | 'gift_claim'
  | 'gift_reclaim';

export type ActivityStatus = 'pending' | 'done' | 'failed';

export interface ActivityItem {
  readonly id: string;
  readonly kind: ActivityKind;
  readonly module: ModuleId;
  readonly asset: Asset | string;
  readonly amount: bigint;
  readonly at: Millis;
  readonly status: ActivityStatus;
  /** Short human label (Hush ID, sale symbol, campaign title). */
  readonly subject?: string;
}

/* ------------------------------------------------------------------- Send */

export interface Account {
  /** Registered short name (without the leading @), if any. */
  readonly hushId: string | null;
  /** ERC-6538 stealth meta-address encoded as `st:bsc:0x…`. */
  readonly metaAddress: string;
  /** Connected public wallet, if any. */
  readonly publicAddress: Address | null;
  readonly vaultCreatedAt: Millis;
  /**
   * Address the Hush ID is registered under on ERC-6538 (derived from the recovery phrase,
   * never the public wallet; the relay submits the registration). `null` in the mock.
   */
  readonly identityAddress: Address | null;
}

export type Recipient =
  | { readonly kind: 'hushId'; readonly hushId: string; readonly metaAddress: string }
  | { readonly kind: 'address'; readonly address: Address };

export type RecipientResolution =
  | { readonly ok: true; readonly recipient: Recipient }
  | { readonly ok: false; readonly reason: 'format' | 'not_found' };

export interface SendRequest {
  readonly recipient: Recipient;
  readonly asset: Asset;
  /** Unit values to withdraw; each one consumes one approved note. */
  readonly units: readonly bigint[];
  readonly relayDelayMinutes: number;
  readonly gasDrop: boolean;
  /**
   * Vault notes to spend, aligned with `units` (one-step jobs reserve their notes up front). Without
   * it the data source picks approved notes itself and skips notes that a running job holds.
   */
  readonly noteIds?: readonly string[];
}

/**
 * Why the gas drop is off or unavailable (decided rules): BNB never gets one; USDT defaults on only
 * from 100 USDT per withdrawal; a drop is never sent when it would push the relay fee over the cap.
 */
export type GasDropNote = 'bnb_never' | 'below_default_minimum' | 'gas_drop_over_cap';

export interface SendQuote {
  readonly amount: bigint;
  readonly relayFee: bigint;
  readonly relayFeeBps: number;
  /** BNB actually attached (0 when not applied, whatever was requested). */
  readonly gasDrop: bigint;
  readonly recipientGets: bigint;
  readonly notesUsed: number;
  /** The switch may be shown for this asset / amount. */
  readonly gasDropOffered: boolean;
  /** Suggested initial switch state for this request. */
  readonly gasDropDefaultOn: boolean;
  /** Explanation when the drop is unavailable, off by default, or was dropped to respect the cap. */
  readonly gasDropNote: GasDropNote | null;
}

export type RelayJobStatus = 'delayed' | 'submitted' | 'confirmed' | 'failed';

export interface RelayJob {
  readonly id: string;
  readonly status: RelayJobStatus;
  readonly createdAt: Millis;
  readonly executeAfter: Millis;
  readonly txHash: Hex | null;
  readonly recipient: Recipient;
  readonly asset: Asset;
  readonly amount: bigint;
}

export interface PaymentRequestInput {
  readonly asset: Asset;
  readonly unit: bigint;
  readonly count: number;
  readonly note: string;
}

export interface PaymentRequest {
  readonly id: string;
  readonly hushId: string;
  readonly asset: Asset;
  readonly unit: bigint;
  readonly count: number;
  readonly note: string;
  /** Path portion, e.g. `/pay/ada?asset=USDT&units=100`. */
  readonly path: string;
  readonly createdAt: Millis;
  readonly status: 'open' | 'paid';
}

export type IncomingStatus = 'unclaimed' | 'redepositing' | 'in_vault';

export interface IncomingPayment {
  readonly id: string;
  readonly stealthAddress: Address;
  readonly asset: Asset;
  readonly amount: bigint;
  readonly at: Millis;
  readonly status: IncomingStatus;
}

/**
 * A one-time address of this account that a trade (Book: bought tokens, USDT dust) or a refund (Give) paid.
 * Nothing announces these addresses; they come from the local order / donation records.
 */
/** Book trade, Launch sale (bid tokens and refund dust) or Give refund. */
export type OneTimeSource = 'trade' | 'sale' | 'refund';

export interface OneTimeHolding {
  /** 'BNB', 'USDT' or a Book base token symbol (e.g. 'BTCB'). */
  readonly symbol: string;
  readonly amount: bigint;
  /** The vault this holding can go back into right now (null: it can only be sent to an address). */
  readonly toVault: Asset | null;
}

export interface OneTimeFunds {
  /** Lower-case address (stable id). */
  readonly id: string;
  readonly source: OneTimeSource;
  readonly address: Address;
  /** Pair ('BTCB/USDT') for trades; the sale token's symbol for sales; null for refunds (or when unknown). */
  readonly market: string | null;
  /** SealedSale contract of a sale payout (for its logo); null / absent otherwise. */
  readonly sale?: Address | null;
  readonly at: Millis;
  /** Non-zero balances, BNB included. */
  readonly holdings: readonly OneTimeHolding[];
  /** BNB on the address for gas. */
  readonly gas: bigint;
  /** False when the key is not on this device (an old record without its key data). */
  readonly canMove: boolean;
}

export interface OneTimeSendRequest {
  readonly id: string;
  readonly symbol: string;
  /** Regular address that receives the whole holding (BNB: balance minus gas). */
  readonly to: Address;
}

export interface OneTimeSendResult {
  readonly txHash: Hex;
  readonly symbol: string;
  readonly amount: bigint;
}

export interface WalletPaymentRequest {
  readonly recipient: Recipient;
  readonly asset: Asset;
  readonly amount: bigint;
}

export interface WalletPayment {
  readonly txHash: Hex;
  /** One-time address the funds were sent to (Hush ID recipients only). */
  readonly oneTimeAddress: Address | null;
}

export type ShortNameResult = { readonly ok: true } | { readonly ok: false; readonly reason: 'taken' | 'invalid' };

/* ----------------------------------------------------------------- Launch */

export type SalePhase = 'upcoming' | 'commit' | 'reveal' | 'settle' | 'claim' | 'failed';

export interface SaleClearing {
  readonly price: bigint;
  readonly tokensSold: bigint;
  readonly raised: bigint;
  readonly succeeded: boolean;
  readonly winningBids: number;
  readonly poolAddress: Address | null;
}

export interface Sale {
  readonly id: string;
  /** SealedSale contract (the key of its off-chain profile). */
  readonly address: Address;
  readonly tokenName: string;
  readonly tokenSymbol: string;
  readonly description: string;
  readonly creator: Address;
  readonly tokenAddress: Address;
  readonly totalSupply: bigint;
  readonly saleAmount: bigint;
  readonly floorPrice: bigint;
  readonly minRaise: bigint;
  readonly quoteAsset: Asset;
  readonly commitStart: Millis;
  readonly commitEnd: Millis;
  readonly revealEnd: Millis;
  readonly liquidityBps: number;
  readonly tokenLiquidityBps: number;
  readonly creatorShareBps: number;
  readonly creatorVestDays: number;
  readonly bidCount: number;
  /** Total deposits locked behind sealed bids (the only public bid data). */
  readonly totalDeposits: bigint;
  readonly phase: SalePhase;
  readonly clearing: SaleClearing | null;
}

export type Funding = 'vault' | 'public';

export type BidStatus = 'sealed' | 'revealed' | 'won' | 'partial' | 'lost' | 'unrevealed' | 'claimed' | 'refunded';

export interface Bid {
  readonly id: string;
  readonly saleId: string;
  readonly price: bigint;
  readonly maxSpend: bigint;
  readonly deposit: bigint;
  readonly funding: Funding;
  readonly delegatedReveal: boolean;
  readonly status: BidStatus;
  readonly createdAt: Millis;
  readonly tokensAllocated: bigint;
  readonly spent: bigint;
  readonly refund: bigint;
}

export interface BidRequest {
  readonly saleId: string;
  readonly price: bigint;
  readonly maxSpend: bigint;
  readonly funding: Funding;
  readonly delegateReveal: boolean;
  /** Vault funding: the one note that pays for the bid (reserved by a one-step job). */
  readonly noteId?: string;
}

/** What a vault-funded bid of `maxSpend` takes out of the vault (one note covers `withdrawn`). */
export interface BidQuote {
  /** Deposit locked in the sale: whole units, at least `maxSpend`. */
  readonly escrow: bigint;
  /** Withdrawn from one vault note: escrow plus the relay fee, in whole units. */
  readonly withdrawn: bigint;
  readonly relayFee: bigint;
}

export interface CreateSaleInput {
  readonly tokenName: string;
  readonly tokenSymbol: string;
  readonly description: string;
  readonly totalSupply: bigint;
  readonly saleAmount: bigint;
  readonly floorPrice: bigint;
  readonly minRaise: bigint;
  readonly quoteAsset: Asset;
  readonly commitHours: number;
  readonly revealHours: number;
  readonly liquidityBps: number;
  readonly tokenLiquidityBps: number;
  readonly creatorShareBps: number;
  readonly creatorVestDays: number;
}

/**
 * Creator-published sale profile (logo, description, links), verified against the on-chain pointer.
 * Every text field is untrusted: render as plain text only.
 */
export interface SaleProfile {
  readonly sale: Address;
  readonly description: string;
  /** https URL (already validated); null when none. */
  readonly website: string | null;
  /** X handle without @. */
  readonly x: string | null;
  /** Telegram username without @. */
  readonly telegram: string | null;
  /** 256 px logo (blob: or data: URL of verified bytes); null = show the monogram. */
  readonly logoUrl: string | null;
  /** 64 px logo for lists. */
  readonly logoSmallUrl: string | null;
  readonly contentHash: Hex;
  readonly updatedAt: Millis;
}

export interface SaleProfileFieldsInput {
  readonly description: string;
  readonly website: string;
  readonly x: string;
  readonly telegram: string;
}

export type SaleLogoInput = { readonly kind: 'none' } | { readonly kind: 'keep' } | { readonly kind: 'replace'; readonly bytes: Uint8Array };

/** Progress of `saveSaleProfile`: wallet signature, upload to the profile host, then the on-chain pointer. */
export type SaleProfileStage = 'signing' | 'uploading' | 'confirming';

export interface SaleProfileInput {
  readonly sale: Sale;
  readonly fields: SaleProfileFieldsInput;
  readonly logo: SaleLogoInput;
  readonly onStage?: (stage: SaleProfileStage) => void;
}

/* ------------------------------------------------------------------- Book */

export interface Pair {
  readonly id: string;
  readonly base: string;
  readonly quote: 'USDT';
  /** Live oracle reference (Chainlink or PancakeSwap V3 TWAP); 0 when the oracle cannot be read. */
  readonly referencePrice: bigint;
  readonly referenceSource: 'chainlink' | 'twap';
  readonly lastClearingPrice: bigint | null;
  /** Limit prices are multiples of `tick` (USDT per whole base token, 1e18-scaled). */
  readonly tick: bigint;
  /** Quantities are multiples of `lot` (base units). */
  readonly lot: bigint;
  /** Sells can be funded from the vault (only the WBNB market: BNB notes are wrapped). */
  readonly vaultSell: boolean;
}

export type EpochPhase = 'commit' | 'reveal';

export interface EpochInfo {
  readonly pairId: string;
  readonly epoch: number;
  readonly phase: EpochPhase;
  readonly startsAt: Millis;
  readonly commitEndsAt: Millis;
  readonly revealEndsAt: Millis;
  readonly sealedOrders: number;
  /** The previous epoch while it waits for anyone to submit its clearing (null once final or empty). */
  readonly settling: SettlingEpoch | null;
}

export interface SettlingEpoch {
  readonly epoch: number;
  readonly orderCount: number;
  /** Until when `settle` is accepted; afterwards the epoch can only be voided (full refunds). */
  readonly settleEndsAt: Millis;
  readonly action: 'settle' | 'void';
}

export type OrderSide = 'buy' | 'sell';

export type OrderStatus = 'sealed' | 'revealed' | 'filled' | 'partial' | 'unfilled' | 'rolled' | 'refunded';

export interface Order {
  readonly id: string;
  readonly pairId: string;
  readonly side: OrderSide;
  readonly limitPrice: bigint;
  /** Base-token amount. */
  readonly amount: bigint;
  readonly filled: bigint;
  readonly epoch: number;
  readonly status: OrderStatus;
  readonly rollover: boolean;
  readonly funding: Funding;
  readonly clearingPrice: bigint | null;
  readonly createdAt: Millis;
  /** Escrow locked in the book (USDT for buys, base for sells). */
  readonly escrow?: bigint;
  /** The epoch is final and the order has not been claimed yet. */
  readonly claimable?: boolean;
  readonly claimed?: boolean;
  /** What the claim pays (base bought / USDT received, refunds of the unused escrow). */
  readonly payout?: OrderPayout | null;
  /** Vault-funded orders are revealed by the relay inside the reveal window. */
  readonly delegatedReveal?: boolean;
  /** Id of the order that rolled this one into a later epoch. */
  readonly rolledInto?: string | null;
}

export interface OrderPayout {
  readonly baseOut: bigint;
  readonly quoteOut: bigint;
  readonly baseRefund: bigint;
  readonly quoteRefund: bigint;
  readonly fee: bigint;
}

export interface OrderRequest {
  readonly pairId: string;
  readonly side: OrderSide;
  readonly limitPrice: bigint;
  readonly amount: bigint;
  readonly rollover: boolean;
  readonly funding: Funding;
  /** A one-step job reserved this note (vault funding). */
  readonly noteId?: string;
}

/** Vault cost of an order: the escrow rounded up to whole units plus the relay fee (one note). */
export interface OrderQuote {
  readonly fundingAsset: Asset | null;
  /** Escrow the order needs at its limit (buy: cost + 0.05% fee; sell: the quantity). */
  readonly required: bigint;
  readonly escrow: bigint;
  readonly withdrawn: bigint;
  readonly relayFee: bigint;
  /** Book fee at the limit price (0.05% of the notional). */
  readonly fee: bigint;
}

/** Revealed orders of the latest finished epoch (public after reveal), for the live Book animation. */
export interface RevealedBook {
  readonly pairId: string;
  readonly epoch: number;
  readonly buys: readonly { readonly price: bigint; readonly amount: bigint }[];
  readonly sells: readonly { readonly price: bigint; readonly amount: bigint }[];
  readonly referencePrice: bigint;
}

export type ClearingOutcome = 'cleared' | 'outside_band' | 'no_cross';

export interface EpochClearing {
  readonly pairId: string;
  readonly epoch: number;
  readonly outcome: ClearingOutcome;
  readonly price: bigint | null;
  readonly volume: bigint;
  readonly orderCount: number;
  readonly at: Millis;
  /** Oracle reference the contract read inside the settlement transaction (null for no-cross / voids). */
  readonly referencePrice?: bigint | null;
}

/* ------------------------------------------------------------------- Give */

export type CampaignKind = 'tip' | 'goal';
export type CampaignStatus = 'active' | 'succeeded' | 'failed';

export interface Campaign {
  readonly id: string;
  readonly kind: CampaignKind;
  readonly title: string;
  readonly story: string;
  /** Hush ID (`@name`) or a 0x address. */
  readonly recipient: string;
  readonly escrowAddress: Address;
  readonly asset: Asset;
  readonly raised: bigint;
  readonly donationCount: number;
  readonly goal: bigint | null;
  readonly deadline: Millis | null;
  readonly createdAt: Millis;
  readonly status: CampaignStatus;
  readonly createdByMe: boolean;
  /** Goal campaigns: the deadline passed and `settle` ran / the beneficiary was paid. */
  readonly settled?: boolean;
  readonly released?: boolean;
  /** Story link when the campaign points to an external page instead of an inline story. */
  readonly link?: string | null;
}

export interface Donation {
  readonly id: string;
  readonly campaignId: string;
  readonly amount: bigint;
  readonly at: Millis;
  readonly hasReceipt: boolean;
}

export interface DonateRequest {
  readonly campaignId: string;
  readonly unit: bigint;
  readonly count: number;
  readonly withReceipt: boolean;
  /** Default `vault` (GiveAdapter, the wallet never appears); `public` donates from the wallet. */
  readonly funding?: Funding;
  /** Notes a one-step job reserved, one per unit. */
  readonly noteIds?: readonly string[];
}

export type RefundState = 'none' | 'available' | 'pending' | 'refunded';

/** A donation this account made (kept in the encrypted vault). */
export interface MyDonation {
  readonly id: string;
  readonly campaignId: string;
  readonly amount: bigint;
  readonly at: Millis;
  readonly funding: Funding;
  readonly refund: RefundState;
  readonly receiptSecret: string | null;
}

export interface DonateResult {
  readonly donation: Donation;
  /** Present when a receipt was requested; shown once and kept by the donor. */
  readonly receiptSecret: string | null;
}

export interface CreateCampaignInput {
  readonly kind: CampaignKind;
  readonly title: string;
  readonly story: string;
  readonly recipient: string;
  readonly asset: Asset;
  readonly goal: bigint | null;
  readonly deadlineDays: number | null;
}

export type ReceiptVerification =
  | { readonly valid: true; readonly donation: Donation }
  | { readonly valid: false };

/* ------------------------------------------------------------ Privacy check */

export type PrivacyAction = 'send' | 'withdraw' | 'gift_create' | 'gift_claim' | 'order';

export interface PrivacyContextRequest {
  readonly action: PrivacyAction;
  readonly asset: Asset;
  /** Unit values that will be withdrawn from the vault (empty for gift claims). */
  readonly units: readonly bigint[];
  /** Plain destination address; `null` for stealth / one-time / vault destinations. */
  readonly recipientAddress: Address | null;
  readonly relayDelayMinutes: number;
  /** Gift claims: the gift's own deposit facts come from the link secret. */
  readonly giftSecret?: string;
  /** The exact notes that will be spent (one-step jobs); otherwise the data source predicts them. */
  readonly noteIds?: readonly string[];
}

/* ------------------------------------------------------------------- Gift */

export type GiftMode = 'single' | 'group' | 'personal';
export type PacketStatus = 'unclaimed' | 'claimed' | 'reclaimed';

export interface GiftPacket {
  readonly index: number;
  readonly amount: bigint;
  readonly status: PacketStatus;
  readonly claimedAt: Millis | null;
}

export interface Gift {
  readonly id: string;
  readonly mode: GiftMode;
  readonly asset: Asset;
  readonly total: bigint;
  readonly message: string;
  readonly funding: Funding;
  readonly createdAt: Millis;
  readonly expiresAt: Millis;
  readonly packets: readonly GiftPacket[];
  /** Link paths including the fragment: one for single/group, k for personal. */
  readonly links: readonly string[];
}

export interface CreateGiftInput {
  readonly mode: GiftMode;
  readonly asset: Asset;
  readonly unit: bigint;
  /** Total number of units across all packets. */
  readonly units: number;
  /** Number of packets (1 for a single gift). */
  readonly packets: number;
  readonly expiryHours: number;
  readonly message: string;
  readonly funding: Funding;
  /** Vault funding: only these notes may be used (reserved by a one-step job). */
  readonly noteIds?: readonly string[];
}

export type GiftOpenStatus = 'ready' | 'in_review' | 'all_claimed' | 'expired';

export interface GiftView {
  readonly asset: Asset;
  readonly mode: GiftMode;
  /** Amount of the packet this link would claim next (0 when none left). */
  readonly amount: bigint;
  readonly message: string;
  readonly status: GiftOpenStatus;
  readonly packetsTotal: number;
  readonly packetsLeft: number;
  readonly expiresAt: Millis;
  /** Gas-drop rules for claiming this packet to an address (same rules as sends). */
  readonly gasDropOffered: boolean;
  readonly gasDropDefaultOn: boolean;
  readonly gasDropNote: GasDropNote | null;
}

export type GiftDestination =
  | { readonly kind: 'address'; readonly address: Address; readonly gasDrop: boolean }
  | { readonly kind: 'vault' };

export interface GiftClaimResult {
  readonly amount: bigint;
  readonly asset: Asset;
  readonly destination: GiftDestination['kind'];
  readonly txHash: Hex;
  /** BNB attached for gas (0 when the rules or the fee cap ruled it out). */
  readonly gasDrop: bigint;
}

/* ----------------------------------------------------------------- Events */

export type DataTopic =
  | 'account'
  | 'balances'
  | 'notes'
  | 'activity'
  | 'send'
  | 'sales'
  | 'bids'
  | 'orders'
  | 'campaigns'
  | 'gifts';

export type DataListener = (topics: readonly DataTopic[]) => void;
export type Unsubscribe = () => void;
