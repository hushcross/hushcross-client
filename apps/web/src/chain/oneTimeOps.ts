import {
  bookOneTimeRecords,
  giveOneTimeRecords,
  launchOneTimeRecords,
  listOneTimeAddresses,
  oneTimeTokens,
  oneTimeVaultOptions,
  planOneTimeVaultMove,
  readOneTimeBalances,
  signOneTimeTransfer,
  signOneTimeTx,
  type OneTimeAddress,
  type OneTimeBalance,
  type OneTimeToken,
  type SaleTokenInfo,
  type VaultMoveFacts,
} from '@hushcross/core';
import { getAddress, isAddress } from 'viem';
import { DataSourceError } from '../data/DataSource';
import type { Asset, OneTimeFunds, OneTimeHolding, OneTimeSendRequest, OneTimeSendResult } from '../data/types';
import type { ChainContext } from './context';
import { readDonations, readOrders } from './marketMeta';
import { activityToJson, readActivity, readBids, withMeta } from './meta';

/**
 * One-time addresses that Book trades, Launch bids and Give refunds paid (they are never announced, so they
 * come from the order / bid / donation records in the encrypted vault). Keys are re-derived in memory and
 * never stored. Moving out signs locally with the one-time key and pays gas from the address's own BNB (the
 * relay sends a small stipend after a sponsored claim), so the public wallet never appears.
 */
interface Located {
  readonly entry: OneTimeAddress;
  /** Book pair ('BTCB/USDT') of a trade, or the sale token's symbol of a bid. */
  readonly market: string | null;
  /** SealedSale of a bid payout (its logo), null otherwise. */
  readonly sale: `0x${string}` | null;
  /** Every token worth reading on this account's addresses (deployment tokens plus its bids' sale tokens). */
  readonly tokens: readonly OneTimeToken[];
}

const SOURCE: Readonly<Record<OneTimeAddress['source'], OneTimeFunds['source']>> = { book: 'trade', launch: 'sale', give: 'refund' };

/** The token of each sale this account bid in (`SealedSale.token` + ERC-20 symbol); a sale that cannot be read is left out. */
async function saleTokens(ctx: ChainContext, sales: readonly string[]): Promise<Map<string, SaleTokenInfo>> {
  const found = await Promise.all(
    [...new Set(sales.map((s) => s.toLowerCase()))].map(async (sale): Promise<[string, SaleTokenInfo] | null> => {
      try {
        const token = await ctx.cached(`saleToken:${sale}`, async () => (await ctx.deps.chain.getSale(sale as `0x${string}`)).token);
        const info = await ctx.cached(`token:${token}`, () => ctx.deps.chain.getTokenInfo(token));
        return [sale, { token, symbol: info.symbol }];
      } catch {
        return null;
      }
    }),
  );
  return new Map(found.filter((f): f is [string, SaleTokenInfo] => f !== null));
}

