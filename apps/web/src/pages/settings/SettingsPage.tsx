import { InstallEntry } from '../../pwa/InstallEntry';
import { AddressDisplay } from '../../components/AddressDisplay/AddressDisplay';
import { Badge } from '../../components/Badge/Badge';
import { Button, ButtonLink } from '../../components/Button/Button';
import { SocialLinks } from '../../components/SocialLinks/SocialLinks';
import { Input } from '../../components/Input/Input';
import { DEFAULT_THRESHOLDS, type PrivacyThresholds } from '../../data/privacyCheck';
import { Card } from '../../components/Card/Card';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { Segmented } from '../../components/Segmented/Segmented';
import { Switch } from '../../components/Switch/Switch';
import { useResource } from '../../data/DataProvider';
import type { Funding } from '../../data/types';
import { useI18n } from '../../i18n/I18nProvider';
import type { Locale } from '../../i18n/types';
import { loadThresholds, usePreferences } from '../../lib/preferences';
import { useTheme, type ThemePreference } from '../../theme/ThemeProvider';
import { Loaded } from '../shared/Loaded';
import { AccountSettingsCard } from '../../account/AccountSettingsCard';
import { appConfig } from '../../config';
import styles from '../page.module.css';
import local from './Settings.module.css';
import { LICENSES } from './licenses';
import { useUiMode, type UiMode } from '../../simple/mode';

export const APP_VERSION = '0.1.0';

