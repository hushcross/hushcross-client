import { useState, type ReactNode } from 'react';
import { AddressDisplay } from '../../components/AddressDisplay/AddressDisplay';
import { Badge, ModuleChip } from '../../components/Badge/Badge';
import { BalanceCard } from '../../components/BalanceCard/BalanceCard';
import { Button } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import { Coin } from '../../components/Coin/Coin';
import { Countdown } from '../../components/Countdown/Countdown';
import { PublicActionDialog } from '../../components/Dialog/PublicActionDialog';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { Figure } from '../../components/Figure/Figure';
import { Icon, ICON_NAMES } from '../../components/Icon/Icon';
import { Input } from '../../components/Input/Input';
import { LogoMark } from '../../components/Logo/Logo';
import { PhaseBar } from '../../components/PhaseBar/PhaseBar';
import { PrivacyMeter } from '../../components/PrivacyMeter/PrivacyMeter';
import { Progress } from '../../components/Progress/Progress';
import { Segmented } from '../../components/Segmented/Segmented';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import { StepFlow } from '../../components/StepFlow/StepFlow';
import { Switch } from '../../components/Switch/Switch';
import { Tabs } from '../../components/Tabs/Tabs';
import { useToast } from '../../components/Toast/Toast';
import { UnitPicker } from '../../components/UnitPicker/UnitPicker';
import { unitOptions, WAD } from '../../data/units';
import { useI18n } from '../../i18n/I18nProvider';
import styles from './DevUi.module.css';

const SAMPLE_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';
const balances = {
  vault: { BNB: 2_720_000_000_000_000_000n, USDT: 2900n * WAD },
  vaultPending: { BNB: WAD / 2n, USDT: 0n },
  publicWallet: { BNB: 3_481_200_000_000_000_000n, USDT: 1250n * WAD },
};

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      <div className={styles.sectionBody}>{children}</div>
    </section>
  );
}

