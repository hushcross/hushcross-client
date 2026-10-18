import { useSearchParams } from 'react-router';
import { Card } from '../../components/Card/Card';
import { RollingNumber } from '../../components/RollingNumber/RollingNumber';
import { LazyVaultHero as VaultHero } from '../../heroes/lazy';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import { Tabs } from '../../components/Tabs/Tabs';
import { useResource } from '../../data/DataProvider';
import { ASSETS } from '../../data/types';
import { formatAmount } from '../../data/units';
import { useI18n } from '../../i18n/I18nProvider';
import { Loaded } from '../shared/Loaded';
import styles from '../page.module.css';
import { BackupPanel } from './BackupPanel';
import { DepositPanel } from './DepositPanel';
import { NotesPanel } from './NotesPanel';
import { RecoveryPanel } from './RecoveryPanel';

type VaultTab = 'deposit' | 'notes' | 'recovery' | 'backup';
const TABS: readonly VaultTab[] = ['deposit', 'notes', 'recovery', 'backup'];

export function VaultPage() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab');
  const tab: VaultTab = TABS.find((x) => x === tabParam) ?? 'deposit';
  const summary = useResource(async (ds) => {
    const [balances, bnb, usdt] = await Promise.all([ds.getBalances(), ds.getPoolStats('BNB'), ds.getPoolStats('USDT')]);
    return { balances, pools: { BNB: bnb, USDT: usdt } };
  }, ['balances', 'notes']);

  return (
    <div className={styles.stack}>
      <PageHeader title={t('vault.title')} subtitle={t('vault.subtitle')} />
      <VaultHero />
      <Card>
        <Loaded resource={summary} skeleton={<Skeleton height={64} />}>
          {({ balances, pools }) => (
            <div className={styles.grid4}>
              {ASSETS.map((asset) => (
                <div key={asset} className={styles.stat}>
                  <span className={styles.statLabel}>{t('vault.summary.balance', { asset })}</span>
                  <span className={styles.serifFigure}><RollingNumber value={formatAmount(balances.vault[asset])} rollIn /></span>
                </div>
              ))}
              {ASSETS.map((asset) => (
                <div key={`pool-${asset}`} className={styles.stat}>
                  <span className={styles.statLabel}>{t('vault.summary.pool', { asset })}</span>
                  <span className={styles.serifFigure}>
                    <RollingNumber value={pools[asset].approvedDeposits.toLocaleString('en-US')} rollIn />
                  </span>
                  <span className={styles.statLabel}>{t('vault.summary.approvedDeposits')}</span>
                </div>
              ))}
            </div>
          )}
        </Loaded>
      </Card>
      <Tabs
        label={t('vault.tabsLabel')}
        value={tab}
        onChange={(next) => setParams(next === 'deposit' ? {} : { tab: next }, { replace: true })}
        items={[
          { id: 'deposit', label: t('vault.tabs.deposit'), content: <DepositPanel /> },
          { id: 'notes', label: t('vault.tabs.notes'), content: <NotesPanel /> },
          { id: 'recovery', label: t('vault.tabs.recovery'), content: <RecoveryPanel /> },
          { id: 'backup', label: t('vault.tabs.backup'), content: <BackupPanel /> },
        ]}
      />
    </div>
  );
}
