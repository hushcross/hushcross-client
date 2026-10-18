import {
  BNB_UNITS,
  PRIVACY_POOL_ABI,
  RECOVERY_GAP_LIMIT,
  USDT_UNITS,
  formatProofForSolidity,
  grossForNet,
  planPrecommitmentDeposits,
  proveCommitment,
  validateRecoveryPhrase,
} from '@hushcross/core';
import { encodeFunctionData } from 'viem';
import { DataSourceError } from '../data/DataSource';
import type { Asset, BackupFile, BackupProtection, BackupStatus, DepositRequest, DepositResult, Note, PoolStats, RecoveryResult, UnitOption, VaultConfig } from '../data/types';
import { ASSET_LIST, type AccountNote, type ChainContext } from './context';
import { activityToJson, readActivity, readNumber, withMeta } from './meta';
import { depositsAfter } from './poolState';

export const UNIT_TABLE: Readonly<Record<Asset, readonly bigint[]>> = { BNB: BNB_UNITS, USDT: USDT_UNITS };

export async function getVaultConfig(ctx: ChainContext): Promise<VaultConfig> {
  const [bnb, usdt, info] = await Promise.all([ctx.assetConfig('BNB'), ctx.assetConfig('USDT'), ctx.relayInfo().catch(() => null)]);
  const units = (asset: Asset, bps: bigint): readonly UnitOption[] =>
    UNIT_TABLE[asset].map((net) => {
      const gross = grossForNet(net, bps);
      return { asset, net, gross, fee: gross - net };
    });
  return {
    vettingFeeBps: Number(bnb.vettingFeeBps),
    maxRelayFeeBps: Number(bnb.maxRelayFeeBps < usdt.maxRelayFeeBps ? bnb.maxRelayFeeBps : usdt.maxRelayFeeBps),
    units: { BNB: units('BNB', bnb.vettingFeeBps), USDT: units('USDT', usdt.vettingFeeBps) },
    defaultGasDrop: info?.gasDropWei ?? 400_000_000_000_000n,
    maxRelayDelayMinutes: 30,
    recoveryGapLimit: RECOVERY_GAP_LIMIT,
  };
}

export async function getPoolStats(ctx: ChainContext, asset: Asset): Promise<PoolStats> {
  const snap = await ctx.pools[asset].sync();
  let approved = 0;
  try {
    const health = await ctx.deps.services.screen.health();
    approved = health.pools.find((p) => p.address.toLowerCase() === snap.pool.toLowerCase())?.approved ?? 0;
  } catch {
    approved = 0;
  }
  return { asset, approvedDeposits: approved, totalDeposits: snap.deposits.length };
}

export async function toNotes(ctx: ChainContext, notes: readonly AccountNote[]): Promise<Note[]> {
  const snaps = await ctx.snapshots();
  return Promise.all(
    notes.map(async (n): Promise<Note> => ({
      id: n.id,
      asset: n.asset,
      amount: n.balance === 0n ? n.value : n.balance,
      status: n.status,
      createdAt: await ctx.deps.chain.getBlockTime(n.depositBlock).catch(() => 0),
      index: Number(n.index),
      depositTx: n.depositTx,
      mixedWith: depositsAfter(snaps[n.asset], n.depositBlock, n.depositLogIndex),
    })),
  );
}

export async function deposit(ctx: ChainContext, request: DepositRequest): Promise<DepositResult> {
  if (!UNIT_TABLE[request.asset].includes(request.unit) || !Number.isInteger(request.count) || request.count < 1 || request.count > 20) {
    throw new DataSourceError('invalid_input');
  }
  const owner = ctx.requireWallet();
  const config = await ctx.assetConfig(request.asset);
  const gross = grossForNet(request.unit, config.vettingFeeBps);
  const total = gross * BigInt(request.count);
  const token = ctx.tokenOf(request.asset);
  const balance = token ? await ctx.deps.chain.getTokenBalance(token, owner) : await ctx.deps.chain.getNativeBalance(owner);
  if (balance < total) throw new DataSourceError('insufficient_wallet');
  const fresh = await ctx.freshDepositSecrets(request.asset, request.count);
  const allowance = token ? await ctx.deps.chain.getAllowance(token, owner, ctx.deployments.entrypoint) : 0n;
  const plan = planPrecommitmentDeposits({
    asset: token ? { kind: 'erc20', token } : { kind: 'native' },
    entrypoint: ctx.deployments.entrypoint,
    deposits: fresh.map((f) => ({ precommitment: f.secrets.precommitment, gross })),
    allowance,
  });
  const txHash = await ctx.sendWalletTxs(plan.txs);
  const at = ctx.now();
  await ctx.updateAccount((s) =>
    withMeta(s, { activity: [...readActivity(s).map(activityToJson), activityToJson({ id: `dep-${txHash}`, kind: 'deposit', module: 'vault', asset: request.asset, amount: request.unit * BigInt(request.count), at, status: 'done' })] }),
  );
  const notes = await toNotes(ctx, (await ctx.accountNotes()).filter((n) => fresh.some((f) => f.index === n.index && n.asset === request.asset)));
  ctx.emit(['notes', 'balances', 'activity']);
  return { notes, txHash, grossPaid: total };
}

