import { useEffect, useRef, useState } from 'react';
import { Dialog } from '../../components/Dialog/Dialog';
import { useI18n } from '../../i18n/I18nProvider';
import s from '../simple.module.css';

interface DetectorLike {
  detect(source: HTMLVideoElement): Promise<readonly { readonly rawValue: string }[]>;
}
type DetectorCtor = new (options: { readonly formats: readonly string[] }) => DetectorLike;

function detectorCtor(): DetectorCtor | null {
  const ctor = (globalThis as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  return typeof ctor === 'function' && typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia ? ctor : null;
}

/** Camera QR scanning where the browser offers BarcodeDetector; nothing is uploaded. */
export const qrScanSupported = (): boolean => detectorCtor() !== null;

export function QrScanner({ open, onClose, onResult }: { readonly open: boolean; readonly onClose: () => void; readonly onResult: (text: string) => void }) {
  const { t } = useI18n();
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const resultRef = useRef(onResult);
  resultRef.current = onResult;

  useEffect(() => {
    if (!open) return undefined;
    const Ctor = detectorCtor();
    if (!Ctor) {
      setError(t('simple.recipient.scanUnsupported'));
      return undefined;
    }
    let stream: MediaStream | null = null;
    let timer = 0;
    let live = true;
    const detector = new Ctor({ formats: ['qr_code'] });
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(async (s) => {
        stream = s;
        if (!live || !video.current) return;
        video.current.srcObject = s;
        await video.current.play().catch(() => undefined);
        const scan = async (): Promise<void> => {
          if (!live || !video.current) return;
          const codes = await detector.detect(video.current).catch(() => []);
          const first = codes[0]?.rawValue;
          if (first) {
            resultRef.current(first);
            return;
          }
          timer = window.setTimeout(() => void scan(), 250);
        };
        void scan();
      })
      .catch(() => setError(t('simple.recipient.scanDenied')));
    return () => {
      live = false;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [open, t]);

  return (
    <Dialog open={open} title={t('simple.recipient.scanTitle')} onClose={onClose}>
      {error ? <p className={s.hintWarn}>{error}</p> : <video ref={video} className={s.qrVideo} muted playsInline aria-label={t('simple.recipient.scanTitle')} />}
    </Dialog>
  );
}