function Gallery({ theme }: { readonly theme: 'light' | 'dark' }) {
  const { t } = useI18n();
  const { show } = useToast();
  const [unit, setUnit] = useState<bigint | null>(WAD / 10n);
  const [asset, setAsset] = useState<'BNB' | 'USDT'>('BNB');
  const [tab, setTab] = useState<'one' | 'two'>('one');
  const [on, setOn] = useState(true);
  const [dialog, setDialog] = useState(false);
  const soon = Date.now() + 47 * 60_000;

  return (
    <div data-theme={theme} className={styles.gallery}>
      <h2 className={styles.galleryTitle}>{theme === 'light' ? t('dev.paper') : t('dev.ink')}</h2>
      <Section title={t('dev.typography')}>
        <p className={styles.display}>{t('dev.sampleHeadline')}</p>
        <p className={styles.h2}>{t('dev.sampleTitle')}</p>
        <p>{t('dev.sampleBody')}</p>
        <p className={styles.small}>{t('dev.sampleSmall')}</p>
        <p className="mono">0.1003 BNB · 12,345.67 USDT</p>
      </Section>
      <Section title={t('dev.colors')}>
        <div className={styles.swatches}>
          {['bg', 'surface', 'surface-2', 'line', 'text', 'muted', 'accent', 'ok', 'warn', 'danger'].map((token) => (
            <span key={token} className={styles.swatch}>
              <span className={styles.chip} style={{ background: `var(--${token})` }} />
              <span className="mono">--{token}</span>
            </span>
          ))}
        </div>
        <div className={styles.row}>
          <ModuleChip module="vault">{t('nav.vault')}</ModuleChip>
          <ModuleChip module="send">{t('nav.send')}</ModuleChip>
          <ModuleChip module="launch">{t('nav.launch')}</ModuleChip>
          <ModuleChip module="book">{t('nav.book')}</ModuleChip>
          <ModuleChip module="give">{t('nav.give')}</ModuleChip>
        </div>
      </Section>
      <Section title={t('dev.icons')}>
        <div className={styles.iconGrid}>
          {ICON_NAMES.map((name) => (
            <span key={name} className={styles.iconCell}>
              <Icon name={name} />
              <span className="mono">{name}</span>
            </span>
          ))}
        </div>
        <div className={styles.row}>
          {(['vault', 'send', 'launch', 'book', 'give', 'accent', 'neutral'] as const).map((tone, i) => (
            <Coin key={tone} tone={tone} icon={(['vault', 'send', 'sale', 'book', 'give', 'mix', 'shield'] as const)[i] ?? 'vault'} />
          ))}
        </div>
        <Figure value="12,480.25" unit="USDT" className={styles.display} />
      </Section>
      <Section title={t('dev.logo')}>
        <div className={styles.row}>
          <LogoMark size={48} title="HushCross" />
          <LogoMark size={28} />
          <span className={styles.wordmark}>HushCross</span>
        </div>
      </Section>
      <Section title={t('dev.buttons')}>
        <div className={styles.row}>
          <Button>{t('dev.primary')}</Button>
          <Button variant="secondary">{t('dev.secondary')}</Button>
          <Button variant="ghost">{t('dev.ghost')}</Button>
          <Button variant="danger">{t('dev.danger')}</Button>
          <Button loading>{t('dev.loading')}</Button>
          <Button disabled>{t('dev.disabled')}</Button>
        </div>
      </Section>
      <Section title={t('dev.inputs')}>
        <Input label={t('send.form.recipient')} placeholder={t('send.form.recipientPlaceholder')} hint={t('send.form.recipientHint')} mono />
        <Input label={t('book.form.limit')} defaultValue="0.0x" error={t('launch.bid.spendError')} suffix="USDT" />
        <Segmented legend={t('common.asset')} value={asset} onChange={setAsset} options={[{ value: 'BNB', label: 'BNB' }, { value: 'USDT', label: 'USDT' }]} />
        <Switch checked={on} onChange={setOn} label={t('send.form.gasDrop')} description={t('send.form.gasDropHint', { amount: '0.0004' })} />
      </Section>
      <Section title={t('dev.unitPicker')}>
        <UnitPicker asset={asset} options={unitOptions(asset, 30)} value={unit} onChange={setUnit} feeBps={30} />
      </Section>
      <Section title={t('dev.balance')}>
        <BalanceCard balances={balances} onToggleHidden={() => undefined} />
      </Section>
      <Section title={t('dev.privacy')}>
        <PrivacyMeter mixedWith={412} />
        <PrivacyMeter mixedWith={0} pending />
        <Progress value={7340n} max={12000n} label={t('give.card.progress')} />
      </Section>
      <Section title={t('dev.steps')}>
        <StepFlow label={t('vault.deposit.stepsLabel')} current={2} steps={[t('vault.deposit.steps.choose'), t('vault.deposit.steps.confirm'), t('vault.deposit.steps.review'), t('vault.deposit.steps.mixed')]} />
        <PhaseBar
          label={t('launch.phase.label')}
          current="reveal"
          endsInLabel={t('launch.phase.endsIn')}
          phases={[
            { id: 'commit', label: t('launch.phase.commit') },
            { id: 'reveal', label: t('launch.phase.reveal'), endsAt: soon },
            { id: 'settle', label: t('launch.phase.settle') },
            { id: 'claim', label: t('launch.phase.claim') },
          ]}
        />
        <Countdown target={soon} label={t('book.epoch.endsIn')} size="lg" />
      </Section>
      <Section title={t('dev.badges')}>
        <div className={styles.row}>
          <Badge>{t('notes.status.spent')}</Badge>
          <Badge tone="accent">{t('launch.bidStatus.sealed')}</Badge>
          <Badge tone="ok">{t('notes.status.approved')}</Badge>
          <Badge tone="warn">{t('notes.status.in_review')}</Badge>
          <Badge tone="danger">{t('notes.status.declined')}</Badge>
        </div>
      </Section>
      <Section title={t('dev.address')}>
        <AddressDisplay value={SAMPLE_ADDRESS} />
        <AddressDisplay value={`0x${'ab'.repeat(32)}`} kind="tx" />
      </Section>
      <Section title={t('dev.tabs')}>
        <Tabs label={t('dev.tabs')} value={tab} onChange={setTab} items={[{ id: 'one', label: t('vault.tabs.deposit'), content: <p className={styles.small}>{t('vault.deposit.how1')}</p> }, { id: 'two', label: t('vault.tabs.notes'), content: <p className={styles.small}>{t('notes.emptyBody')}</p> }]} />
      </Section>
      <Section title={t('dev.feedback')}>
        <div className={styles.row}>
          <Button variant="secondary" size="sm" onClick={() => show({ tone: 'ok', title: t('vault.deposit.sent'), body: t('vault.deposit.sentBody') })}>
            {t('dev.toast')}
          </Button>
          <Button variant="danger" size="sm" onClick={() => setDialog(true)}>
            {t('dev.dialog')}
          </Button>
        </div>
        <Card tone="subtle" padding="none">
          <EmptyState icon="vault" illo="vault" title={t('notes.emptyTitle')} body={t('notes.emptyBody')} />
        </Card>
        <Skeleton lines={3} />
      </Section>
      <PublicActionDialog open={dialog} title={t('notes.exitTitle')} description={t('notes.exitBody', { amount: '0.1', asset: 'BNB' })} reveals={[t('notes.exitReveal1'), t('notes.exitReveal2')]} confirmLabel={t('notes.exitConfirm')} onClose={() => setDialog(false)} onConfirm={() => setDialog(false)} />
    </div>
  );
}

export function DevUiPage() {
  const { t } = useI18n();
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.display}>{t('dev.title')}</h1>
        <p className={styles.small}>{t('dev.subtitle')}</p>
      </header>
      <div className={styles.columns}>
        <Gallery theme="light" />
        <Gallery theme="dark" />
      </div>
    </div>
  );
}
