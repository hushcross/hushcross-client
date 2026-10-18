import { useId } from 'react';
import { Segmented } from '../../components/Segmented/Segmented';
import type { Asset } from '../../data/types';
import { useI18n } from '../../i18n/I18nProvider';
import s from '../simple.module.css';

export interface AmountInputProps {
  readonly label: string;
  readonly asset: Asset;
  readonly onAsset?: (asset: Asset) => void;
  readonly value: string;
  readonly onChange: (text: string) => void;
  readonly error?: string | null;
  readonly children?: React.ReactNode;
}

/** Display size steps down as the figure grows, so long amounts never clip (desktop, phone). */
export function amountSizes(length: number): { readonly desktop: string; readonly phone: string } {
  if (length <= 5) return { desktop: '6rem', phone: '4.25rem' };
  if (length <= 8) return { desktop: '4.75rem', phone: '3.25rem' };
  if (length <= 11) return { desktop: '3.75rem', phone: '2.5rem' };
  return { desktop: '2.75rem', phone: '2rem' };
}

/** A large free-amount field; the app splits the amount into standard units. */
export function AmountInput({ label, asset, onAsset, value, onChange, error, children }: AmountInputProps) {
  const { t } = useI18n();
  const id = useId();
  const sizes = amountSizes(value.length);
  return (
    <div className={s.amountField}>
      {onAsset ? (
        <Segmented<Asset> legend={t('simple.amount.asset')} hideLegend size="sm" value={asset} onChange={onAsset} options={[{ value: 'USDT', label: 'USDT' }, { value: 'BNB', label: 'BNB' }]} />
      ) : null}
      <label htmlFor={id} className={s.amountLabel}>
        {label}
      </label>
      <div className={s.amountRow} style={{ ['--amount-size' as string]: sizes.desktop, ['--amount-size-sm' as string]: sizes.phone }}>
        <input
          id={id}
          className={s.amountInput}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          value={value}
          style={{ ['--len' as string]: Math.max(1, value.length) }}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.'))}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <span className={s.amountAsset}>{asset}</span>
      </div>
      {error ? (
        <p id={`${id}-error`} className={s.hintWarn} role="alert">
          {error}
        </p>
      ) : null}
      {children}
    </div>
  );
}
