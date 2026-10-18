import { useEffect, type ReactNode } from 'react';
import { BrowserRouter, MemoryRouter, useNavigate } from 'react-router';
import { ExtensionTools } from './ExtensionTools';
import { EXTENSION_NAVIGATION_EVENT, IS_EXTENSION, isExtensionJobPath } from './runtime';

function LocalNotificationNavigation() {
  const navigate = useNavigate();
  useEffect(() => {
    const onNavigation = (event: Event): void => {
      const path: unknown = (event as CustomEvent<unknown>).detail;
      if (isExtensionJobPath(path)) navigate(path);
    };
    window.addEventListener(EXTENSION_NAVIGATION_EVENT, onNavigation);
    return () => window.removeEventListener(EXTENSION_NAVIGATION_EVENT, onNavigation);
  }, [navigate]);
  return null;
}

/** Extension navigation remains in memory, including gift fragments. */
export function AppRouter({ children }: { readonly children: ReactNode }) {
  if (IS_EXTENSION) return <MemoryRouter initialEntries={['/']}><LocalNotificationNavigation /><ExtensionTools />{children}</MemoryRouter>;
  return <BrowserRouter>{children}</BrowserRouter>;
}
