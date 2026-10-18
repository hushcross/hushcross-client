import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { readStored, writeStored } from '../lib/storage';

/** Simple: one-step actions that run in the background (default). Pro: the full module screens. */
export type UiMode = 'simple' | 'pro';

export const MODE_STORAGE_KEY = 'hushcross.mode';

export function loadMode(): UiMode {
  // First visit opens Pro; a visitor's own choice is remembered.
  return readStored(MODE_STORAGE_KEY) === 'simple' ? 'simple' : 'pro';
}

interface ModeContextValue {
  readonly mode: UiMode;
  readonly setMode: (mode: UiMode) => void;
}

const ModeContext = createContext<ModeContextValue | null>(null);

export function ModeProvider({ children }: { readonly children: ReactNode }) {
  const [mode, setModeState] = useState<UiMode>(loadMode);
  const setMode = useCallback((next: UiMode) => {
    writeStored(MODE_STORAGE_KEY, next);
    setModeState(next);
  }, []);
  const value = useMemo(() => ({ mode, setMode }), [mode, setMode]);
  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>;
}

export function useUiMode(): ModeContextValue {
  const value = useContext(ModeContext);
  if (!value) throw new Error('useUiMode must be used inside ModeProvider');
  return value;
}
