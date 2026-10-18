import type { Deployments } from '@hushcross/core';
import type { CoinTone } from '../../components/Coin/Coin';
import type { IconName } from '../../components/Icon/Icon';

export type DocsSectionId = 'overview' | 'vault' | 'send' | 'gift' | 'launch' | 'book' | 'give' | 'privacy' | 'fees' | 'contracts' | 'faq';

export interface DocsSectionMeta {
  readonly id: DocsSectionId;
  readonly icon: IconName;
  readonly tone: CoinTone;
}

/** Page order; the table of contents follows it. */
export const DOCS_SECTIONS: readonly DocsSectionMeta[] = [
  { id: 'overview', icon: 'mix', tone: 'accent' },
  { id: 'vault', icon: 'vault', tone: 'vault' },
  { id: 'send', icon: 'send', tone: 'send' },
  { id: 'gift', icon: 'redPacket', tone: 'give' },
  { id: 'launch', icon: 'launch', tone: 'launch' },
  { id: 'book', icon: 'book', tone: 'book' },
  { id: 'give', icon: 'give', tone: 'give' },
  { id: 'privacy', icon: 'shield', tone: 'accent' },
  { id: 'fees', icon: 'receipt', tone: 'neutral' },
  { id: 'contracts', icon: 'seal', tone: 'neutral' },
  { id: 'faq', icon: 'info', tone: 'neutral' },
];

export type ModuleId = 'vault' | 'send' | 'gift' | 'launch' | 'book' | 'give';

/** Leaf keys under docs.sections.<module>.steps / .params, in display order. */
export const MODULE_CONTENT: Readonly<Record<ModuleId, { readonly steps: readonly string[]; readonly params: readonly string[] }>> = {
  vault: { steps: ['s1', 's2', 's3'], params: ['bnb', 'usdt', 'fee', 'relay', 'base'] },
  send: { steps: ['s1', 's2', 's3'], params: ['standards', 'gas', 'delay'] },
  gift: { steps: ['s1', 's2', 's3'], params: ['modes', 'expiry', 'group'] },
  launch: { steps: ['s1', 's2', 's3', 's4'], params: ['pricing', 'fee', 'liquidity', 'creator', 'profile'] },
  book: { steps: ['s1', 's2', 's3'], params: ['markets', 'batch', 'band', 'fee', 'min'] },
  give: { steps: ['s1', 's2', 's3'], params: ['fee', 'public', 'private'] },
};

export const FEE_ROWS = ['vault', 'relay', 'launch', 'book', 'give'] as const;
export const FAQ_ITEMS = ['lost', 'amounts', 'wait', 'relay', 'fail', 'check', 'code'] as const;
export const PRIVATE_POINTS = ['p1', 'p2', 'p3'] as const;
export const PUBLIC_POINTS = ['p1', 'p2', 'p3', 'p4'] as const;

export type ContractId =
  | 'entrypoint'
  | 'bnbPool'
  | 'usdtPool'
  | 'hushSend'
  | 'gift'
  | 'launchFactory'
  | 'launchAdapter'
  | 'sealedBook'
  | 'bookAdapter'
  | 'giveRegistry'
  | 'giveEscrow'
  | 'giveAdapter';

export interface ContractRow {
  readonly id: ContractId;
  readonly icon: IconName;
  readonly tone: CoinTone;
  readonly address: (d: Deployments) => string | null;
}

/** The main contracts, grouped by module, read from the deployments file. */
export const CONTRACT_ROWS: readonly ContractRow[] = [
  { id: 'entrypoint', icon: 'vault', tone: 'vault', address: (d) => d.entrypoint },
  { id: 'bnbPool', icon: 'vault', tone: 'vault', address: (d) => d.pools.BNB.pool },
  { id: 'usdtPool', icon: 'vault', tone: 'vault', address: (d) => d.pools.USDT.pool },
  { id: 'hushSend', icon: 'send', tone: 'send', address: (d) => d.hushSend },
  { id: 'gift', icon: 'redPacket', tone: 'give', address: (d) => d.gift },
  { id: 'launchFactory', icon: 'launch', tone: 'launch', address: (d) => d.launchFactory },
  { id: 'launchAdapter', icon: 'launch', tone: 'launch', address: (d) => d.launchAdapter },
  { id: 'sealedBook', icon: 'book', tone: 'book', address: (d) => d.book },
  { id: 'bookAdapter', icon: 'book', tone: 'book', address: (d) => d.bookAdapter },
  { id: 'giveRegistry', icon: 'give', tone: 'give', address: (d) => d.giveRegistry },
  { id: 'giveEscrow', icon: 'give', tone: 'give', address: (d) => d.giveEscrow },
  { id: 'giveAdapter', icon: 'give', tone: 'give', address: (d) => d.giveAdapter },
];

export const BSCSCAN_ADDRESS = 'https://bscscan.com/address/';
