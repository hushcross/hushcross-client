import { useI18n } from '../i18n/I18nProvider';
import type { Locale } from '../i18n/types';
import { useUiMode, type UiMode } from '../simple/mode';
import styles from './AppShell.module.css';

interface Option<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly lang?: string;
}

function Pill<T extends string>({ label, value, options, onChange }: { readonly label: string; readonly value: T; readonly options: readonly Option<T>[]; readonly onChange: (next: T) => void }) {
  return (
    <div className={styles.pill} role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          lang={option.lang}
          className={[styles.pillOption, option.value === value ? styles.pillOn : ''].join(' ')}
          onClick={() => option.value !== value && onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Always-visible switches for the interface style (Simple / Pro) and the language (Chinese / English). */
export function QuickSwitches() {
  const { t, locale, setLocale } = useI18n();
  const { mode, setMode } = useUiMode();
  return (
    <div className={styles.switches}>
      <Pill<UiMode>
        label={t('simple.mode.legend')}
        value={mode}
        onChange={setMode}
        options={[
          { value: 'simple', label: t('shell.modeSimple') },
          { value: 'pro', label: t('shell.modePro') },
        ]}
      />
      <Pill<Locale>
        label={t('settings.language')}
        value={locale}
        onChange={setLocale}
        options={[
          { value: 'zh', label: t('shell.langZh'), lang: 'zh' },
          { value: 'en', label: t('shell.langEn'), lang: 'en' },
        ]}
      />
    </div>
  );
}