/** Public exit (ragequit) back to the original depositor; the connected wallet must be that address. */
export async function exitPublicly(ctx: ChainContext, noteId: string): Promise<Note> {
  const owner = ctx.requireWallet();
  const note = (await ctx.accountNotes()).find((n) => n.id === noteId);
  if (!note) throw new DataSourceError('not_found');
  if (note.status === 'spent' || note.status === 'exited' || note.balance === 0n) throw new DataSourceError('invalid_input');
  if (note.depositor.toLowerCase() !== owner.toLowerCase()) throw new DataSourceError('wallet_required', 'connect the wallet that made this deposit');
  const [prover, artifacts] = await Promise.all([ctx.deps.zk.getProver(), ctx.deps.zk.getArtifacts()]);
  const bundle = await proveCommitment({ value: note.balance, label: note.label, nullifier: note.nullifier, secret: note.secret }, prover, artifacts);
  const proof = formatProofForSolidity(bundle.proof, bundle.publicSignals);
  const [s0, s1, s2, s3] = proof.pubSignals;
  if (s0 === undefined || s1 === undefined || s2 === undefined || s3 === undefined) throw new DataSourceError('network', 'commitment proof is incomplete');
  const data = encodeFunctionData({
    abi: PRIVACY_POOL_ABI,
    functionName: 'ragequit',
    args: [{ pA: [proof.pA[0], proof.pA[1]], pB: [[proof.pB[0][0], proof.pB[0][1]], [proof.pB[1][0], proof.pB[1][1]]], pC: [proof.pC[0], proof.pC[1]], pubSignals: [s0, s1, s2, s3] }],
  });
  await ctx.sendWalletTxs([{ to: note.pool, data, value: 0n }]);
  const updated = (await ctx.accountNotes()).find((n) => n.label === note.label && n.asset === note.asset);
  ctx.emit(['notes', 'balances', 'activity']);
  const [view] = await toNotes(ctx, [updated ?? note]);
  if (!view) throw new DataSourceError('not_found');
  return view;
}

/** Rescan both pools for the unlocked account. The phrase must be this account's phrase. */
export async function recoverFromPhrase(ctx: ChainContext, words: readonly string[]): Promise<RecoveryResult> {
  const phrase = words.join(' ').trim().toLowerCase();
  if (!validateRecoveryPhrase(phrase)) throw new DataSourceError('invalid_input');
  const { secrets } = ctx.requireAccount();
  if (secrets.phrase !== phrase) throw new DataSourceError('invalid_input', 'use onboarding to import a different phrase');
  const notes = await ctx.accountNotes();
  const highest = notes.reduce((max, n) => (Number(n.index) > max ? Number(n.index) : max), -1);
  ctx.emit(['notes', 'balances']);
  return { notesFound: notes.length, highestIndex: highest, scannedIndices: highest + 1 + RECOVERY_GAP_LIMIT };
}

export function getBackupStatus(ctx: ChainContext, passkeySupported: boolean): BackupStatus {
  const { secrets } = ctx.requireAccount();
  return {
    protection: ctx.deps.session.envelopeKind() === 'passkey' ? 'passkey' : 'passphrase',
    lastExportAt: readNumber(secrets, 'lastExportAt'),
    passkeySupported,
  };
}

export async function exportBackup(ctx: ChainContext, protection: BackupProtection, passphrase: string | null, exporter: BackupExporter): Promise<BackupFile> {
  ctx.requireAccount();
  if (protection === 'passphrase' && !passphrase) throw new DataSourceError('invalid_input');
  const file = await exporter(protection, passphrase);
  ctx.emit(['account']);
  return file;
}

export type BackupExporter = (protection: BackupProtection, passphrase: string | null) => Promise<BackupFile>;

export function balancesFrom(notes: readonly AccountNote[]): { vault: Record<Asset, bigint>; pending: Record<Asset, bigint> } {
  const vault: Record<Asset, bigint> = { BNB: 0n, USDT: 0n };
  const pending: Record<Asset, bigint> = { BNB: 0n, USDT: 0n };
  for (const n of notes) {
    if (n.balance === 0n) continue;
    if (n.status === 'approved') vault[n.asset] += n.balance;
    else if (n.status === 'in_review') pending[n.asset] += n.balance;
  }
  return { vault, pending };
}

export async function walletBalances(ctx: ChainContext): Promise<Record<Asset, bigint> | null> {
  const owner = ctx.deps.wallet.getAddress();
  if (!owner) return null;
  const token = ctx.deployments.pools.USDT.asset;
  const [bnb, usdt] = await Promise.all([ctx.deps.chain.getNativeBalance(owner), ctx.deps.chain.getTokenBalance(token, owner)]);
  return { BNB: bnb, USDT: usdt };
}

export { ASSET_LIST };
