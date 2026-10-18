import type { UnitDeposit } from '@hushcross/core';
import { depositCost } from '@hushcross/core';
import { Icon } from '../../components/Icon/Icon';
import { useI18n } from '../../i18n/I18nProvider';
import { useFormat } from '../../lib/useFormat';
import s from '../simple.module.css';

/** Says plainly whether the vault covers the action or the wallet tops it up first (and what that costs). */
export function FundingNote({ asset, deposits, feeBps }: { readonly asset: string; readonly deposits: readonly UnitDeposit[] | null; readonly feeBps: number }) {
  const { t } = useI18n();
  const fmt = useFormat();
  if (deposits === null) return null;
  if (deposits.length === 0) {
    return (
      <p className={s.hint}>
        <Icon name="lock" size={16} />
        {t('simple.amount.fromVault')}
      </p>
    );
  }
  const cost = depositCost(deposits, feeBps);
  return (
    <p className={s.hintCalm}>
      <Icon name="wallet" size={16} />
      {t('simple.amount.fromWalletNote', { amount: fmt.amount(cost, asset), fee: `${(feeBps / 100).toFixed(feeBps % 100 === 0 ? 0 : 1)}%` })}
    </p>
  );
}

export function walletTopUp(deposits: readonly UnitDeposit[] | null, feeBps: number): bigint {
  return deposits && deposits.length > 0 ? depositCost(deposits, feeBps) : 0n;
}
