import { useEffect, useState } from 'react';
import styles from './Illo.module.css';

export const ILLO_NAMES = ['attention', 'backup', 'gift', 'give', 'idle', 'passkey', 'receive', 'received', 'recovery', 'sale', 'success', 'vault'] as const;
export type IlloName = (typeof ILLO_NAMES)[number];

// One small chunk per illustration, fetched when first shown, so the art stays out of the main bundle.
const loaders = import.meta.glob<string>('../assets/illo/*.svg', { query: '?raw', import: 'default' });
const cache = new Map<IlloName, string>();

export async function loadIllo(name: IlloName): Promise<string> {
  const hit = cache.get(name);
  if (hit !== undefined) return hit;
  const load = loaders[`../assets/illo/${name}.svg`];
  if (load === undefined) throw new Error(`missing illustration: ${name}`);
  const svg = await load();
  cache.set(name, svg);
  return svg;
}

export interface IlloProps {
  readonly name: IlloName;
  readonly size?: 'md' | 'sm';
  readonly className?: string;
}

/**
 * Line illustrations (DESIGN_SYSTEM §9.6). Inlined so their fills follow the theme through
 * the --illo-* variables; the SVG files are build-time assets of this repo, never user input.
 * The box is sized up front, so loading never shifts the layout.
 */
export function Illo({ name, size = 'md', className }: IlloProps) {
  const [svg, setSvg] = useState(() => cache.get(name));
  useEffect(() => {
    let alive = true;
    setSvg(cache.get(name));
    loadIllo(name).then(
      (value) => alive && setSvg(value),
      () => alive && setSvg(undefined),
    );
    return () => {
      alive = false;
    };
  }, [name]);
  const cls = [styles.illo, size === 'sm' ? styles.sm : '', svg === undefined ? styles.pending : '', className].filter(Boolean).join(' ');
  return <span className={cls} data-illo={name} aria-hidden="true" dangerouslySetInnerHTML={svg === undefined ? undefined : { __html: svg }} />;
}
