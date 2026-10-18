import { useEffect, useState } from 'react';
import { AppRouter } from '../platform/AppRouter';
import { AccountGate } from '../account/AccountGate';
import { AccountProvider } from '../account/AccountProvider';
import { AppProviders, AppRoutes } from '../App';
import type { AppConfig } from '../config';
import { useI18n } from '../i18n/I18nProvider';
import { I18nProvider } from '../i18n/I18nProvider';
import styles from '../pages/page.module.css';
import { ThemeProvider } from '../theme/ThemeProvider';
import { createChainRuntime, type ChainRuntime } from './createChainSource';
import { NetworkBanner, WalletPicker } from './WalletPicker';

function Status({ error }: { readonly error: boolean }) {
  const { t } = useI18n();
  return (
    <div className={styles.stack} style={{ maxWidth: 560, margin: '48px auto', padding: '0 16px' }}>
      <p className={error ? styles.calloutDanger : styles.note} role={error ? 'alert' : 'status'}>
        {t(error ? 'account.configError' : 'account.loading')}
      </p>
    </div>
  );
}

/** VITE_DATA_SOURCE=chain: load deployments, then run the app on the real data source. */
export function ChainApp({ config }: { readonly config: AppConfig }) {
  const [runtime, setRuntime] = useState<ChainRuntime | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    let liveRuntime: ChainRuntime | null = null;
    setRuntime(null);
    setFailed(false);
    createChainRuntime(config)
      .then((r) => {
        if (!live) { r.dispose(); return; }
        liveRuntime = r;
        setRuntime(r);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
      liveRuntime?.dispose();
    };
  }, [config]);

  if (!runtime) {
    return (
      <ThemeProvider>
        <I18nProvider>
          <Status error={failed} />
        </I18nProvider>
      </ThemeProvider>
    );
  }
  return (
    <AppProviders source={runtime.source} jobStore={runtime.jobStore} subscribeJobStore={runtime.subscribeJobStore}>
      <AccountProvider manager={runtime.manager} idleMinutes={config.idleLockMinutes}>
        <WalletPicker controller={runtime.wallet} />
        <NetworkBanner controller={runtime.wallet} />
        <AppRouter>
          <AccountGate>
            <AppRoutes />
          </AccountGate>
        </AppRouter>
      </AccountProvider>
    </AppProviders>
  );
}
