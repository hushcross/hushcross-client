import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { readStored, writeStored } from '../lib/storage';
import { en } from './locales/en/index';
import { zh } from './locales/zh/index';
import { interpolate, lookup } from './translate';
import type { Locale, MessageKey, Messages, Vars } from './types';

export const LOCALE_STORAGE_KEY = 'hushcross.locale';
const catalogs: Readonly<Record<Locale, Messages>> = { en, zh };

export type Translate = (key: MessageKey, vars?: Vars) => string;

interface I18nContextValue {
  readonly locale: Locale;
  readonly setLocale: (next: Locale) => void;
  readonly t: Translate;
  /** BCP-47 tag for Intl formatters. */
  readonly intlLocale: string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function initialLocale(): Locale {
  const stored = readStored(LOCALE_STORAGE_KEY);
  if (stored === 'en' || stored === 'zh') return stored;
  // First visit opens in English; a visitor's own choice is remembered.
  return 'en';
}

export function I18nProvider({ children, locale: forced }: { readonly children: ReactNode; readonly locale?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(() => forced ?? initialLocale());

  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    writeStored(LOCALE_STORAGE_KEY, next);
  }, []);

  const t = useCallback<Translate>((key, vars) => interpolate(lookup(catalogs[locale], key), vars), [locale]);
  const value = useMemo(() => ({ locale, setLocale, t, intlLocale: locale === 'zh' ? 'zh-CN' : 'en-US' }), [locale, setLocale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}
