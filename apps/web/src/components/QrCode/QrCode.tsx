import { useMemo } from 'react';
import QRCode from 'qrcode';
import styles from './QrCode.module.css';

export interface QrCodeProps {
  readonly value: string;
  readonly label: string;
  readonly size?: number;
}

/** QR rendered as SVG rects from the encoder's module matrix (no innerHTML). */
export function QrCode({ value, label, size = 176 }: QrCodeProps) {
  const path = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
    const n = qr.modules.size;
    let d = '';
    for (let row = 0; row < n; row += 1) {
      for (let col = 0; col < n; col += 1) {
        if (qr.modules.get(row, col)) d += `M${col + 2} ${row + 2}h1v1h-1z`;
      }
    }
    return { d, n: n + 4 };
  }, [value]);
  return (
    <svg className={styles.qr} width={size} height={size} viewBox={`0 0 ${path.n} ${path.n}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={path.n} height={path.n} fill="#ffffff" rx="1.5" />
      <path d={path.d} fill="#15161a" />
    </svg>
  );
}
