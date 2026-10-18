import { publicAppUrl } from '../../platform/runtime';
import { CopyButton } from '../../components/CopyButton/CopyButton';
import { Coin } from '../../components/Coin/Coin';
import { Figure } from '../../components/Figure/Figure';
import { WaveBand } from '../../illustrations/Guilloche';
import { LogoMark } from '../../components/Logo/Logo';
import { QrCode } from '../../components/QrCode/QrCode';
import type { Asset, GiftMode } from '../../data/types';
import { formatAmount } from '../../data/units';
import { useI18n } from '../../i18n/I18nProvider';
import { useFormat } from '../../lib/useFormat';
import styles from './Gift.module.css';

export interface GiftFaceProps {
  readonly mode: GiftMode;
  readonly asset: Asset;
  readonly amount: bigint;
  readonly message: string;
  readonly packets: number;
  readonly expiresAt: number;
  /** Label above the amount, e.g. "A gift for you" or "Red packet". */
  readonly caption?: string;
}

/** The celebratory face of a gift: module colours as a quiet wash, no gold. */
export function GiftFace({ mode, asset, amount, message, packets, expiresAt, caption }: GiftFaceProps) {
  const { t } = useI18n();
  const f = useFormat();
  return (
    <div className={[styles.face, mode === 'single' ? '' : styles.packetFace].join(' ')}>
      <WaveBand className={styles.faceWave} />
      <div className={styles.faceTop}>
        <span className={styles.faceKicker}>
          <Coin icon="redPacket" size="sm" onPlate />
          {caption ?? t(mode === 'single' ? 'gift.card.single' : 'gift.card.packet')}
        </span>
        <LogoMark size={22} />
      </div>
      <div className={styles.faceAmount}>
        <Figure value={formatAmount(amount)} unit={asset} className={styles.faceFigure} />
      </div>
      {message ? <p className={styles.faceMessage}>{message}</p> : null}
      <div className={styles.faceFoot}>
        {mode !== 'single' ? <span>{t('gift.card.packets', { n: packets })}</span> : <span />}
        <span>{t('gift.card.expires', { date: f.dateTime(expiresAt) })}</span>
      </div>
    </div>
  );
}

export function GiftShare({ links }: { readonly links: readonly string[] }) {
  const { t } = useI18n();
  const absolute = links.map((link) => publicAppUrl(link));
  const [first] = absolute;
  if (!first) return null;
  if (absolute.length === 1) {
    return (
      <div className={styles.share}>
        <QrCode value={first} label={t('gift.share.qr')} size={152} />
        <div className={styles.shareText}>
          <span className={styles.linkText} data-gift-link={first}>
            {first}
          </span>
          <p className={styles.shareHint}>{t('gift.share.hint')}</p>
          <CopyButton value={first} label={t('gift.share.copy')} />
        </div>
      </div>
    );
  }
  return (
    <ol className={styles.linkList}>
      {absolute.map((link, i) => (
        <li key={link} className={styles.linkRow}>
          <span>{t('gift.share.personal', { n: i + 1 })}</span>
          <CopyButton value={link} label={t('gift.share.copyOne')} />
        </li>
      ))}
    </ol>
  );
}
