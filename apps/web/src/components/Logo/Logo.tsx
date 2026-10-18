import markSource from '../../assets/brand/hushcross-mark.png';
import styles from './Logo.module.css';

/** Vite emits the original image-model asset with a content-hashed URL. */
export const HUSHCROSS_MARK_URL = markSource;

/** The original PNG alpha supplies the shape; currentColor supplies the theme color. */
export function LogoMark({ size = 28, title }: { readonly size?: number; readonly title?: string }) {
  return (
    <span
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      data-hushcross-mark=""
      className={styles.mark}
      style={{ width: size, height: size, maskImage: `url("${markSource}")`, WebkitMaskImage: `url("${markSource}")` }}
    />
  );
}

export function Logo({ compact = false }: { readonly compact?: boolean }) {
  return (
    <span className={styles.logo}>
      <LogoMark size={compact ? 26 : 28} />
      {compact ? null : <span className={styles.word}>HushCross</span>}
    </span>
  );
}
