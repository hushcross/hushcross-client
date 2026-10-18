import type { BadgeTone } from '../../components/Badge/Badge';
import type { ActivityStatus, BidStatus, CampaignStatus, IncomingStatus, NoteStatus, OrderStatus, RelayJobStatus, SalePhase } from '../../data/types';

export const noteTone: Readonly<Record<NoteStatus, BadgeTone>> = { in_review: 'warn', approved: 'ok', declined: 'danger', spent: 'neutral', exited: 'neutral' };
export const activityTone: Readonly<Record<ActivityStatus, BadgeTone>> = { pending: 'warn', done: 'ok', failed: 'danger' };
export const jobTone: Readonly<Record<RelayJobStatus, BadgeTone>> = { delayed: 'warn', submitted: 'accent', confirmed: 'ok', failed: 'danger' };
export const incomingTone: Readonly<Record<IncomingStatus, BadgeTone>> = { unclaimed: 'accent', redepositing: 'warn', in_vault: 'ok' };
export const phaseTone: Readonly<Record<SalePhase, BadgeTone>> = { upcoming: 'neutral', commit: 'accent', reveal: 'warn', settle: 'warn', claim: 'ok', failed: 'danger' };
export const bidTone: Readonly<Record<BidStatus, BadgeTone>> = { sealed: 'accent', revealed: 'accent', won: 'ok', partial: 'ok', lost: 'neutral', unrevealed: 'danger', claimed: 'neutral', refunded: 'neutral' };
export const orderTone: Readonly<Record<OrderStatus, BadgeTone>> = { sealed: 'accent', revealed: 'accent', filled: 'ok', partial: 'ok', unfilled: 'neutral', rolled: 'warn', refunded: 'neutral' };
export const campaignTone: Readonly<Record<CampaignStatus, BadgeTone>> = { active: 'accent', succeeded: 'ok', failed: 'danger' };
