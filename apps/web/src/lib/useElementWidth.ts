import { useEffect, useState, type RefObject } from 'react';

/** Content width of an element, kept current with ResizeObserver (fallback for tests). */
export function useElementWidth(ref: RefObject<Element | null>, fallback = 640): number {
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      const next = entries[entries.length - 1]?.contentRect.width ?? 0;
      if (next > 0) setWidth(Math.round(next));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}
