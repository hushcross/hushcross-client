import type { Phase } from '../../components/PhaseBar/PhaseBar';
import type { Translate } from '../../i18n/I18nProvider';
import type { Sale, SalePhase } from '../../data/types';

export type BarPhase = 'commit' | 'reveal' | 'settle' | 'claim';

export function salePhases(sale: Sale, t: Translate): readonly Phase<BarPhase>[] {
  return [
    { id: 'commit', label: t('launch.phase.commit'), endsAt: sale.commitEnd },
    { id: 'reveal', label: t('launch.phase.reveal'), endsAt: sale.revealEnd },
    { id: 'settle', label: t('launch.phase.settle') },
    { id: 'claim', label: t('launch.phase.claim') },
  ];
}

export function barPhase(phase: SalePhase): BarPhase | null {
  if (phase === 'upcoming') return null;
  if (phase === 'failed') return 'claim';
  return phase;
}

/** Next timestamp worth counting down to for a sale card. */
export function nextDeadline(sale: Sale): number | null {
  if (sale.phase === 'upcoming') return sale.commitStart;
  if (sale.phase === 'commit') return sale.commitEnd;
  if (sale.phase === 'reveal') return sale.revealEnd;
  return null;
}
