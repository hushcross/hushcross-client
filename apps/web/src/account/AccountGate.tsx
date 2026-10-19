import { Fragment, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAccount } from './AccountProvider';
import { useUiMode } from '../simple/mode';
import { Onboarding, UnlockScreen } from './Onboarding';
import { SimpleOnboarding } from './SimpleOnboarding';
import { isPublicBrowsingPath, safeReturnPath } from './routeAccess';

/** Browsing never creates/unlocks an account; action routes keep the original setup flow. */
export function AccountGate({ children, required = false }: { readonly children: ReactNode; readonly required?: boolean }) {
  const account = useAccount();
  const { pathname, search } = useLocation();
  const { mode } = useUiMode();
  if (!account) return <>{children}</>;
  if (pathname === '/account' && account.status === 'unlocked') return <Navigate to={safeReturnPath(new URLSearchParams(search).get('returnTo'))} replace />;
  const developmentPreview = import.meta.env.DEV && pathname.startsWith('/dev/');
  if (account.status === 'unlocked' || !required && (developmentPreview || isPublicBrowsingPath(pathname))) {
    // Drop all personal resource snapshots and in-flight callbacks across a lock/unlock.
    return <Fragment key={account.status}>{children}</Fragment>;
  }
  if (account.status === 'none') return mode === 'simple' ? <SimpleOnboarding manager={account.manager} /> : <Onboarding manager={account.manager} />;
  return <UnlockScreen manager={account.manager} />;
}
