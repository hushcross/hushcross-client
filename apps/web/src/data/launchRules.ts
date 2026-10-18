import type { CreateSaleInput } from './types';

/** Creator parameter bounds from SPEC §4. */
export const SALE_BOUNDS = {
  commitHoursMin: 1,
  commitHoursMax: 72,
  revealHoursMin: 1,
  revealHoursMax: 72,
  liquidityBpsMin: 3000,
  liquidityBpsMax: 8000,
  tokenLiquidityBpsMin: 1000,
  creatorShareBpsMax: 1000,
  creatorVestDaysMin: 90,
  /** LaunchFactory MAX_VESTING_DURATION (4 x 365 days). */
  creatorVestDaysMax: 1460,
  maxBidsPerSale: 1000,
  raiseFeeBps: 100,
} as const;

export type SaleField = keyof CreateSaleInput;

export interface SaleIssue {
  readonly field: SaleField;
  /** i18n key under `launch.create.errors`. */
  readonly code: 'required' | 'range' | 'symbol' | 'positive' | 'supply';
}

const inRange = (value: number, min: number, max: number): boolean =>
  Number.isFinite(value) && value >= min && value <= max;

export function validateSaleInput(input: CreateSaleInput): readonly SaleIssue[] {
  const issues: SaleIssue[] = [];
  const b = SALE_BOUNDS;
  if (input.tokenName.trim().length < 2) issues.push({ field: 'tokenName', code: 'required' });
  if (!/^[A-Z0-9]{2,8}$/.test(input.tokenSymbol)) issues.push({ field: 'tokenSymbol', code: 'symbol' });
  if (input.totalSupply <= 0n) issues.push({ field: 'totalSupply', code: 'positive' });
  if (input.saleAmount <= 0n) issues.push({ field: 'saleAmount', code: 'positive' });
  if (input.floorPrice <= 0n) issues.push({ field: 'floorPrice', code: 'positive' });
  if (input.minRaise < 0n) issues.push({ field: 'minRaise', code: 'positive' });
  if (!inRange(input.commitHours, b.commitHoursMin, b.commitHoursMax)) issues.push({ field: 'commitHours', code: 'range' });
  if (!inRange(input.revealHours, b.revealHoursMin, b.revealHoursMax)) issues.push({ field: 'revealHours', code: 'range' });
  if (!inRange(input.liquidityBps, b.liquidityBpsMin, b.liquidityBpsMax)) issues.push({ field: 'liquidityBps', code: 'range' });
  if (!inRange(input.tokenLiquidityBps, b.tokenLiquidityBpsMin, 10_000)) issues.push({ field: 'tokenLiquidityBps', code: 'range' });
  if (!inRange(input.creatorShareBps, 0, b.creatorShareBpsMax)) issues.push({ field: 'creatorShareBps', code: 'range' });
  if (!inRange(input.creatorVestDays, b.creatorVestDaysMin, b.creatorVestDaysMax)) issues.push({ field: 'creatorVestDays', code: 'range' });
  if (input.totalSupply > 0n && input.saleAmount > 0n) {
    const reserved = (input.totalSupply * BigInt(input.tokenLiquidityBps + input.creatorShareBps)) / 10_000n;
    if (input.saleAmount + reserved > input.totalSupply) issues.push({ field: 'saleAmount', code: 'supply' });
  }
  return issues;
}
