import { mockSaleAddress } from './mockProfiles';
import type { SealedBid } from '../clearing';
import type {
  ActivityItem,
  Address,
  Asset,
  Campaign,
  Funding,
  Hex,
  IncomingPayment,
  ModuleId,
  OrderSide,
  Pair,
  PaymentRequest,
  Recipient,
  Sale,
} from '../types';
import { UNIT_VALUES, WAD } from '../units';
import { createRng, DAY, HOUR, MINUTE, pick, randomAddress, randomHex, randomTxHash, SECOND } from './mockUtil';

/* Timing used by the mock to make flows progress visibly in a demo session. */
export const REVIEW_MS = 18 * SECOND;
export const MIX_TICK_MS = 12 * SECOND;
export const RELAY_SUBMIT_MS = 5 * SECOND;
/** One user-selected relay-delay minute lasts this long in the mock. */
export const RELAY_MINUTE_MS = 2 * SECOND;
export const REDEPOSIT_MS = 8 * SECOND;
export const SETTLE_MS = 20 * SECOND;
export const EPOCH_MS = 10 * MINUTE;
export const COMMIT_MS = 8 * MINUTE;
export const RELAY_FEE_BPS = 50;
export const BNB_USD = 598n;

export interface NoteRecord {
  readonly id: string;
  readonly asset: Asset;
  readonly amount: bigint;
  readonly index: number;
  readonly createdAt: number;
  readonly approvedAt: number;
  readonly declined: boolean;
  readonly depositTx: Hex;
  readonly baseMixed: number;
  readonly spentIn: ModuleId | null;
  readonly exited: boolean;
}

export interface RelayRecord {
  readonly id: string;
  readonly createdAt: number;
  readonly executeAfter: number;
  readonly recipient: Recipient;
  readonly asset: Asset;
  readonly amount: bigint;
  readonly txHash: Hex;
}

export interface IncomingRecord extends Omit<IncomingPayment, 'status'> {
  readonly redepositAt: number | null;
}

export type SaleRecord = Omit<Sale, 'phase' | 'clearing' | 'bidCount' | 'totalDeposits'> & {
  readonly syntheticBids: readonly SealedBid[];
};

export interface BidRecord {
  readonly id: string;
  readonly saleId: string;
  readonly price: bigint;
  readonly maxSpend: bigint;
  readonly deposit: bigint;
  readonly funding: Funding;
  readonly delegatedReveal: boolean;
  readonly createdAt: number;
  readonly revealedAt: number | null;
  readonly claimedAt: number | null;
}

export interface OrderRecord {
  readonly id: string;
  readonly pairId: string;
  readonly side: OrderSide;
  readonly limitPrice: bigint;
  readonly amount: bigint;
  readonly epoch: number;
  readonly rollover: boolean;
  readonly funding: Funding;
  readonly createdAt: number;
  readonly escrow?: bigint;
  readonly claimedAt?: number | null;
  readonly rolledInto?: string | null;
}

export type CampaignRecord = Omit<Campaign, 'raised' | 'donationCount' | 'status'> & {
  readonly baseRaised: bigint;
  readonly baseCount: number;
};

export interface DonationRecord {
  readonly id: string;
  readonly campaignId: string;
  readonly amount: bigint;
  readonly at: number;
  readonly receiptSecret: string | null;
  readonly funding?: Funding;
  readonly refundedAt?: number | null;
}

export type ActivityRecord = Omit<ActivityItem, 'status'> & {
  readonly resolveAt: number;
  readonly failed: boolean;
};

export interface MockState {
  readonly hushId: string | null;
  readonly metaAddress: string;
  readonly publicAddress: Address | null;
  readonly vaultCreatedAt: number;
  readonly publicWallet: Record<Asset, bigint>;
  readonly notes: readonly NoteRecord[];
  readonly relayJobs: readonly RelayRecord[];
  readonly incoming: readonly IncomingRecord[];
  readonly paymentRequests: readonly PaymentRequest[];
  readonly sales: readonly SaleRecord[];
  readonly bids: readonly BidRecord[];
  readonly pairs: readonly Pair[];
  readonly orders: readonly OrderRecord[];
  readonly campaigns: readonly CampaignRecord[];
  readonly donations: readonly DonationRecord[];
  readonly activity: readonly ActivityRecord[];
  readonly backupExportedAt: number | null;
  readonly takenNames: readonly string[];
}

const usd = (n: number): bigint => BigInt(Math.round(n * 1e6)) * 10n ** 12n;

