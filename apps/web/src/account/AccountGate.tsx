import type { ReactNode } from 'react';
import { useLocation } from 'react-router';
import { useAccount } from './AccountProvider';
import { useUiMode } from '../simple/mode';
import { Onboarding, UnlockScreen } from './Onboarding';
import { SimpleOnboarding } from './SimpleOnboarding';

/** Routes that work without an unlocked vault (a gift can be claimed to any address). */
const OPEN_PATHS = ['/gift', '/pay/', '/dev/', '/about', '/docs'];

export function AccountGate({ children }: { readonly children: ReactNode }) {
  const account = useAccount();
  const { pathname } = useLocation();
  const { mode } = useUiMode();
  if (pathname === '/app' || pathname === '/privacy' || pathname === '/privacy/' || !account || account.status === 'unlocked' || OPEN_PATHS.some((p) => pathname === p || pathname.startsWith(p))) return <>{children}</>;
  if (account.status === 'none') return mode === 'simple' ? <SimpleOnboarding manager={account.manager} /> : <Onboarding manager={account.manager} />;
  return <UnlockScreen manager={account.manager} />;
}
