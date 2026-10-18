import type { Asset, UnitOption } from '../../data/types';
import { formatAmount } from '../../data/units';
import { useI18n } from '../../i18n/I18nProvider';
import { Segmented } from '../Segmented/Segmented';
import styles from './UnitPicker.module.css';

export interface UnitPickerProps {
  readonly asset: Asset;
  readonly options: readonly UnitOption[];
  readonly value: bigint | null;
  readonly onChange: (unit: bigint) => void;
  readonly feeBps: number;
  /** Show the gross-with-fee caption (deposits); off for withdrawals. */
  readonly showGross?: boolean;
  readonly label?: string;
  readonly count?: number;
}

export function UnitPicker({ asset, options, value, onChange, feeBps, showGross = true, label, count = 1 }: UnitPickerProps) {
  const { t } = useI18n();
  const selected = options.find((o) => o.net === value) ?? null;
  const n = BigInt(Math.max(1, count));
  const caption = selected ? (
    showGross ? (
      <span className={styles.caption}>
        {t('unitPicker.gross', { gross: formatAmount(selected.gross * n, { maxFraction: 6 }), asset, fee: (feeBps / 100).toFixed(2) })}
      </span>
    ) : (
      <span className={styles.caption}>{t('unitPicker.netOnly', { net: formatAmount(selected.net * n, { maxFraction: 6 }), asset })}</span>
    )
  ) : (
    <span className={styles.caption}>{t('unitPicker.choose')}</span>
  );
  return (
    <Segmented
      legend={label ?? t('unitPicker.label', { asset })}
      options={options.map((o) => ({ value: o.net.toString(), label: <span className="mono">{formatAmount(o.net)}</span> }))}
      value={value === null ? null : value.toString()}
      onChange={(next) => onChange(BigInt(next))}
      caption={caption}
    />
  );
}
