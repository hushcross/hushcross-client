import { useI18n } from '../../i18n/I18nProvider';
import styles from './PrivacyMeter.module.css';

export interface PrivacyMeterProps {
  /** Approved deposits in the same pool this note blends with. */
  readonly mixedWith: number;
  /** Count at which the bar is drawn full (purely visual scale). */
  readonly scale?: number;
  readonly pending?: boolean;
  readonly compact?: boolean;
}

/** Thin bar + plain count. Deliberately no percentage (DESIGN_SYSTEM §5). */
export function PrivacyMeter({ mixedWith, scale = 1000, pending = false, compact = false }: PrivacyMeterProps) {
  const { t } = useI18n();
  const fill = pending ? 0 : Math.min(1, Math.log10(1 + mixedWith) / Math.log10(1 + scale));
  return (
    <div className={[styles.meter, compact ? styles.compact : ''].join(' ')}>
      <div className={styles.track} aria-hidden="true">
        <div className={styles.fill} style={{ width: `${(fill * 100).toFixed(1)}%` }} />
      </div>
      <span className={styles.label}>{pending ? t('privacy.pending') : t('privacy.mixed', { n: mixedWith.toLocaleString('en-US') })}</span>
    </div>
  );
}
