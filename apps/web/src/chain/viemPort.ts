import { CHAINLINK_FEED_ABI, ENTRYPOINT_ABI, ERC20_ABI, ERC20_METADATA_ABI, ERC6538_REGISTRY_ABI, LAUNCH_FACTORY_ABI, PRIVACY_POOL_ABI, SEALED_SALE_ABI, profilePointerFrom, type TxRequest } from '@hushcross/core';
import { createPublicClient, createWalletClient, defineChain, http, type Chain, type PublicClient, type Transport } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { Address, Hex } from '../data/types';
import type { AssetConfig, ChainPort, FirstFunding, OnchainSale, PoolLog } from './ports';

const VESTING_ABI = [{ type: 'function', name: 'duration', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] }] as const;
const REGISTRY_NONCE_ABI = [{ type: 'function', name: 'nonceOf', stateMutability: 'view', inputs: [{ name: 'registrant', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] }] as const;

export const MAX_LOG_RANGE = 5_000n;
const FUNDING_LOOKBACK_BLOCKS = 50_000n;

const TRANSFER_EVENT = {
  type: 'event',
  name: 'Transfer',
  inputs: [
    { name: 'from', type: 'address', indexed: true },
    { name: 'to', type: 'address', indexed: true },
    { name: 'value', type: 'uint256', indexed: false },
  ],
} as const;

const POOL_EVENTS = PRIVACY_POOL_ABI.filter((item) => item.type === 'event');

export function chainFor(chainId: number, rpcUrl: string): Chain {
  return defineChain({
    id: chainId,
    name: chainId === 56 ? 'BNB Smart Chain' : `Chain ${chainId}`,
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
    blockExplorers: chainId === 56 ? { default: { name: 'BscScan', url: 'https://bscscan.com' } } : undefined,
  });
}

/** ChainPort over viem. `transport` is injectable so tests can answer JSON-RPC calls directly. */
export function createViemChainPort(options: { readonly chainId: number; readonly rpcUrl: string; readonly transport?: Transport }): ChainPort {
  const chain = chainFor(options.chainId, options.rpcUrl);
  const transport = options.transport ?? http(options.rpcUrl, { batch: { batchSize: 20 }, retryCount: 2 });
  const client = createPublicClient({ chain, transport }) as PublicClient;
  const blockTimes = new Map<bigint, number>();

  const getPoolLogs = async (pool: Address, fromBlock: bigint, toBlock: bigint): Promise<readonly PoolLog[]> => {
    const out: PoolLog[] = [];
    for (let start = fromBlock; start <= toBlock; start += MAX_LOG_RANGE) {
      const end = start + MAX_LOG_RANGE - 1n < toBlock ? start + MAX_LOG_RANGE - 1n : toBlock;
      const logs = await client.getLogs({ address: pool, events: POOL_EVENTS, fromBlock: start, toBlock: end, strict: true });
      for (const log of logs) {
        const base = { block: log.blockNumber, logIndex: log.logIndex, tx: log.transactionHash };
        switch (log.eventName) {
          case 'Deposited':
            out.push({ ...base, kind: 'deposit', depositor: log.args._depositor, commitment: log.args._commitment, label: log.args._label, value: log.args._value, precommitment: log.args._precommitmentHash });
            break;
          case 'Withdrawn':
            out.push({ ...base, kind: 'withdrawal', processooor: log.args._processooor, value: log.args._value, spentNullifier: log.args._spentNullifier, newCommitment: log.args._newCommitment });
            break;
          case 'Ragequit':
            out.push({ ...base, kind: 'ragequit', ragequitter: log.args._ragequitter, commitment: log.args._commitment, label: log.args._label, value: log.args._value });
            break;
          case 'LeafInserted':
            out.push({ ...base, kind: 'leaf', index: log.args._index, leaf: log.args._leaf, root: log.args._root });
            break;
          default:
            break;
        }
      }
    }
    return out.sort((a, b) => (a.block === b.block ? a.logIndex - b.logIndex : a.block < b.block ? -1 : 1));
  };

  return {
    getChainId: () => client.getChainId(),
    getBlockNumber: () => client.getBlockNumber(),
    getGasPrice: () => client.getGasPrice(),
    async getBlockTime(block) {
      const cached = blockTimes.get(block);
      if (cached !== undefined) return cached;
      const header = await client.getBlock({ blockNumber: block });
      const ms = Number(header.timestamp) * 1000;
      blockTimes.set(block, ms);
      return ms;
    },
    getNativeBalance: (address) => client.getBalance({ address }),
    getTokenBalance: (token, owner) => client.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [owner] }),
    getAllowance: (token, owner, spender) => client.readContract({ address: token, abi: ERC20_ABI, functionName: 'allowance', args: [owner, spender] }),
    async getAssetConfig(entrypoint, asset): Promise<AssetConfig> {
      const [pool, minimumDeposit, vettingFeeBps, maxRelayFeeBps] = await client.readContract({ address: entrypoint, abi: ENTRYPOINT_ABI, functionName: 'assetConfig', args: [asset] });
      return { pool, minimumDeposit, vettingFeeBps, maxRelayFeeBps };
    },
    async getPrice(feed) {
      const [decimals, round] = await Promise.all([
        client.readContract({ address: feed, abi: CHAINLINK_FEED_ABI, functionName: 'decimals' }),
        client.readContract({ address: feed, abi: CHAINLINK_FEED_ABI, functionName: 'latestRoundData' }),
      ]);
      return { answer: round[1], decimals, updatedAt: round[3] };
    },
    getPoolLogs,
    getRegisteredMeta: (registry, owner) => client.readContract({ address: registry, abi: ERC6538_REGISTRY_ABI, functionName: 'stealthMetaAddressOf', args: [owner, 1n] }),
    async getFirstTokenFunding(token, to): Promise<FirstFunding> {
      try {
        const head = await client.getBlockNumber();
        const floor = head > FUNDING_LOOKBACK_BLOCKS ? head - FUNDING_LOOKBACK_BLOCKS : 0n;
        for (let start = floor; start <= head; start += MAX_LOG_RANGE) {
          const end = start + MAX_LOG_RANGE - 1n < head ? start + MAX_LOG_RANGE - 1n : head;
          const logs = await client.getLogs({ address: token, event: TRANSFER_EVENT, args: { to }, fromBlock: start, toBlock: end, strict: true });
          const first = logs[0];
          if (first) return { kind: 'found', from: first.args.from };
        }
        return { kind: 'unknown' };
      } catch {
        return { kind: 'unknown' };
      }
    },
    async sendFromKey(privateKey: Hex, tx: TxRequest) {
      const wallet = createWalletClient({ account: privateKeyToAccount(privateKey), chain, transport });
      return wallet.sendTransaction({ to: tx.to, data: tx.data, value: tx.value, ...(tx.gas === undefined ? {} : { gas: tx.gas }) });
    },
    getTransactionCount: (address) => client.getTransactionCount({ address, blockTag: 'pending' }),
    sendRawTransaction: (raw) => client.sendRawTransaction({ serializedTransaction: raw }),
    async getReceipt(hash) {
      try {
        return (await client.getTransactionReceipt({ hash })).status;
      } catch {
        return null;
      }
    },
    async waitForReceipt(hash) {
      const receipt = await client.waitForTransactionReceipt({ hash });
      return receipt.status;
    },
    async getSale(sale): Promise<OnchainSale> {
      const read = <N extends 'saleId' | 'creator' | 'token' | 'quoteAsset' | 'saleSupply' | 'lpTokenReserve' | 'floorPrice' | 'minRaise' | 'minEscrow' | 'commitEnd' | 'revealEnd' | 'liquidityBps' | 'bidCount' | 'totalEscrow' | 'outcome' | 'raise' | 'lpPool' | 'lpTokenId' | 'entryCount'>(functionName: N) =>
        client.readContract({ address: sale, abi: SEALED_SALE_ABI, functionName });
      const [saleId, creator, token, quoteAsset, saleSupply, lpTokenReserve, floorPrice, minRaise, minEscrow, commitEnd, revealEnd, liquidityBps, bidCount, totalEscrow, outcome, raise, lpPool, lpTokenId, entryCount, result, units] = await Promise.all([
        read('saleId'), read('creator'), read('token'), read('quoteAsset'), read('saleSupply'), read('lpTokenReserve'), read('floorPrice'), read('minRaise'), read('minEscrow'), read('commitEnd'), read('revealEnd'),
        read('liquidityBps'), read('bidCount'), read('totalEscrow'), read('outcome'), read('raise'), read('lpPool'), read('lpTokenId'), read('entryCount'),
        client.readContract({ address: sale, abi: SEALED_SALE_ABI, functionName: 'clearingResult' }),
        client.readContract({ address: sale, abi: SEALED_SALE_ABI, functionName: 'units' }),
      ]);
      return {
        address: sale, saleId: saleId as bigint, creator: creator as Address, token: token as Address, quoteAsset: quoteAsset as Address, saleSupply: saleSupply as bigint, lpTokenReserve: lpTokenReserve as bigint,
        floorPrice: floorPrice as bigint, minRaise: minRaise as bigint, minEscrow: minEscrow as bigint, commitEnd: BigInt(commitEnd as bigint), revealEnd: BigInt(revealEnd as bigint), liquidityBps: Number(liquidityBps),
        bidCount: bidCount as bigint, totalEscrow: totalEscrow as bigint, outcome: Number(outcome), raise: raise as bigint, lpPool: lpPool as Address, lpTokenId: lpTokenId as bigint, entryCount: entryCount as bigint,
        clearingPrice: result.clearingPrice, undersubscribed: result.undersubscribed, tokensSold: result.tokensSold, units: [...units],
      };
    },
    async getSaleEntries(sale, count) {
      const indexes = Array.from({ length: Number(count) }, (_, i) => BigInt(i));
      const rows = await Promise.all(indexes.map((i) => client.readContract({ address: sale, abi: SEALED_SALE_ABI, functionName: 'entryAt', args: [i] })));
      return rows.map(([price, quantity]) => ({ price, quantity }));
    },
    async getBid(sale, commitment) {
      const bid = await client.readContract({ address: sale, abi: SEALED_SALE_ABI, functionName: 'bidInfo', args: [commitment] });
      return { escrow: bid.escrow, prefix: bid.prefix, recipient: bid.recipient, entry: bid.entry, status: bid.status, vaultFunded: bid.vaultFunded };
    },
    async getAllocation(sale, commitment) {
      const [tokens, paid] = await client.readContract({ address: sale, abi: SEALED_SALE_ABI, functionName: 'allocationOf', args: [commitment] });
      return { tokens, paid };
    },
    async getTokenInfo(token) {
      const [name, symbol, totalSupply] = await Promise.all([
        client.readContract({ address: token, abi: ERC20_METADATA_ABI, functionName: 'name' }),
        client.readContract({ address: token, abi: ERC20_METADATA_ABI, functionName: 'symbol' }),
        client.readContract({ address: token, abi: ERC20_METADATA_ABI, functionName: 'totalSupply' }),
      ]);
      return { name, symbol, totalSupply };
    },
    async previewFinalize(sale, price) {
      try {
        await client.readContract({ address: sale, abi: SEALED_SALE_ABI, functionName: 'previewFinalize', args: [price] });
        return true;
      } catch {
        return false;
      }
    },
    async getLatestTimestamp() {
      return (await client.getBlock({ blockTag: 'latest' })).timestamp;
    },
    getRegistryNonce: (registry, owner) => client.readContract({ address: registry, abi: REGISTRY_NONCE_ABI, functionName: 'nonceOf', args: [owner] }),
    async getSaleAddress(factory, saleId) {
      const count = await client.readContract({ address: factory, abi: LAUNCH_FACTORY_ABI, functionName: 'saleCount' });
      if (saleId >= count) return null;
      return client.readContract({ address: factory, abi: LAUNCH_FACTORY_ABI, functionName: 'sales', args: [saleId] });
    },
    getVestingDuration: (vesting) => client.readContract({ address: vesting, abi: VESTING_ABI, functionName: 'duration' }),
    async getSaleProfilePointer(factory, sale) {
      return profilePointerFrom(await client.readContract({ address: factory, abi: LAUNCH_FACTORY_ABI, functionName: 'profileOf', args: [sale] }));
    },
    async waitForReceiptLogs(hash) {
      const receipt = await client.waitForTransactionReceipt({ hash });
      return { status: receipt.status, logs: receipt.logs.map((l) => ({ address: l.address, topics: [...l.topics] as Hex[], data: l.data })) };
    },
  };
}
