import type { CoinTone } from '../../components/Coin/Coin';
import type { IconName } from '../../components/Icon/Icon';
import { rememberShared } from '../../motion/shared';

export type ActionId = 'send' | 'receive' | 'gift' | 'sale' | 'trade' | 'donate';

/** Icon and module tone of each Simple-mode action (one coin from tile to progress screen). */
export const ACTION_COIN: Readonly<Record<ActionId, { readonly icon: IconName; readonly tone: CoinTone }>> = {
  send: { icon: 'send', tone: 'send' },
  receive: { icon: 'receive', tone: 'vault' },
  gift: { icon: 'redPacket', tone: 'give' },
  sale: { icon: 'sale', tone: 'launch' },
  trade: { icon: 'book', tone: 'book' },
  donate: { icon: 'give', tone: 'give' },
};

/** Shared-element key of an action's coin (tile → wizard). */
export const actionShareKey = (id: ActionId): string => `action:${id}`;
/** Shared-element key of a job's coin (wizard / list row → progress screen). */
export const jobShareKey = (id: string): string => `job:${id}`;

/** Hand the wizard's coin to the progress screen of the job it just started. */
export function handoffToJob(action: ActionId, jobId: string): void {
  if (typeof document === 'undefined') return;
  rememberShared(jobShareKey(jobId), document.querySelector(`[data-share="${actionShareKey(action)}"]`));
}