async function locate(ctx: ChainContext): Promise<Located[]> {
  const account = ctx.deps.session.current();
  if (!account) return [];
  const orders = readOrders(account.secrets);
  const donations = readDonations(account.secrets);
  const bids = readBids(account.secrets);
  const records = [
    ...bookOneTimeRecords(orders.map((o) => ({ id: o.id, recipient: o.recipient, recipientEphemeral: o.recipientEphemeral, createdAt: o.createdAt }))),
    ...launchOneTimeRecords(bids.map((b) => ({ id: b.id, recipient: b.recipient, recipientEphemeral: b.recipientEphemeral, createdAt: b.createdAt }))),
    ...giveOneTimeRecords(donations.map((d) => ({ id: d.id, payout: d.payout, payoutEphemeral: d.payoutEphemeral, at: d.at }))),
  ];
  const sales = await saleTokens(ctx, bids.map((b) => b.sale));
  const tokens = oneTimeTokens(ctx.deployments, [...sales.values()]);
  const marketOf = (ref: string): string | null => {
    const order = orders.find((o) => o.id === ref);
    const pair = order ? ctx.deployments.bookPairs.find((p) => p.marketId.toString() === order.marketId) : undefined;
    return pair ? `${pair.symbol}/USDT` : null;
  };
  const saleOf = (ref: string): string | null => {
    const bid = bids.find((b) => b.id === ref);
    const token = bid ? sales.get(bid.sale.toLowerCase())?.token : undefined;
    return token === undefined ? null : (tokens.find((t) => t.token === token)?.symbol ?? null);
  };
  const labelOf = (entry: OneTimeAddress): string | null => {
    const pick = entry.source === 'book' ? marketOf : entry.source === 'launch' ? saleOf : null;
    return pick === null ? null : (entry.refs.map(pick).find((m) => m !== null) ?? null);
  };
  const saleAddressOf = (entry: OneTimeAddress): `0x${string}` | null => (entry.source === 'launch' ? (entry.refs.map((ref) => bids.find((b) => b.id === ref)?.sale ?? null).find((x) => x !== null) ?? null) : null);
  return listOneTimeAddresses(account.keys, records).map((entry) => ({ entry, market: labelOf(entry), sale: saleAddressOf(entry), tokens }));
}

async function factsFor(ctx: ChainContext, balances: readonly OneTimeBalance[]): Promise<VaultMoveFacts> {
  const [gasPriceWei, usdtConfig, bnbConfig] = await Promise.all([ctx.deps.chain.getGasPrice(), ctx.assetConfig('USDT'), ctx.assetConfig('BNB')]);
  const amountOf = (symbol: string): bigint => balances.find((b) => b.symbol === symbol && b.vaultAsset !== null)?.amount ?? 0n;
  return {
    nativeBalance: amountOf('BNB'),
    usdtBalance: amountOf('USDT'),
    otherTokens: balances.some((b) => b.vaultAsset === null && b.amount > 0n),
    gasPriceWei,
    usdtMinDeposit: usdtConfig.minimumDeposit,
    bnbMinDeposit: bnbConfig.minimumDeposit,
  };
}

async function view(ctx: ChainContext, item: Located): Promise<OneTimeFunds> {
  const balances = await readOneTimeBalances(ctx.deps.chain, item.entry.address, item.tokens);
  const facts = await factsFor(ctx, balances);
  const options = item.entry.privateKey === null ? [] : oneTimeVaultOptions(facts);
  const holdings: OneTimeHolding[] = balances.filter((b) => b.amount > 0n).map((b) => ({ symbol: b.symbol, amount: b.amount, toVault: b.vaultAsset !== null && options.includes(b.vaultAsset) ? b.vaultAsset : null }));
  return {
    id: item.entry.address.toLowerCase(),
    source: SOURCE[item.entry.source],
    address: item.entry.address,
    market: item.market,
    sale: item.sale,
    at: item.entry.createdAt,
    holdings,
    gas: facts.nativeBalance,
    canMove: item.entry.privateKey !== null,
  };
}

/** Addresses that still hold something, newest first. */
export async function listOneTimeFunds(ctx: ChainContext): Promise<OneTimeFunds[]> {
  const views = await Promise.all((await locate(ctx)).map((item) => view(ctx, item)));
  return views.filter((v) => v.holdings.length > 0);
}

async function find(ctx: ChainContext, id: string): Promise<Located & { readonly privateKey: `0x${string}` }> {
  const item = (await locate(ctx)).find((l) => l.entry.address.toLowerCase() === id.toLowerCase());
  if (!item) throw new DataSourceError('not_found');
  if (item.entry.privateKey === null) throw new DataSourceError('invalid_input', 'the key of this address is not on this device');
  return { ...item, privateKey: item.entry.privateKey };
}

