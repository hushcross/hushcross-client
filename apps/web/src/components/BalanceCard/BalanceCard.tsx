import { useId } from 'react';
import type { Asset, Balances } from '../../data/types';
import { ASSETS } from '../../data/types';
import { formatAmount } from '../../data/units';
import { useI18n } from '../../i18n/I18nProvider';
import { Button } from '../Button/Button';
import { Icon } from '../Icon/Icon';
import { Figure } from '../Figure/Figure';
import { Rosette } from '../../illustrations/Guilloche';
import styles from './BalanceCard.module.css';

export interface BalanceCardProps {
  readonly balances: Balances;
  readonly hidden?: boolean;
  readonly onToggleHidden?: () => void;
  readonly onConnect?: () => void;
  readonly assets?: readonly Asset[];
}

export function BalanceCard({ balances, hidden = false, onToggleHidden, onConnect, assets = ASSETS }: BalanceCardProps) {
  const { t } = useI18n();
  const titleId = useId();
  const mask = (value: string): string => (hidden ? '••••' : value);
  return (
    <section className={styles.card} aria-labelledby={titleId}>
      <div className={styles.vault}>
        <Rosette className={styles.rosette} />
        <div className={styles.head}>
          <h2 id={titleId} className={styles.kicker}>
            <Icon name="lock" size={15} />
            {t('balance.vault')}
          </h2>
          {onToggleHidden ? (
            <button type="button" className={styles.iconButton} onClick={onToggleHidden} aria-pressed={hidden} aria-label={hidden ? t('balance.show') : t('balance.hide')}>
              <Icon name={hidden ? 'eye' : 'eyeOff'} size={18} />
            </button>
          ) : null}
        </div>
        <div className={styles.amounts}>
          {assets.map((asset) => (
            <div key={asset} className={styles.amount}>
              <span className={styles.asset}>{asset}</span>
              <span className={styles.figure}>{hidden ? <span aria-label={t('balance.hidden')}>••••</span> : <Figure value={formatAmount(balances.vault[asset], { maxFraction: 4 })} roll />}</span>
              {balances.vaultPending[asset] > 0n ? (
                <span className={styles.pending}>{t('balance.pending', { amount: mask(formatAmount(balances.vaultPending[asset])), asset })}</span>
              ) : null}
            </div>
          ))}
        </div>
        <p className={styles.note}>{t('balance.vaultNote')}</p>
      </div>
      <div className={styles.public}>
        <div className={styles.publicHead}>
          <h3 className={styles.publicTitle}>
            <Icon name="wallet" size={16} />
            {t('balance.public')}
          </h3>
          <span className={styles.visible}>{t('balance.publicNote')}</span>
        </div>
        {balances.publicWallet ? (
          <ul className={styles.publicList}>
            {assets.map((asset) => (
              <li key={asset}>
                <span className="mono">{mask(formatAmount(balances.publicWallet?.[asset] ?? 0n))}</span> <span className="muted">{asset}</span>
              </li>
            ))}
          </ul>
        ) : onConnect ? (
          <Button size="sm" variant="secondary" icon="wallet" onClick={onConnect}>
            {t('balance.connect')}
          </Button>
        ) : (
          <span className="muted">{t('balance.notConnected')}</span>
        )}
      </div>
    </section>
  );
}