export function SettingsPage() {
  const { t, locale, setLocale } = useI18n();
  const { preference, setPreference } = useTheme();
  const { preferences, update } = usePreferences();
  const account = useResource((ds) => ds.getAccount(), ['account']);
  const { mode, setMode } = useUiMode();

  return (
    <div className={styles.stack}>
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />
      <Card title={t('simple.mode.title')}>
        <div className={styles.form}>
          <Segmented<UiMode>
            legend={t('simple.mode.legend')}
            value={mode}
            onChange={setMode}
            options={[
              { value: 'simple', label: t('simple.mode.simple') },
              { value: 'pro', label: t('simple.mode.pro') },
            ]}
            caption={mode === 'simple' ? t('simple.mode.simpleHint') : t('simple.mode.proHint')}
          />
        </div>
      </Card>
      <div className={styles.grid2}>
        <InstallEntry />
        <Card title={t('settings.appearance')}>
          <div className={styles.form}>
            <Segmented<Locale> legend={t('settings.language')} value={locale} onChange={setLocale} options={[{ value: 'en', label: t('settings.languages.en') }, { value: 'zh', label: t('settings.languages.zh') }]} />
            <Segmented<ThemePreference>
              legend={t('settings.theme')}
              value={preference}
              onChange={setPreference}
              options={[
                { value: 'system', label: t('settings.themes.system') },
                { value: 'light', label: t('settings.themes.light') },
                { value: 'dark', label: t('settings.themes.dark') },
              ]}
            />
          </div>
        </Card>
        <Card title={t('settings.privacy')}>
          <div className={styles.form}>
            <div className={styles.stackSm}>
              <label htmlFor="default-delay" className={local.rangeLabel}>
                <span>{t('settings.delay')}</span>
                <span className={styles.mono}>{preferences.relayDelayMinutes === 0 ? t('send.form.delayNone') : t('send.form.delayValue', { n: preferences.relayDelayMinutes })}</span>
              </label>
              <input id="default-delay" type="range" min={0} max={30} value={preferences.relayDelayMinutes} onChange={(e) => update({ relayDelayMinutes: Number(e.target.value) })} className={local.range} aria-describedby="default-delay-hint" />
              <p id="default-delay-hint" className={styles.note}>{t('settings.delayHint')}</p>
            </div>
            <Switch checked={preferences.gasDrop} onChange={(v) => update({ gasDrop: v })} label={t('settings.gasDrop')} description={t('settings.gasDropHint')} />
            <Switch checked={preferences.hideBalances} onChange={(v) => update({ hideBalances: v })} label={t('settings.hideBalances')} description={t('settings.hideBalancesHint')} />
            <Segmented<Funding> legend={t('settings.funding')} value={preferences.defaultFunding} onChange={(v) => update({ defaultFunding: v })} options={[{ value: 'vault', label: t('common.funding.vault') }, { value: 'public', label: t('common.funding.public') }]} caption={t('settings.fundingHint')} />
          </div>
        </Card>
        <Card title={t('settings.check.title')}>
          <div className={styles.form}>
            <p className={styles.note}>{t('settings.check.body')}</p>
            <div className={styles.formRow}>
              {(
                [
                  ['anonymityWeak', 'settings.check.anonymityWeak'],
                  ['anonymityFair', 'settings.check.anonymityFair'],
                  ['ageWeakMinutes', 'settings.check.ageWeak'],
                  ['ageFairHours', 'settings.check.ageFair'],
                  ['repeatRecipient', 'settings.check.repeat'],
                ] as const
              ).map(([field, label]) => (
                <Input
                  key={field}
                  label={t(label)}
                  type="number"
                  min={0}
                  value={preferences.privacy[field]}
                  onChange={(e) => update({ privacy: loadThresholds({ ...preferences.privacy, [field]: Number(e.target.value) } satisfies Record<keyof PrivacyThresholds, number>) })}
                />
              ))}
            </div>
            <Button variant="ghost" size="sm" icon="refresh" onClick={() => update({ privacy: DEFAULT_THRESHOLDS })}>
              {t('settings.check.reset')}
            </Button>
          </div>
        </Card>
        <Card title={t('settings.account')}>
          <Loaded resource={account}>
            {(a) => (
              <dl className={styles.kv}>
                <dt>{t('settings.hushId')}</dt>
                <dd className={styles.mono}>{a.hushId ? `@${a.hushId}` : t('receive.noName')}</dd>
                <dt>{t('settings.wallet')}</dt>
                <dd>{a.publicAddress ? <AddressDisplay value={a.publicAddress} /> : t('balance.notConnected')}</dd>
                <dt>{t('receive.meta')}</dt>
                <dd><AddressDisplay value={a.metaAddress} kind="none" /></dd>
              </dl>
            )}
          </Loaded>
        </Card>
        <AccountSettingsCard />
        <Card title={t('settings.about')}>
          <dl className={styles.kv}>
            <dt>{t('settings.version')}</dt>
            <dd className={styles.mono}>{APP_VERSION}</dd>
            <dt>{t('settings.network')}</dt>
            <dd>{t('settings.networkValue')}</dd>
            <dt>{t('settings.dataSource')}</dt>
            <dd>{appConfig.dataSource === 'chain' ? <Badge tone="ok">{t('settings.dataLive')}</Badge> : <Badge tone="warn">{t('settings.dataDemo')}</Badge>}</dd>
          </dl>
          <p className={[styles.note, styles.spaced].join(' ')}>{t(appConfig.dataSource === 'chain' ? 'privacyNotice.liveBuild' : 'settings.aboutBody')}</p>
          <div className={[styles.actions, local.aboutLinks].join(' ')}>
            <ButtonLink to="/about" variant="secondary" size="sm" iconEnd="chevronRight">
              {t('about.link')}
            </ButtonLink>
            <ButtonLink to="/privacy" variant="secondary" size="sm" iconEnd="chevronRight">
              {t('privacyNotice.link')}
            </ButtonLink>
            <ButtonLink to="/docs" variant="secondary" size="sm" icon="docs">
              {t('nav.docs')}
            </ButtonLink>
          </div>
          <ButtonLink to="/app" variant="ghost" size="sm" icon="download">{t('pwa.settingsLink')}</ButtonLink>
          <SocialLinks className={local.social} />
        </Card>
      </div>
      <Card title={t('settings.licenses')}>
        <p className={styles.note}>{t('settings.licensesBody')}</p>
        <p className={styles.note}>{t('privacyNotice.licenseScope')}</p>
        <ul className={[styles.list, local.licenses].join(' ')}>
          {LICENSES.map((entry) => (
            <li key={entry.name} className={styles.row}>
              <div className={styles.rowMain}>
                <a href={entry.url} target={entry.url.startsWith('http') ? '_blank' : undefined} rel="noreferrer noopener" className={local.licenseName}>
                  {entry.name}
                </a>
                <span className={styles.rowSub}>{entry.version}</span>
              </div>
              <Badge tone="neutral" dot={false}>{entry.license}</Badge>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
