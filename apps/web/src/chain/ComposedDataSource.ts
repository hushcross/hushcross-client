import type { DataSource } from '../data/DataSource';
import type { ChainDataSource } from './ChainDataSource';

/**
 * Since W4 every module (Vault, Send, Gift, Privacy Check, Launch, Book, Give) is chain-backed, so the
 * composed source is the chain source itself; Mock mode (`VITE_DATA_SOURCE=mock`) uses `MockDataSource`.
 */
export function composeDataSource(chain: ChainDataSource): DataSource {
  return chain;
}
