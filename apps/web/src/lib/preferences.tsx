import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_THRESHOLDS, type PrivacyThresholds } from '../data/privacyCheck';
import type { Funding } from '../data/types';
import { readStored, writeStored } from './storage';

export interface Preferences {
  /** Default random relay delay upper bound, minutes (0–30). */
  readonly relayDelayMinutes: number;
  /** Attach a small BNB gas drop to relayed withdrawals by default. */
  readonly gasDrop: boolean;
  /** Blur balances on Home until tapped. */
  readonly hideBalances: boolean;
  /** Default funding source for bids, orders and donations. */
  readonly defaultFunding: Funding;
  /** Privacy Check thresholds (SPEC §2.1). */
  readonly privacy: PrivacyThresholds;
}

export const DEFAULT_PREFERENCES: Preferences = { relayDelayMinutes: 5, gasDrop: true, hideBalances: false, defaultFunding: 'vault', privacy: DEFAULT_THRESHOLDS };
export const PREFERENCES_STORAGE_KEY = 'hushcross.prefs';

const clampInt = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;

export function loadThresholds(raw: unknown): PrivacyThresholds {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_THRESHOLDS;
  const r = raw as Record<string, unknown>;
  const d = DEFAULT_THRESHOLDS;
  const anonymityWeak = clampInt(r.anonymityWeak, 1, 1000, d.anonymityWeak);
  return {
    anonymityWeak,
    anonymityFair: Math.max(anonymityWeak, clampInt(r.anonymityFair, 1, 10_000, d.anonymityFair)),
    ageWeakMinutes: clampInt(r.ageWeakMinutes, 0, 1440, d.ageWeakMinutes),
    ageFairHours: clampInt(r.ageFairHours, 0, 168, d.ageFairHours),
    repeatRecipient: clampInt(r.repeatRecipient, 1, 50, d.repeatRecipient),
  };
}

function load(): Preferences {
  const raw = readStored(PREFERENCES_STORAGE_KEY);
  if (!raw) return DEFAULT_PREFERENCES;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_PREFERENCES;
    const p = parsed as Record<string, unknown>;
    const delay = typeof p.relayDelayMinutes === 'number' ? Math.min(30, Math.max(0, Math.round(p.relayDelayMinutes))) : DEFAULT_PREFERENCES.relayDelayMinutes;
    return {
      relayDelayMinutes: delay,
      gasDrop: typeof p.gasDrop === 'boolean' ? p.gasDrop : DEFAULT_PREFERENCES.gasDrop,
      hideBalances: typeof p.hideBalances === 'boolean' ? p.hideBalances : DEFAULT_PREFERENCES.hideBalances,
      defaultFunding: p.defaultFunding === 'public' ? 'public' : 'vault',
      privacy: loadThresholds(p.privacy),
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

interface PreferencesContextValue {
  readonly preferences: Preferences;
  readonly update: (patch: Partial<Preferences>) => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { readonly children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(load);
  const update = useCallback((patch: Partial<Preferences>) => {
    setPreferences((current) => {
      const next = { ...current, ...patch };
      writeStored(PREFERENCES_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);
  const value = useMemo(() => ({ preferences, update }), [preferences, update]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error('usePreferences must be used inside PreferencesProvider');
  return value;
}
