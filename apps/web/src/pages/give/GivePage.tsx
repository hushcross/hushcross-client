import { useState } from 'react';
import { ButtonLink } from '../../components/Button/Button';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { LazyGiveHero as GiveHero } from '../../heroes/lazy';
import { Segmented } from '../../components/Segmented/Segmented';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import { useResource } from '../../data/DataProvider';
import type { Campaign } from '../../data/types';
import { useI18n } from '../../i18n/I18nProvider';
import { Loaded } from '../shared/Loaded';
import styles from '../page.module.css';
import { CampaignCard } from './CampaignCard';

type Filter = 'active' | 'ended' | 'mine';

const inFilter = (c: Campaign, filter: Filter): boolean => (filter === 'mine' ? c.createdByMe : filter === 'active' ? c.status === 'active' : c.status !== 'active');

export function GivePage() {
  const { t } = useI18n();
  const [filter, setFilter] = useState<Filter>('active');
  const campaigns = useResource((ds) => ds.listCampaigns(), ['campaigns']);
  return (
    <div className={styles.stack}>
      <PageHeader title={t('give.title')} subtitle={t('give.subtitle')} actions={<ButtonLink to="/give/new" icon="plus">{t('give.createCta')}</ButtonLink>} />
      <GiveHero />
      <Segmented
        legend={t('give.filterLabel')}
        hideLegend
        size="sm"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'active', label: t('give.filters.active') },
          { value: 'ended', label: t('give.filters.ended') },
          { value: 'mine', label: t('give.filters.mine') },
        ]}
      />
      <Loaded resource={campaigns} skeleton={<div className={styles.grid3}>{[0, 1, 2].map((i) => <Skeleton key={i} height={240} />)}</div>}>
        {(items) => {
          const visible = items.filter((c) => inFilter(c, filter));
          if (visible.length === 0) return <EmptyState icon="give" illo="give" title={t('give.emptyTitle')} body={t('give.emptyBody')} />;
          return (
            <div className={styles.grid3}>
              {visible.map((c) => (
                <CampaignCard key={c.id} campaign={c} />
              ))}
            </div>
          );
        }}
      </Loaded>
      <p className={styles.note}>{t('give.footnote')}</p>
    </div>
  );
}
