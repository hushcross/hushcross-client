import { cleanSaleProfileFields, sniffSaleLogo, toBase64, type SaleProfileFields } from '@hushcross/core';
import { DataSourceError } from '../DataSource';
import type { Address, Hex, SaleProfile, SaleProfileInput } from '../types';
import { createRng, hashString, randomHex } from './mockUtil';

/** Stable SealedSale address for a mock sale id (no RNG draw, so the rest of the seed is unchanged). */
export function mockSaleAddress(id: string): Address {
  return `0x${randomHex(createRng(hashString(`sale:${id}`)), 20)}`;
}

const svg = (body: string): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">${body}</svg>`)}`;

/** Demo logos drawn here (no external images): a fern frond, a woven loom, an orbit. */
export const MOCK_LOGOS = {
  fern: svg(
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e8f1e4"/><stop offset="1" stop-color="#b9d4b0"/></linearGradient></defs>' +
      '<rect width="256" height="256" rx="56" fill="url(#g)"/>' +
      '<path d="M128 214 C128 160 126 104 140 46" fill="none" stroke="#2f5d3a" stroke-width="9" stroke-linecap="round"/>' +
      [0, 1, 2, 3, 4, 5]
        .map((i) => {
          const y = 190 - i * 26;
          const w = 62 - i * 8;
          return `<path d="M${129 + i} ${y} q${-w} -6 ${-w - 8} -30 q${w * 0.7} 2 ${w + 8} 30Z" fill="#3f7a4b"/><path d="M${131 + i} ${y - 6} q${w} -6 ${w + 8} -30 q${-w * 0.7} 2 ${-w - 8} 30Z" fill="#5a9a63"/>`;
        })
        .join(''),
  ),
  loom: svg(
    '<rect width="256" height="256" rx="56" fill="#f3ead9"/>' +
      [0, 1, 2, 3, 4].map((i) => `<rect x="${52 + i * 34}" y="44" width="16" height="168" rx="8" fill="#c06a3a" opacity="${0.55 + i * 0.09}"/>`).join('') +
      [0, 1, 2, 3].map((i) => `<rect x="40" y="${66 + i * 36}" width="176" height="14" rx="7" fill="#2d4a6b" opacity="${0.9 - i * 0.12}"/>`).join(''),
  ),
  orbit: svg(
    '<rect width="256" height="256" rx="56" fill="#121a2b"/>' +
      '<ellipse cx="128" cy="128" rx="92" ry="38" fill="none" stroke="#7fb3ff" stroke-width="6" transform="rotate(-24 128 128)"/>' +
      '<ellipse cx="128" cy="128" rx="92" ry="38" fill="none" stroke="#c9a7ff" stroke-width="4" opacity="0.7" transform="rotate(36 128 128)"/>' +
      '<circle cx="128" cy="128" r="30" fill="#f2c46d"/><circle cx="206" cy="94" r="10" fill="#7fb3ff"/>',
  ),
} as const;

interface Stored {
  readonly sale: Address;
  readonly fields: SaleProfileFields;
  readonly logoUrl: string | null;
  readonly updatedAt: number;
  readonly hidden: boolean;
}

/**
 * In-memory profiles for the demo: same validation as the real flow, no signature or upload. The creator
 * check uses the mock's connected wallet.
 */
export class MockProfiles {
  private readonly records = new Map<string, Stored>();

  constructor(private readonly now: () => number) {}

  seed(sale: Address, fields: SaleProfileFields, logoUrl: string | null): void {
    this.records.set(sale.toLowerCase(), { sale, fields, logoUrl, updatedAt: this.now(), hidden: false });
  }

  get(sale: Address): SaleProfile | null {
    const record = this.records.get(sale.toLowerCase());
    if (!record || record.hidden) return null;
    return { sale: record.sale, ...record.fields, logoUrl: record.logoUrl, logoSmallUrl: record.logoUrl, contentHash: `0x${hashString(JSON.stringify(record)).toString(16).padStart(64, '0')}` as Hex, updatedAt: record.updatedAt };
  }

  save(input: SaleProfileInput, wallet: Address | null): SaleProfile {
    if (wallet === null) throw new DataSourceError('wallet_required');
    if (wallet.toLowerCase() !== input.sale.creator.toLowerCase()) throw new DataSourceError('not_creator');
    const fields = { description: input.fields.description, website: input.fields.website.trim() || null, x: input.fields.x.trim() || null, telegram: input.fields.telegram.trim() || null };
    const cleaned = cleanSaleProfileFields(fields);
    if (!cleaned.ok) throw new DataSourceError('invalid_input', cleaned.code);
    const current = this.records.get(input.sale.address.toLowerCase());
    let logoUrl: string | null = null;
    if (input.logo.kind === 'keep') logoUrl = current?.logoUrl ?? null;
    if (input.logo.kind === 'replace') {
      const type = sniffSaleLogo(input.logo.bytes);
      if (type === null || input.logo.bytes.length > 512 * 1024) throw new DataSourceError('invalid_input', 'image_type');
      logoUrl = `data:image/${type};base64,${toBase64(input.logo.bytes)}`;
    }
    input.onStage?.('signing');
    input.onStage?.('uploading');
    input.onStage?.('confirming');
    this.records.set(input.sale.address.toLowerCase(), { sale: input.sale.address, fields: cleaned.value, logoUrl, updatedAt: this.now(), hidden: false });
    return this.get(input.sale.address) as SaleProfile;
  }
}
