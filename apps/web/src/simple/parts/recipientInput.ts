import type { Asset } from '../../data/types';
import { parseAmount } from '../../data/units';

export interface ParsedRecipientInput {
  /** What to resolve: a name, Hush ID or address. */
  readonly target: string;
  /** From a payment link (`/pay/<id>?asset=USDT&units=100&count=2`). */
  readonly asset: Asset | null;
  readonly amount: bigint | null;
}

/** Accept a pasted payment link (full URL or path), `@name`, a Hush ID or an address. */
export function parseRecipientInput(text: string): ParsedRecipientInput {
  const value = text.trim();
  const match = /(?:^|\/)pay\/([^/?#\s]+)(?:\?([^#\s]*))?/.exec(value);
  if (!match) return { target: value, asset: null, amount: null };
  const target = decodeURIComponent(match[1] ?? '');
  const query = new URLSearchParams(match[2] ?? '');
  const asset = query.get('asset') === 'BNB' ? 'BNB' : query.get('asset') === 'USDT' ? 'USDT' : null;
  const unit = parseAmount(query.get('units') ?? '');
  const count = Number.parseInt(query.get('count') ?? '1', 10);
  const amount = unit !== null && unit > 0n && Number.isInteger(count) && count >= 1 && count <= 20 ? unit * BigInt(count) : null;
  return { target: /^[a-z0-9_]{3,20}$/i.test(target) ? `@${target}` : target, asset, amount };
}
