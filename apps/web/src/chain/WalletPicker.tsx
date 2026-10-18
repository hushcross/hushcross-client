import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '../components/Button/Button';
import { Dialog } from '../components/Dialog/Dialog';
import { QrCode } from '../components/QrCode/QrCode';
import { useI18n } from '../i18n/I18nProvider';
import styles from '../pages/page.module.css';
import type { WalletController, WalletProviderDetail } from './wallet';
import { walletConnectTrustWalletLink } from './walletConnect';
import local from './WalletPicker.module.css';

/** Local wallet chooser and QR dialog. No hosted modal, remote wallet icons, or automatic redirects. */
export function WalletPicker({ controller }: { readonly controller: WalletController }) {
  const { t } = useI18n();
  const [options, setOptions] = useState<readonly WalletProviderDetail[] | null>(null);
  const resolver = useRef<((choice: WalletProviderDetail | null) => void) | null>(null);
  const state = useSyncExternalStore((listener) => controller.subscribe(listener), () => controller.getState());
  const pairing = state.walletConnect;
  const pairingCancelling = pairing?.phase === 'cancelling';
  // Dismiss the modal on cancellation; the controller retains its transport cleanup gate.
  const pairingOpen = pairing?.phase === 'connecting' || pairing?.phase === 'pairing';
  const walletLink = pairing?.uri ? walletConnectTrustWalletLink(pairing.uri) : null;

  useEffect(() => {
    controller.setChooser((wallets) => new Promise((resolve) => {
      resolver.current?.(null);
      resolver.current = resolve;
      setOptions(wallets);
    }));
    return () => {
      resolver.current?.(null);
      resolver.current = null;
      controller.setChooser(null);
      controller.cancelConnection();
    };
  }, [controller]);

  const close = (choice: WalletProviderDetail | null): void => {
    resolver.current?.(choice);
    resolver.current = null;
    setOptions(null);
  };

  return (
    <>
      <Dialog open={options !== null} title={t('wallet.pickTitle')} onClose={() => close(null)}>
        <div className={styles.stackSm}>
          <p className={styles.note}>{options && options.length > 0 ? t('wallet.pickBody') : t('wallet.none')}</p>
          <ul className={local.list}>
            {(options ?? []).map((w) => (
              <li key={w.info.uuid}>
                <button type="button" className={local.option} disabled={pairingCancelling && w.info.uuid === 'hushcross:walletconnect'} onClick={() => close(w)}>
                  {w.info.icon.startsWith('data:image/') ? <img src={w.info.icon} alt="" width={28} height={28} /> : null}
                  <span>{w.info.name}</span>
                </button>
              </li>
            ))}
          </ul>
          {pairingCancelling ? <p className={styles.note} role="status">{t('wallet.cancelling')}</p> : null}
          {state.walletConnect ? <p className={styles.note}>{t('wallet.connectPrivacy')}</p> : null}
        </div>
      </Dialog>
      <Dialog open={pairingOpen} title={t('wallet.connectTitle')} onClose={() => controller.cancelConnection()} footer={<Button variant="secondary" onClick={() => controller.cancelConnection()} disabled={pairing?.phase === 'cancelling'}>{t('wallet.cancel')}</Button>}>
        <div className={styles.stackSm}>
          <p className={styles.note} role="status">{t(pairing?.phase === 'cancelling' ? 'wallet.cancelling' : pairing?.uri ? 'wallet.scan' : 'wallet.connecting')}</p>
          {pairing?.uri ? <div className={local.qr}><QrCode value={pairing.uri} label={t('wallet.qrLabel')} size={216} /></div> : null}
          {walletLink ? <a className={local.option} href={walletLink} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{t('wallet.openTrust')}</a> : null}
          {walletLink ? <p className={styles.note}>{t('wallet.openWalletNote')}</p> : null}
          <p className={styles.note}>{t('wallet.connectSafety')}</p>
        </div>
      </Dialog>
    </>
  );
}

/** Shown while the connected wallet is on a different chain than the app. */
export function NetworkBanner({ controller }: { readonly controller: WalletController }) {
  const { t } = useI18n();
  const state = useSyncExternalStore((listener) => controller.subscribe(listener), () => controller.getState());
  const [busy, setBusy] = useState(false);
  if (!state.wrongNetwork) return null;
  return (
    <div className={local.banner} role="status">
      <span>{t('wallet.wrongNetwork')}</span>
      <Button size="sm" variant="secondary" loading={busy} onClick={() => {
        setBusy(true);
        void controller.ensureChain().catch(() => undefined).finally(() => setBusy(false));
      }}>{t('wallet.switch')}</Button>
    </div>
  );
}
