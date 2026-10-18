import { grossForNet } from "../units.js";

/**
 * Amount helpers for one-step ("Simple mode") actions: a free amount becomes standard pool units,
 * pieces are matched to vault notes without touching notes another job holds, and whatever the vault
 * lacks becomes a list of unit deposits from the public wallet.
 */

export interface AmountSplit {
  /** Unit values to move, largest first. */
  readonly pieces: readonly bigint[];
  /** Sum of `pieces`. */
  readonly sent: bigint;
  /** What stays behind (below the smallest unit, or beyond `maxPieces`). */
  readonly remainder: bigint;
  /** True when `maxPieces` cut the split short. */
  readonly capped: boolean;
}

const desc = (a: bigint, b: bigint): number => (a > b ? -1 : a < b ? 1 : 0);

/**
 * Greedy split, largest unit first. Each unit divides the next one (SPEC §2: 0.02/0.1/0.5/2/10 and
 * 20/100/500/2000/10000), so greedy uses the fewest pieces for the amount it covers.
 */
export function splitAmount(amount: bigint, units: readonly bigint[], maxPieces = 10): AmountSplit {
  const sorted = [...units].filter((u) => u > 0n).sort(desc);
  const pieces: bigint[] = [];
  let left = amount > 0n ? amount : 0n;
  let capped = false;
  for (const unit of sorted) {
    while (left >= unit) {
      if (pieces.length >= maxPieces) {
        capped = true;
        break;
      }
      pieces.push(unit);
      left -= unit;
    }
    if (capped) break;
  }
  const sent = pieces.reduce((s, p) => s + p, 0n);
  return { pieces, sent, remainder: (amount > 0n ? amount : 0n) - sent, capped };
}

/** Smallest unit that is at least `need` (one note must cover it), or `null` when none is. */
export function smallestUnitAtLeast(need: bigint, units: readonly bigint[]): bigint | null {
  return [...units].sort((a, b) => -desc(a, b)).find((u) => u >= need) ?? null;
}

export type JobNoteStatus = "in_review" | "approved" | "declined" | "spent" | "exited";

export interface JobNote {
  readonly id: string;
  readonly asset: string;
  readonly balance: bigint;
  readonly status: JobNoteStatus;
}

/** A note can still back a piece (now or once screening approves it). */
export const usableNote = (note: JobNote): boolean => (note.status === "approved" || note.status === "in_review") && note.balance > 0n;

/**
 * Assign a distinct free note to every piece that has none: approved exact match, then a note still in
 * review with the exact value, then the smallest larger approved note, then the smallest larger one in
 * review. Notes in `reserved` (held by other jobs) and notes already assigned are never reused.
 */
export function assignNotes(pieces: readonly bigint[], current: readonly (string | null)[], notes: readonly JobNote[], asset: string, reserved: ReadonlySet<string>): (string | null)[] {
  const byId = new Map(notes.map((n) => [n.id, n]));
  const result = pieces.map((_, i) => {
    const id = current[i] ?? null;
    const note = id === null ? undefined : byId.get(id);
    return note && usableNote(note) && note.asset === asset && note.balance >= (pieces[i] as bigint) ? id : null;
  });
  const taken = new Set<string>([...reserved, ...result.filter((id): id is string => id !== null)]);
  const free = notes.filter((n) => n.asset === asset && usableNote(n) && !taken.has(n.id)).sort((a, b) => -desc(a.balance, b.balance));
  const order = pieces.map((p, i) => ({ p, i })).sort((a, b) => desc(a.p, b.p));
  const pick = (piece: bigint): JobNote | undefined =>
    free.find((n) => n.status === "approved" && n.balance === piece) ??
    free.find((n) => n.status === "in_review" && n.balance === piece) ??
    free.find((n) => n.status === "approved" && n.balance > piece) ??
    free.find((n) => n.status === "in_review" && n.balance > piece);
  for (const { p, i } of order) {
    if (result[i] !== null) continue;
    const note = pick(p);
    if (!note) continue;
    result[i] = note.id;
    free.splice(free.indexOf(note), 1);
  }
  return result;
}

export interface UnitDeposit {
  readonly unit: bigint;
  readonly count: number;
}

/** Group the pieces that still lack a note into one deposit line per unit value (`fundPieces[i]` is deposited for piece i). */
export function depositsFor(fundPieces: readonly bigint[], noteIds: readonly (string | null)[]): UnitDeposit[] {
  const counts = new Map<bigint, number>();
  fundPieces.forEach((p, i) => {
    if ((noteIds[i] ?? null) === null) counts.set(p, (counts.get(p) ?? 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => desc(a[0], b[0])).map(([unit, count]) => ({ unit, count }));
}

/** Wallet cost of a deposit plan, vetting fee included. */
export function depositCost(deposits: readonly UnitDeposit[], feeBps: number): bigint {
  return deposits.reduce((s, d) => s + grossForNet(d.unit, BigInt(feeBps)) * BigInt(d.count), 0n);
}
