import { Link } from 'react-router';
import { Badge } from '../../components/Badge/Badge';
import { Countdown } from '../../components/Countdown/Countdown';
import { Progress } from '../../components/Progress/Progress';
import { RollingNumber } from '../../components/RollingNumber/RollingNumber';
import type { Campaign } from '../../data/types';
import { formatAmount } from '../../data/units';
import { useI18n } from '../../i18n/I18nProvider';
import { campaignTone } from '../shared/status';
import styles from '../page.module.css';
import local from './Give.module.css';

export function CampaignProgress({ campaign }: { readonly campaign: Campaign }) {
  const { t } = useI18n();
  return (
    <div className={styles.stackSm}>
      <div className={local.raisedLine}>
        <span className={local.raised}><RollingNumber value={formatAmount(campaign.raised, { maxFraction: 2 })} /></span>
        <span className={styles.rowSub}>
          {campaign.goal !== null ? t('give.card.ofGoal', { goal: formatAmount(campaign.goal, { maxFraction: 2 }), asset: campaign.asset }) : campaign.asset}
        </span>
      </div>
      {campaign.goal !== null ? <Progress value={campaign.raised} max={campaign.goal} label={t('give.card.progress')} tone={campaign.status === 'failed' ? 'danger' : campaign.status === 'succeeded' ? 'ok' : 'accent'} /> : null}
    </div>
  );
}

export function CampaignCard({ campaign }: { readonly campaign: Campaign }) {
  const { t } = useI18n();
  return (
    <Link to={`/give/${campaign.id}`} className={styles.cardLink}>
      <div className={local.cardTags}>
        <Badge tone="neutral" dot={false}>{t(`give.kind.${campaign.kind}`)}</Badge>
        {campaign.kind === 'goal' ? <Badge tone={campaignTone[campaign.status]}>{t(`give.status.${campaign.status}`)}</Badge> : null}
        {campaign.createdByMe ? <Badge tone="accent" dot={false}>{t('give.card.mine')}</Badge> : null}
      </div>
      <div className={styles.stackSm}>
        <span className={local.cardTitle}>{campaign.title}</span>
        <span className={local.cardStory}>{campaign.story}</span>
      </div>
      <CampaignProgress campaign={campaign} />
      <div className={local.cardFoot}>
        <span className={styles.rowSub}>{t('give.card.donations', { n: campaign.donationCount })}</span>
        {campaign.deadline !== null && campaign.status === 'active' ? <Countdown target={campaign.deadline} label={t('give.card.endsIn')} /> : null}
      </div>
    </Link>
  );
}