async function logActivity(ctx: ChainContext, entry: { readonly id: string; readonly kind: 'deposit' | 'send'; readonly module: 'vault' | 'send'; readonly asset: string; readonly amount: bigint }): Promise<void> {
  await ctx.updateAccount((s) => withMeta(s, { activity: [...readActivity(s).map(activityToJson), activityToJson({ ...entry, at: ctx.now(), status: 'done' })] }));
}

/**
 * Hush ID sweep from the one-time address (approve + deposit for USDT, deposit for BNB), signed as legacy
 * transactions at the quoted gas price so a small stipend is enough; a fresh precommitment from the account's
 * own index line, so the new note is found again from the phrase.
 */
export async function moveOneTimeToVault(ctx: ChainContext, id: string, asset: Asset): Promise<OneTimeFunds> {
  const item = await find(ctx, id);
  const address = item.entry.address;
  const balances = await readOneTimeBalances(ctx.deps.chain, address, item.tokens);
  const facts = await factsFor(ctx, balances);
  const [fresh] = await ctx.freshDepositSecrets(asset, 1);
  if (!fresh) throw new DataSourceError('invalid_input');
  const plan = planOneTimeVaultMove({ asset, entrypoint: ctx.deployments.entrypoint, usdt: ctx.deployments.pools.USDT.asset, precommitment: fresh.secrets.precommitment, facts });
  const nonce = await ctx.deps.chain.getTransactionCount(address);
  for (const [i, tx] of plan.txs.entries()) {
    const signed = await signOneTimeTx({ privateKey: item.privateKey, chainId: ctx.deps.chainId, nonce: nonce + i, gasPriceWei: facts.gasPriceWei, tx: { ...tx, gas: tx.gas ?? plan.gasLimit } });
    const hash = await ctx.deps.chain.sendRawTransaction(signed.raw);
    if ((await ctx.deps.chain.waitForReceipt(hash)) !== 'success') throw new DataSourceError('tx_failed');
  }
  await logActivity(ctx, { id: `onetime-vault-${address.toLowerCase()}-${ctx.now()}`, kind: 'deposit', module: 'vault', asset, amount: plan.depositValue });
  ctx.emit(['send', 'notes', 'balances', 'activity']);
  return view(ctx, item);
}

/** Send one whole holding to a regular address (BNB: everything minus the transfer's gas). */
export async function sendFromOneTime(ctx: ChainContext, request: OneTimeSendRequest): Promise<OneTimeSendResult> {
  if (!isAddress(request.to, { strict: false }) || /^0x0{40}$/i.test(request.to)) throw new DataSourceError('invalid_input', 'not an address');
  const to = getAddress(request.to);
  const item = await find(ctx, request.id);
  const address = item.entry.address;
  const balances = await readOneTimeBalances(ctx.deps.chain, address, item.tokens);
  const holding = balances.find((b) => b.symbol === request.symbol);
  if (!holding || holding.amount === 0n) throw new DataSourceError('invalid_input', 'nothing of this asset on the address');
  const nativeBalance = balances.find((b) => b.token === null)?.amount ?? 0n;
  const [gasPriceWei, nonce] = await Promise.all([ctx.deps.chain.getGasPrice(), ctx.deps.chain.getTransactionCount(address)]);
  const base = { from: address, to, nativeBalance, gasPriceWei, privateKey: item.privateKey, chainId: ctx.deps.chainId, nonce };
  const signed = holding.token === null ? await signOneTimeTransfer({ ...base, kind: 'native' }) : await signOneTimeTransfer({ ...base, kind: 'erc20', token: holding.token, tokenBalance: holding.amount });
  const txHash = await ctx.deps.chain.sendRawTransaction(signed.raw);
  if ((await ctx.deps.chain.waitForReceipt(txHash)) !== 'success') throw new DataSourceError('tx_failed');
  await logActivity(ctx, { id: `onetime-send-${txHash}`, kind: 'send', module: 'send', asset: holding.symbol, amount: signed.plan.amount });
  ctx.emit(['send', 'balances', 'activity']);
  return { txHash, symbol: holding.symbol, amount: signed.plan.amount };
}
