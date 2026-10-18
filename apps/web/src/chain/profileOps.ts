import {
  SALE_LOGO_MAX_BYTES,
  ServiceError,
  buildSetProfileTx,
  cleanSaleProfileFields,
  prepareSaleProfileUpload,
  sniffSaleLogo,
  toBase64,
  type MetaClient,
  type SaleLogoChange,
  type SaleProfilePointer,
  type VerifiedSaleProfile,
} from '@hushcross/core';
import { getAddress } from 'viem';
import { DataSourceError } from '../data/DataSource';
import type { Address, SaleProfile, SaleProfileInput } from '../data/types';
import type { ChainContext } from './context';

const CACHE_MS = 60_000;
const caches = new WeakMap<ChainContext, Map<string, { readonly at: number; readonly value: Promise<SaleProfile | null> }>>();
/** Object URLs per logo hash: created once, reused across reloads of the same verified bytes. */
const logoUrls = new Map<string, string>();

function cacheOf(ctx: ChainContext): Map<string, { readonly at: number; readonly value: Promise<SaleProfile | null> }> {
  let cache = caches.get(ctx);
  if (!cache) {
    cache = new Map();
    caches.set(ctx, cache);
  }
  return cache;
}

function imageUrl(hash: string, bytes: Uint8Array): string {
  const known = logoUrls.get(hash);
  if (known) return known;
  const url = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(new Blob([bytes.slice()], { type: 'image/webp' })) : `data:image/webp;base64,${toBase64(bytes)}`;
  logoUrls.set(hash, url);
  return url;
}

function factory(ctx: ChainContext): Address {
  const address = ctx.deployments.launchFactory;
  if (!address) throw new DataSourceError('not_found', 'no LaunchFactory in the deployments file');
  return address;
}

/**
 * THE source of a sale's (contentHash, uri): `LaunchFactory.profileOf`. Switching the source of truth
 * (e.g. to the meta service's own pointer, `MetaClient.pointer`) is a change to this function only.
 */
export async function profilePointer(ctx: ChainContext, sale: Address): Promise<SaleProfilePointer | null> {
  return ctx.deps.chain.getSaleProfilePointer(factory(ctx), sale);
}

function toProfile(verified: VerifiedSaleProfile): SaleProfile {
  const { document, logo } = verified;
  return {
    sale: document.sale,
    description: document.description,
    website: document.website,
    x: document.x,
    telegram: document.telegram,
    logoUrl: logo && document.logo ? imageUrl(document.logo.large, logo.large) : null,
    logoSmallUrl: logo && document.logo ? imageUrl(document.logo.small, logo.small) : null,
    contentHash: verified.pointer.contentHash,
    updatedAt: document.issuedAt,
  };
}

async function load(ctx: ChainContext, meta: MetaClient, sale: Address): Promise<SaleProfile | null> {
  const pointer = await profilePointer(ctx, sale);
  if (pointer === null) return null;
  const verified = await meta.resolve(pointer, { sale, chainId: ctx.deps.chainId });
  return verified === null ? null : toProfile(verified);
}

/** Verified profile or null; any failure (no host, RPC error, hash mismatch, hidden) means "show the monogram". */
export async function getSaleProfile(ctx: ChainContext, sale: Address): Promise<SaleProfile | null> {
  const meta = ctx.deps.services.meta;
  if (!meta || !ctx.deployments.launchFactory) return null;
  const key = sale.toLowerCase();
  const cache = cacheOf(ctx);
  const hit = cache.get(key);
  if (hit && ctx.now() - hit.at < CACHE_MS) return hit.value;
  const value = load(ctx, meta, getAddress(sale)).catch(() => null);
  cache.set(key, { at: ctx.now(), value });
  return value;
}

function uploadError(error: unknown): DataSourceError {
  if (error instanceof ServiceError) {
    if (error.code === 'not_creator') return new DataSourceError('not_creator');
    if (error.status >= 400 && error.status < 500 && error.status !== 429) return new DataSourceError('invalid_input', error.code);
  }
  return new DataSourceError('network', error instanceof Error ? error.message : undefined);
}

/** Sign, upload, verify what the host stored, then `setProfile` from the creator's public wallet. */
export async function saveSaleProfile(ctx: ChainContext, input: SaleProfileInput): Promise<SaleProfile> {
  const meta = ctx.deps.services.meta;
  if (!meta) throw new DataSourceError('network', 'no sale profile host configured');
  const wallet = ctx.requireWallet();
  const sale = getAddress(input.sale.address);
  if (wallet.toLowerCase() !== input.sale.creator.toLowerCase()) throw new DataSourceError('not_creator');
  const fields = { description: input.fields.description, website: input.fields.website.trim() || null, x: input.fields.x.trim() || null, telegram: input.fields.telegram.trim() || null };
  const cleaned = cleanSaleProfileFields(fields);
  if (!cleaned.ok) throw new DataSourceError('invalid_input', cleaned.code);

  let logo: SaleLogoChange = { kind: 'none' };
  if (input.logo.kind === 'replace') {
    if (input.logo.bytes.length > SALE_LOGO_MAX_BYTES || sniffSaleLogo(input.logo.bytes) === null) throw new DataSourceError('invalid_input', 'image');
    logo = { kind: 'replace', bytes: input.logo.bytes };
  } else if (input.logo.kind === 'keep') {
    const current = await profilePointer(ctx, sale).catch(() => null);
    if (current) logo = { kind: 'reuse', from: current.contentHash };
  }

  const prepared = prepareSaleProfileUpload({ chainId: ctx.deps.chainId, sale, fields, logo, issuedAt: Date.now() });
  input.onStage?.('signing');
  const signature = await ctx.deps.wallet.signMessage(prepared.message);
  input.onStage?.('uploading');
  const uploaded = await meta.upload(prepared, signature).catch((error: unknown) => {
    throw uploadError(error);
  });
  // Check what the host stored before pointing the sale at it.
  const verified = await meta.resolve(uploaded, { sale, chainId: ctx.deps.chainId }).catch(() => null);
  const doc = verified?.document;
  if (!verified || !doc || doc.description !== cleaned.value.description || doc.website !== cleaned.value.website || doc.x !== cleaned.value.x || doc.telegram !== cleaned.value.telegram || (logo.kind !== 'none') !== (doc.logo !== null)) {
    throw new DataSourceError('network', 'the profile host returned a different profile');
  }
  input.onStage?.('confirming');
  const hash = await ctx.deps.wallet.sendTransaction(buildSetProfileTx(factory(ctx), sale, uploaded));
  const receipt = await ctx.deps.chain.waitForReceiptLogs(hash);
  if (receipt.status !== 'success') throw new DataSourceError('tx_failed');
  const profile = toProfile(verified);
  cacheOf(ctx).set(sale.toLowerCase(), { at: ctx.now(), value: Promise.resolve(profile) });
  ctx.emit(['sales']);
  return profile;
}
