/** Real-shaped, plain-number inputs for the Launch and Book heroes. */

export interface HeroBid {
  /** Price per token in the quote asset. */
  readonly price: number;
  /** Tokens demanded at that price (max spend / price). */
  readonly amount: number;
}

export interface LadderRow extends HeroBid {
  readonly cumulative: number;
  readonly wins: boolean;
}

export interface Ladder {
  readonly rows: readonly LadderRow[];
  /** Uniform clearing price p*, or null when there are no bids. */
  readonly clearingPrice: number | null;
  readonly filled: number;
}

/** Sort bids high → low, accumulate demand and stop where it covers the supply. */
export function launchLadder(bids: readonly HeroBid[], supply: number): Ladder {
  const sorted = [...bids].filter((b) => b.amount > 0 && b.price > 0).sort((a, b) => b.price - a.price);
  let cumulative = 0;
  let clearingIndex = -1;
  const rows: LadderRow[] = [];
  sorted.forEach((bid, i) => {
    cumulative += bid.amount;
    if (clearingIndex < 0 && cumulative >= supply) clearingIndex = i;
    rows.push({ ...bid, cumulative, wins: false });
  });
  if (rows.length === 0) return { rows, clearingPrice: null, filled: 0 };
  const last = clearingIndex < 0 ? rows.length - 1 : clearingIndex;
  const withWins = rows.map((row, i) => ({ ...row, wins: i <= last }));
  return { rows: withWins, clearingPrice: withWins[last]?.price ?? null, filled: Math.min(supply, withWins[last]?.cumulative ?? 0) };
}

export interface HeroOrder {
  readonly price: number;
  readonly amount: number;
}

export interface BookCross {
  readonly price: number | null;
  readonly volume: number;
  readonly inBand: boolean;
  readonly band: readonly [number, number];
}

/** Max-volume uniform price (midpoint of ties) and whether it sits inside the reference band. */
export function bookCross(buys: readonly HeroOrder[], sells: readonly HeroOrder[], reference: number, bandBps: number): BookCross {
  const band: [number, number] = [reference * (1 - bandBps / 10_000), reference * (1 + bandBps / 10_000)];
  const prices = [...new Set([...buys, ...sells].map((o) => o.price))].sort((a, b) => a - b);
  let best = 0;
  let low: number | null = null;
  let high: number | null = null;
  for (const p of prices) {
    const demand = buys.filter((o) => o.price >= p).reduce((s, o) => s + o.amount, 0);
    const supply = sells.filter((o) => o.price <= p).reduce((s, o) => s + o.amount, 0);
    const volume = Math.min(demand, supply);
    if (volume > best) {
      best = volume;
      low = p;
      high = p;
    } else if (volume === best && volume > 0) high = p;
  }
  if (low === null || high === null || best === 0) return { price: null, volume: 0, inBand: false, band };
  const price = (low + high) / 2;
  return { price, volume: best, inBand: price >= band[0] && price <= band[1], band };
}

/** Cumulative curves for drawing: buys descend with price, sells ascend. */
export function bookCurves(buys: readonly HeroOrder[], sells: readonly HeroOrder[]): { buy: [number, number][]; sell: [number, number][] } {
  const prices = [...new Set([...buys, ...sells].map((o) => o.price))].sort((a, b) => a - b);
  return {
    buy: prices.map((p) => [p, buys.filter((o) => o.price >= p).reduce((s, o) => s + o.amount, 0)]),
    sell: prices.map((p) => [p, sells.filter((o) => o.price <= p).reduce((s, o) => s + o.amount, 0)]),
  };
}

export const DEMO_BIDS: readonly HeroBid[] = [
  { price: 0.052, amount: 18 },
  { price: 0.049, amount: 12 },
  { price: 0.047, amount: 22 },
  { price: 0.045, amount: 15 },
  { price: 0.044, amount: 20 },
  { price: 0.041, amount: 26 },
  { price: 0.039, amount: 14 },
  { price: 0.036, amount: 18 },
];
export const DEMO_SUPPLY = 90;

export const DEMO_BUYS: readonly HeroOrder[] = [
  { price: 604, amount: 3 },
  { price: 601, amount: 4 },
  { price: 599, amount: 5 },
  { price: 596, amount: 4 },
  { price: 592, amount: 3 },
];
export const DEMO_SELLS: readonly HeroOrder[] = [
  { price: 593, amount: 2 },
  { price: 596, amount: 4 },
  { price: 598, amount: 5 },
  { price: 602, amount: 4 },
  { price: 606, amount: 3 },
];
export const DEMO_REFERENCE = 598.4;
