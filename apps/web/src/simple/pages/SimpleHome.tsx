import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/Button/Button';
import { BalanceCard } from '../../components/BalanceCard/BalanceCard';
import { Coin, type CoinTone } from '../../components/Coin/Coin';
import { Icon, type IconName } from '../../components/Icon/Icon';
import { SectionHead } from '../../components/SectionHead/SectionHead';
import { Spot } from '../../illustrations/Spot';
import { rememberSharedByKey } from '../../motion/shared';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import { useDataSource, useResource } from '../../data/DataProvider';
import { LazyMiniHero } from '../../heroes/lazy';
import { useAction } from '../../hooks/useAction';
import { useI18n } from '../../i18n/I18nProvider';
import type { MessageKey } from '../../i18n/types';
import { usePreferences } from '../../lib/preferences';
import { Loaded } from '../../pages/shared/Loaded';
import { useJobs } from '../jobs/JobsProvider';
import { BackupNudge } from '../parts/BackupNudge';
import { actionShareKey } from '../parts/actions';
import { JobRow } from '../parts/JobRow';
import s from '../simple.module.css';
import page from '../../pages/page.module.css';

interface Tile {
  readonly id: 'send' | 'receive' | 'gift' | 'sale' | 'trade' | 'donate';
  readonly to: string;
  readonly icon: IconName;
  readonly tone: CoinTone;
  readonly preview: 'send' | 'vault' | null;
  readonly title: MessageKey;
  readonly body: MessageKey;
}

export const TILES: readonly Tile[] = [
  { id: 'send', to: '/do/send', icon: 'send', tone: 'send', preview: 'send', title: 'simple.tiles.send.title', body: 'simple.tiles.send.body' },
  { id: 'receive', to: '/do/receive', icon: 'receive', tone: 'vault', preview: 'vault', title: 'simple.tiles.receive.title', body: 'simple.tiles.receive.body' },
  { id: 'gift', to: '/do/gift', icon: 'redPacket', tone: 'give', preview: null, title: 'simple.tiles.gift.title', body: 'simple.tiles.gift.body' },
  { id: 'sale', to: '/do/sale', icon: 'sale', tone: 'launch', preview: null, title: 'simple.tiles.sale.title', body: 'simple.tiles.sale.body' },
  { id: 'trade', to: '/do/trade', icon: 'book', tone: 'book', preview: null, title: 'simpleTrade.title', body: 'simpleTrade.tile' },
  { id: 'donate', to: '/do/donate', icon: 'give', tone: 'give', preview: null, title: 'simple.tiles.donate.title', body: 'simple.tiles.donate.body' },
];

function TileLink({ tile, index }: { readonly tile: Tile; readonly index: number }) {
  const { t } = useI18n();
  const [active, setActive] = useState(false);
  const share = actionShareKey(tile.id);
  return (
    <Link
      to={tile.to}
      className={[s.tile, tile.preview ? s.tileLarge : s.tileSmall].join(' ')}
      style={{ ['--tile' as string]: `var(--mod-${tile.tone})`, ['--i' as string]: index }}
      onPointerEnter={() => setActive(true)}
      onPointerLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
      onClick={(event) => rememberSharedByKey(share, event.currentTarget)}
      data-tile={tile.id}
    >
      <span className={s.tileText}>
        <span className={s.tileHead}>
          <Coin icon={tile.icon} tone={tile.tone} size={tile.preview ? 'lg' : 'md'} share={share} className={s.tileCoin} />
          <span className={s.tileTitle}>{t(tile.title)}</span>
          <Icon name="chevronRight" size={18} className={s.tileArrow} />
        </span>
        <span className={s.tileBody}>{t(tile.body)}</span>
      </span>
      {tile.preview ? (
        <span className={s.tilePreview}>
          <LazyMiniHero id={tile.preview} active={active} />
        </span>
      ) : null}
    </Link>
  );
}

/** Simple-mode home: the vault plate, six actions, and what is running. */
export function SimpleHome() {
  const { t } = useI18n();
  const ds = useDataSource();
  const connect = useAction(() => ds.connectWallet());
  const { preferences, update } = usePreferences();
  const { jobs, ready } = useJobs();
  const account = useResource((source) => source.getAccount(), ['account']);
  const balances = useResource((source) => source.getBalances(), ['balances']);
  const needsWalletConnection = account.data?.publicAddress === null && balances.data === undefined;
  const connectWallet = (): void => { if (!connect.busy) void connect.run(); };
  const active = jobs.filter((j) => j.status !== 'done' && j.status !== 'cancelled');
  const recent = active.length > 0 ? active.slice(0, 3) : jobs.slice(0, 2);
  return (
    <div className={[page.stack, s.home].join(' ')}>
      <PageHeader
        kicker={account.data?.hushId ? <span className={s.handle}>@{account.data.hushId}</span> : null}
        badges={<span className={s.accountTag}>{t('simple.home.account')}</span>}
        title={t('simple.home.title')}
        subtitle={t('simple.home.subtitle')}
        actions={needsWalletConnection ? <Button variant="secondary" icon="wallet" loading={connect.busy} onClick={connectWallet}>{t('balance.connect')}</Button> : null}
      />
      <Loaded resource={balances} skeleton={<Skeleton height={260} label={t('common.loading')} />}>
        {(data) => <BalanceCard balances={data} hidden={preferences.hideBalances} onToggleHidden={() => update({ hideBalances: !preferences.hideBalances })} onConnect={connectWallet} />}
      </Loaded>
      <section className={s.section} aria-labelledby="simple-actions">
        <SectionHead id="simple-actions" title={t('simple.home.actions')} />
        <div className={s.tiles}>
          {TILES.map((tile, index) => (
            <TileLink key={tile.id} tile={tile} index={index} />
          ))}
        </div>
      </section>
      <BackupNudge />
      <section className={s.section} aria-labelledby="simple-progress">
        <SectionHead
          id="simple-progress"
          title={t('simple.home.inProgress')}
          action={
            jobs.length > 0 ? (
              <Link to="/jobs" className={s.link}>
                {t('simple.home.seeAll')}
              </Link>
            ) : null
          }
        />
        {!ready && jobs.length === 0 ? null : recent.length === 0 ? (
          <div className={s.quiet}>
            <Spot name="quiet" />
            <div className={s.quietText}>
              <p className={s.quietTitle}>{t('simple.home.emptyTitle')}</p>
              <p className={s.quietBody}>{t('simple.home.empty')}</p>
            </div>
          </div>
        ) : (
          <ul className={s.jobList}>
            {recent.map((job, index) => (
              <JobRow key={job.id} job={job} index={index} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
