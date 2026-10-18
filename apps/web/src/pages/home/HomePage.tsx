import { useState } from 'react';
import { Link } from 'react-router';
import { BalanceCard } from '../../components/BalanceCard/BalanceCard';
import { Button, ButtonLink } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import { Countdown } from '../../components/Countdown/Countdown';
import { Coin } from '../../components/Coin/Coin';
import { Icon, type IconName } from '../../components/Icon/Icon';
import { SectionHead } from '../../components/SectionHead/SectionHead';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import { useDataSource, useResource, type Resource } from '../../data/DataProvider';
import type { DataSource } from '../../data/DataSource';
import type { ModuleId } from '../../data/types';
import { LazyMiniHero } from '../../heroes/lazy';
import { useAction } from '../../hooks/useAction';
import { useI18n } from '../../i18n/I18nProvider';
import type { MessageKey } from '../../i18n/types';
import { usePreferences } from '../../lib/preferences';
import { ActivityList } from '../shared/ActivityList';
import { Loaded } from '../shared/Loaded';
import styles from '../page.module.css';
import home from './HomePage.module.css';
import { PrivacyPanel } from './PrivacyPanel';

interface ModuleCard {
  readonly module: Exclude<ModuleId, 'vault'>;
  readonly to: string;
  readonly icon: IconName;
  readonly title: MessageKey;
  readonly body: MessageKey;
}

const MODULES: readonly ModuleCard[] = [
  { module: 'send', to: '/send', icon: 'send', title: 'home.modules.send.title', body: 'home.modules.send.body' },
  { module: 'launch', to: '/launch', icon: 'launch', title: 'home.modules.launch.title', body: 'home.modules.launch.body' },
  { module: 'book', to: '/book', icon: 'book', title: 'home.modules.book.title', body: 'home.modules.book.body' },
  { module: 'give', to: '/give', icon: 'give', title: 'home.modules.give.title', body: 'home.modules.give.body' },
];

async function loadStats(ds: DataSource) {
  const [incoming, sales, epoch, campaigns] = await Promise.all([ds.listIncoming(), ds.listSales(), ds.getEpoch('wbnb-usdt'), ds.listCampaigns()]);
  return {
    incoming: incoming.filter((i) => i.status === 'unclaimed').length,
    openSales: sales.filter((s) => s.phase === 'commit').length,
    epoch,
    activeCampaigns: campaigns.filter((c) => c.status === 'active').length,
  };
}

type Stats = Awaited<ReturnType<typeof loadStats>>;

function ModuleStat({ module, stats }: { readonly module: ModuleCard['module']; readonly stats: Resource<Stats> }) {
  const { t } = useI18n();
  if (!stats.data) return <Skeleton width="60%" />;
  const s = stats.data;
  if (module === 'send') return <span>{t('home.modules.send.stat', { n: s.incoming })}</span>;
  if (module === 'launch') return <span>{t('home.modules.launch.stat', { n: s.openSales })}</span>;
  if (module === 'give') return <span>{t('home.modules.give.stat', { n: s.activeCampaigns })}</span>;
  return (
    <span className={home.inline}>
      {t(s.epoch.phase === 'commit' ? 'home.modules.book.statCommit' : 'home.modules.book.statReveal')}{' '}
      <Countdown target={s.epoch.phase === 'commit' ? s.epoch.commitEndsAt : s.epoch.revealEndsAt} onElapsed={stats.reload} />
    </span>
  );
}

/** Module card whose mechanism preview plays while hovered or focused (in view on touch screens). */
function ModuleLink({ card, stats }: { readonly card: ModuleCard; readonly stats: Resource<Stats> }) {
  const { t } = useI18n();
  const [active, setActive] = useState(false);
  return (
    <Link
      to={card.to}
      className={[styles.cardLink, home.moduleCard].join(' ')}
      onPointerEnter={() => setActive(true)}
      onPointerLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
    >
      <LazyMiniHero id={card.module} active={active} />
      <span className={home.cardHead}>
        <Coin icon={card.icon} tone={card.module} size="sm" />
        <span className={home.cardTitle}>{t(card.title)}</span>
        <Icon name="chevronRight" size={16} className={home.chevron} />
      </span>
      <span className={home.cardBody}>{t(card.body)}</span>
      <span className={home.cardStat}>
        <ModuleStat module={card.module} stats={stats} />
      </span>
    </Link>
  );
}

export function HomePage() {
  const { t } = useI18n();
  const ds = useDataSource();
  const connect = useAction(() => ds.connectWallet());
  const { preferences, update } = usePreferences();
  const account = useResource((source) => source.getAccount(), ['account']);
  const balances = useResource((source) => source.getBalances(), ['balances']);
  const activity = useResource((source) => source.listActivity(6), ['activity']);
  const stats = useResource(loadStats, ['send', 'sales', 'campaigns', 'orders']);
  const needsWalletConnection = account.data?.publicAddress === null && balances.data === undefined;
  const connectWallet = (): void => { if (!connect.busy) void connect.run(); };

  return (
    <div className={styles.stack}>
      <PageHeader
        kicker={account.data?.hushId ? <span className="handle">@{account.data.hushId}</span> : null}
        title={t('home.title')}
        subtitle={t('home.subtitle')}
        actions={
          <>
            {needsWalletConnection ? <Button variant="secondary" icon="wallet" loading={connect.busy} onClick={connectWallet}>{t('balance.connect')}</Button> : null}
            <ButtonLink to="/vault" icon="arrowDown">
              {t('home.deposit')}
            </ButtonLink>
            <ButtonLink to="/send" variant="secondary" icon="send">
              {t('home.send')}
            </ButtonLink>
          </>
        }
      />

      <div className={home.dash}>
        <Loaded resource={balances} skeleton={<Skeleton height={232} label={t('common.loading')} />}>
          {(data) => (
            <BalanceCard balances={data} hidden={preferences.hideBalances} onToggleHidden={() => update({ hideBalances: !preferences.hideBalances })} onConnect={connectWallet} />
          )}
        </Loaded>
        <PrivacyPanel />
      </div>

      <section aria-labelledby="home-modules">
        <div className={home.sectionGap}>
          <SectionHead id="home-modules" title={t('home.modulesTitle')} action={<span className={home.hint}>{t('home.previewHint')}</span>} />
        </div>
        <div className={home.modules}>
          {MODULES.map((card) => (
            <ModuleLink key={card.module} card={card} stats={stats} />
          ))}
        </div>
      </section>

      <div className={home.lower}>
        <Card
          title={t('home.recent')}
          action={
            <Link to="/vault" className={home.more}>
              {t('home.viewVault')}
            </Link>
          }
        >
          <Loaded resource={activity} skeleton={<Skeleton lines={4} height={40} label={t('common.loading')} />}>
            {(items) => <ActivityList items={items} timeline />}
          </Loaded>
        </Card>
        <Link to="/send?tab=gift" className={[styles.cardLink, home.giftEntry].join(' ')}>
          <LazyMiniHero id="gift" active />
          <span className={home.cardHead}>
            <Coin icon="redPacket" tone="give" size="sm" />
            <span className={home.cardTitle}>{t('home.gift.title')}</span>
            <Icon name="chevronRight" size={16} className={home.chevron} />
          </span>
          <span className={home.cardBody}>{t('home.gift.body')}</span>
        </Link>
      </div>
    </div>
  );
}
