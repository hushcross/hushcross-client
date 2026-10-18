import type { AmountSplit } from '@hushcross/core';
import type { ReactNode } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { useFormat } from '../../lib/useFormat';
import { formatAmount } from '../../data/units';
import { Figure } from '../../components/Figure/Figure';
import s from '../simple.module.css';

export interface SummaryRow {
  readonly label: string;
  readonly value: ReactNode;
  readonly strong?: boolean;
}

/** Receipt-style lines: label left, value right. */
export function Summary({ rows }: { readonly rows: readonly SummaryRow[] }) {
  return (
    <dl className={s.summary}>
      {rows.map((row) => (
        <div key={row.label} className={[s.summaryRow, row.strong ? s.summaryStrong : ''].join(' ')}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The confirm screen's headline: the amount as a display figure, with one line of context under it. */
export function ReceiptHead({ amount, unit, caption }: { readonly amount: string; readonly unit: string; readonly caption?: ReactNode }) {
  return (
    <div className={s.receiptHead}>
      <Figure value={amount} unit={unit} roll className={s.receiptFigure} />
      {caption ? <div className={s.receiptCaption}>{caption}</div> : null}
    </div>
  );
}

/** "You send X, fees about Y, Z stays in your vault" plus the standard amounts it splits into. */
export function AmountSummary({ asset, split, fee }: { readonly asset: string; readonly split: AmountSplit; readonly fee: bigint | null }) {
  const { t } = useI18n();
  const fmt = useFormat();
  const counts = new Map<bigint, number>();
  for (const p of split.pieces) counts.set(p, (counts.get(p) ?? 0) + 1);
  return (
    <div className={s.section} aria-live="polite">
      <Summary
        rows={[
          { label: t('simple.amount.youSend'), value: fmt.amount(split.sent, asset), strong: true },
          { label: t('simple.amount.fees'), value: fee === null ? '…' : fmt.amount(fee, asset, 6) },
          ...(split.remainder > 0n ? [{ label: t('simple.amount.stays'), value: fmt.amount(split.remainder, asset, 6) }] : []),
        ]}
      />
      <p className={s.hint}>{t('simple.amount.pieces', { n: split.pieces.length })}</p>
      <ul className={s.chips} aria-label={t('simple.amount.piecesLabel')}>
        {[...counts.entries()].map(([unit, count]) => (
          <li key={unit.toString()} className={s.chipUnit}>
            {count > 1 ? `${count} × ` : ''}
            {formatAmount(unit, { maxFraction: 4 })}
          </li>
        ))}
      </ul>
      {split.capped ? <p className={s.hintWarn}>{t('simple.amount.capped', { amount: fmt.amount(split.remainder, asset) })}</p> : null}
    </div>
  );
}
