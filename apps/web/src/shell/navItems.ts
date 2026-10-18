import type { IconName } from '../components/Icon/Icon';
import type { MessageKey } from '../i18n/types';

export interface NavItem {
  readonly to: string;
  readonly icon: IconName;
  readonly label: MessageKey;
  readonly module?: 'vault' | 'send' | 'launch' | 'book' | 'give';
}

export const RAIL_ITEMS: readonly NavItem[] = [
  { to: '/', icon: 'home', label: 'nav.home' },
  { to: '/vault', icon: 'vault', label: 'nav.vault', module: 'vault' },
  { to: '/send', icon: 'send', label: 'nav.send', module: 'send' },
  { to: '/launch', icon: 'launch', label: 'nav.launch', module: 'launch' },
  { to: '/book', icon: 'book', label: 'nav.book', module: 'book' },
  { to: '/give', icon: 'give', label: 'nav.give', module: 'give' },
];

export const TAB_ITEMS: readonly NavItem[] = [
  { to: '/', icon: 'home', label: 'nav.home' },
  { to: '/vault', icon: 'vault', label: 'nav.vault' },
  { to: '/send', icon: 'send', label: 'nav.send' },
  { to: '/launch', icon: 'launch', label: 'nav.launch' },
  { to: '/more', icon: 'more', label: 'nav.more' },
];

/** Simple mode: the actions, what is running, and receiving. */
export const SIMPLE_RAIL_ITEMS: readonly NavItem[] = [
  { to: '/', icon: 'home', label: 'nav.home' },
  { to: '/do/send', icon: 'send', label: 'simple.nav.send', module: 'send' },
  { to: '/do/receive', icon: 'arrowDown', label: 'simple.nav.receive', module: 'vault' },
  { to: '/jobs', icon: 'clock', label: 'simple.nav.jobs' },
];

export const SIMPLE_TAB_ITEMS: readonly NavItem[] = [
  { to: '/', icon: 'home', label: 'nav.home' },
  { to: '/do/send', icon: 'send', label: 'simple.nav.send' },
  { to: '/do/receive', icon: 'arrowDown', label: 'simple.nav.receive' },
  { to: '/jobs', icon: 'clock', label: 'simple.nav.jobs' },
  { to: '/settings', icon: 'settings', label: 'nav.settings' },
];

/** Paths that light up the "More" tab on mobile. */
export const MORE_PATHS = ['/more', '/book', '/give', '/settings', '/docs'];