function syntheticBids(seed: number, count: number, floor: bigint, asset: Asset): SealedBid[] {
  const rng = createRng(seed);
  const units = UNIT_VALUES[asset].slice(0, 4);
  return Array.from({ length: count }, (_, i) => ({
    id: `syn-${seed}-${i}`,
    price: (floor * BigInt(100 + Math.floor(rng() * 260))) / 100n,
    maxSpend: pick(rng, units) * BigInt(1 + Math.floor(rng() * 3)),
  }));
}

export function createSeed(t0: number): MockState {
  const rng = createRng(20261016);
  const note = (
    index: number,
    asset: Asset,
    amount: bigint,
    ageMs: number,
    extra: Partial<Pick<NoteRecord, 'declined' | 'spentIn' | 'exited' | 'approvedAt'>> = {},
  ): NoteRecord => ({
    id: `note-${index}`,
    asset,
    amount,
    index,
    createdAt: t0 - ageMs,
    approvedAt: extra.approvedAt ?? t0 - ageMs + REVIEW_MS,
    declined: extra.declined ?? false,
    depositTx: randomTxHash(rng),
    baseMixed: 140 + Math.floor(rng() * 900),
    spentIn: extra.spentIn ?? null,
    exited: extra.exited ?? false,
  });

  const notes: NoteRecord[] = [
    note(0, 'BNB', 2n * WAD, 21 * DAY),
    note(1, 'USDT', 500n * WAD, 18 * DAY),
    note(2, 'USDT', 2000n * WAD, 16 * DAY),
    note(3, 'BNB', WAD / 2n, 12 * DAY),
    note(4, 'USDT', 100n * WAD, 9 * DAY),
    note(5, 'USDT', 100n * WAD, 9 * DAY),
    note(6, 'USDT', 100n * WAD, 8 * DAY, { spentIn: 'send' }),
    note(7, 'BNB', WAD / 10n, 6 * DAY),
    note(8, 'BNB', WAD / 10n, 5 * DAY),
    note(9, 'USDT', 20n * WAD, 4 * DAY, { exited: true }),
    note(10, 'BNB', WAD / 50n, 3 * DAY, { declined: true }),
    note(11, 'USDT', 100n * WAD, 2 * DAY),
    note(12, 'BNB', WAD / 2n, 20 * SECOND, { approvedAt: t0 + 25 * SECOND }),
  ];

  const sale = (
    id: string,
    name: string,
    symbol: string,
    description: string,
    quote: Asset,
    commitStart: number,
    commitHours: number,
    revealMs: number,
    floor: bigint,
    minRaise: bigint,
    bidCount: number,
    seed: number,
  ): SaleRecord => ({
    id,
    address: mockSaleAddress(id),
    tokenName: name,
    tokenSymbol: symbol,
    description,
    creator: randomAddress(rng),
    tokenAddress: randomAddress(rng),
    totalSupply: 1_000_000_000n * WAD,
    saleAmount: 350_000_000n * WAD,
    floorPrice: floor,
    minRaise,
    quoteAsset: quote,
    commitStart,
    commitEnd: commitStart + commitHours * HOUR,
    revealEnd: commitStart + commitHours * HOUR + revealMs,
    liquidityBps: 6000,
    tokenLiquidityBps: 1500,
    creatorShareBps: 500,
    creatorVestDays: 180,
    syntheticBids: syntheticBids(seed, bidCount, floor, quote),
  });

  const loomStart = t0 - 60 * SECOND;
  const sales: SaleRecord[] = [
    sale('fern', 'Quiet Fern', 'FERN', 'A community token for a slow-living forum. Proceeds seed a PancakeSwap pool with locked liquidity.', 'BNB', t0 - 20 * HOUR, 24, 2 * HOUR, WAD / 3_500_000n, 40n * WAD, 182, 11),
    { ...sale('loom', 'Loom', 'LOOM', 'Tooling for shared ledgers among small co-ops. This sale is short so you can watch every phase.', 'USDT', loomStart, 1, 75 * SECOND, usd(0.0000857), 20_000n * WAD, 64, 12), commitEnd: t0 + 75 * SECOND, revealEnd: t0 + 150 * SECOND },
    sale('tide', 'Tidepool', 'TIDE', 'Membership token for a coastal research collective.', 'BNB', t0 - 25 * HOUR, 24, 2 * HOUR, WAD / 4_375_000n, 30n * WAD, 140, 13),
    sale('orbit', 'Orbit Mail', 'ORBT', 'Credits for an end-to-end encrypted mail relay.', 'USDT', t0 - 3 * DAY, 48, 4 * HOUR, usd(0.000343), 5000n * WAD, 220, 14),
    sale('kiln', 'Kiln', 'KILN', 'Studio pottery collective. Did not reach its minimum raise.', 'BNB', t0 - 5 * DAY, 24, 2 * HOUR, WAD / 1_000_000n, 900n * WAD, 18, 15),
    sale('aster', 'Aster Notes', 'ASTR', 'Note-taking app with local-first sync. Bidding opens soon.', 'USDT', t0 + 6 * HOUR, 36, 3 * HOUR, usd(0.0002), 3000n * WAD, 0, 16),
  ];

  const bids: BidRecord[] = [
    { id: 'bid-1', saleId: 'fern', price: WAD / 1_500_000n, maxSpend: WAD / 2n, deposit: WAD / 2n, funding: 'vault', delegatedReveal: true, createdAt: t0 - 6 * HOUR, revealedAt: null, claimedAt: null },
    { id: 'bid-2', saleId: 'tide', price: WAD / 1_800_000n, maxSpend: WAD / 5n, deposit: WAD / 5n, funding: 'vault', delegatedReveal: false, createdAt: t0 - 4 * HOUR - DAY, revealedAt: null, claimedAt: null },
    { id: 'bid-3', saleId: 'orbit', price: usd(0.00086), maxSpend: 500n * WAD, deposit: 500n * WAD, funding: 'vault', delegatedReveal: true, createdAt: t0 - 2 * DAY, revealedAt: t0 - DAY, claimedAt: null },
    { id: 'bid-4', saleId: 'kiln', price: WAD / 500_000n, maxSpend: WAD / 10n, deposit: WAD / 10n, funding: 'public', delegatedReveal: true, createdAt: t0 - 4 * DAY, revealedAt: t0 - 4 * DAY, claimedAt: null },
  ];

  const pairs: Pair[] = [
    { id: 'wbnb-usdt', base: 'WBNB', quote: 'USDT', referencePrice: usd(598.42), referenceSource: 'chainlink', lastClearingPrice: usd(598.1), tick: usd(0.01), lot: WAD / 1000n, vaultSell: true },
    { id: 'btcb-usdt', base: 'BTCB', quote: 'USDT', referencePrice: usd(104230.5), referenceSource: 'chainlink', lastClearingPrice: usd(104190), tick: usd(0.1), lot: WAD / 100_000n, vaultSell: false },
    { id: 'eth-usdt', base: 'ETH', quote: 'USDT', referencePrice: usd(3912.8), referenceSource: 'chainlink', lastClearingPrice: usd(3915.2), tick: usd(0.01), lot: WAD / 10_000n, vaultSell: false },
    { id: 'orbt-usdt', base: 'ORBT', quote: 'USDT', referencePrice: usd(0.000241), referenceSource: 'twap', lastClearingPrice: usd(0.000239), tick: 10n ** 9n, lot: WAD, vaultSell: false },
  ];

  const epoch = Math.floor(t0 / EPOCH_MS);
  const orders: OrderRecord[] = [
    { id: 'ord-1', pairId: 'wbnb-usdt', side: 'buy', limitPrice: usd(610), amount: WAD / 2n, epoch: epoch - 3, rollover: false, funding: 'vault', createdAt: t0 - 32 * MINUTE },
    { id: 'ord-2', pairId: 'wbnb-usdt', side: 'sell', limitPrice: usd(640), amount: WAD / 5n, epoch: epoch - 2, rollover: true, funding: 'vault', createdAt: t0 - 22 * MINUTE },
    { id: 'ord-3', pairId: 'eth-usdt', side: 'buy', limitPrice: usd(3700), amount: WAD / 10n, epoch: epoch - 1, rollover: false, funding: 'vault', createdAt: t0 - 12 * MINUTE },
  ];

  const campaigns: CampaignRecord[] = [
    { id: 'harbor-library', kind: 'goal', title: 'Harbor Street library roof', story: 'The reading room has leaked for two winters. Funds go to a licensed roofer; invoices will be posted on this page.', recipient: '@harborlib', escrowAddress: randomAddress(rng), asset: 'USDT', goal: 12_000n * WAD, deadline: t0 + 9 * DAY, createdAt: t0 - 12 * DAY, createdByMe: false, baseRaised: 7340n * WAD, baseCount: 86 },
    { id: 'open-relay', kind: 'tip', title: 'Keep an open-source relay running', story: 'Tips cover servers and gas for a relay anyone can self-host. Monthly cost reports are linked in the repository.', recipient: '@relaykeeper', escrowAddress: randomAddress(rng), asset: 'BNB', goal: null, deadline: null, createdAt: t0 - 40 * DAY, createdByMe: false, baseRaised: 1462n * WAD / 100n, baseCount: 203 },
    { id: 'flood-kits', kind: 'goal', title: 'Flood kits for river towns', story: 'Water filters, dry bags and radios for three villages downstream. The goal was reached; the organiser has withdrawn the funds.', recipient: '0x5b2e4c1a9d8f7e6b3a2c1d0e9f8a7b6c5d4e3f21', escrowAddress: randomAddress(rng), asset: 'USDT', goal: 5000n * WAD, deadline: t0 - 2 * DAY, createdAt: t0 - 30 * DAY, createdByMe: false, baseRaised: 5420n * WAD, baseCount: 117 },
    { id: 'zine', kind: 'goal', title: 'Night-market zine, issue 3', story: 'Printing costs for a free zine. The goal was not reached, so every donation returns to its donor’s vault.', recipient: '@nightzine', escrowAddress: randomAddress(rng), asset: 'USDT', goal: 3000n * WAD, deadline: t0 - DAY, createdAt: t0 - 21 * DAY, createdByMe: false, baseRaised: 1180n * WAD, baseCount: 24 },
    { id: 'guides', kind: 'tip', title: 'Translations for privacy guides', story: 'Tips fund translating plain-language wallet safety guides into six languages.', recipient: '@mira', escrowAddress: randomAddress(rng), asset: 'USDT', goal: null, deadline: null, createdAt: t0 - 8 * DAY, createdByMe: true, baseRaised: 640n * WAD, baseCount: 19 },
  ];

  const incoming: IncomingRecord[] = [
    { id: 'in-1', stealthAddress: randomAddress(rng), asset: 'USDT', amount: 100n * WAD, at: t0 - 3 * HOUR, redepositAt: null },
    { id: 'in-2', stealthAddress: randomAddress(rng), asset: 'BNB', amount: WAD / 10n, at: t0 - 2 * DAY, redepositAt: t0 - 2 * DAY + HOUR },
  ];

  const act = (id: string, kind: ActivityRecord['kind'], module: ModuleId, asset: string, amount: bigint, ageMs: number, subject?: string): ActivityRecord => ({
    id,
    kind,
    module,
    asset,
    amount,
    at: t0 - ageMs,
    resolveAt: t0 - ageMs + REVIEW_MS,
    failed: false,
    ...(subject === undefined ? {} : { subject }),
  });

  return {
    hushId: 'mira',
    metaAddress: `st:bsc:0x02${randomHex(rng, 32)}03${randomHex(rng, 32)}`,
    publicAddress: randomAddress(rng),
    vaultCreatedAt: t0 - 22 * DAY,
    publicWallet: { BNB: 3_481_200_000_000_000_000n, USDT: 1250n * WAD },
    notes,
    relayJobs: [],
    incoming,
    paymentRequests: [
      { id: 'req-1', hushId: 'mira', asset: 'USDT', unit: 100n * WAD, count: 1, note: 'Design review', path: '/pay/mira?asset=USDT&units=100', createdAt: t0 - 5 * DAY, status: 'paid' },
    ],
    sales,
    bids,
    pairs,
    orders,
    campaigns,
    donations: [],
    activity: [
      { ...act('a-1', 'deposit', 'vault', 'BNB', WAD / 2n, 20 * SECOND), resolveAt: t0 + 25 * SECOND },
      act('a-2', 'receive', 'send', 'USDT', 100n * WAD, 3 * HOUR),
      act('a-3', 'order', 'book', 'ETH', WAD / 10n, 12 * MINUTE, 'ETH/USDT'),
      act('a-4', 'bid', 'launch', 'BNB', WAD / 2n, 6 * HOUR, 'FERN'),
      act('a-5', 'donation', 'give', 'USDT', 100n * WAD, DAY, 'Harbor Street library roof'),
      act('a-6', 'send', 'send', 'USDT', 100n * WAD, 8 * DAY, '@juno'),
      act('a-7', 'exit', 'vault', 'USDT', 20n * WAD, 4 * DAY),
    ],
    backupExportedAt: t0 - 20 * DAY,
    takenNames: ['harborlib', 'relaykeeper', 'nightzine', 'juno', 'admin', 'hush'],
  };
}
