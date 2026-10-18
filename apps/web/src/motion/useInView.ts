import { useEffect, useState, type RefObject } from 'react';

/** True while the element intersects the viewport (always true where IntersectionObserver is missing). */
export function useInView(ref: RefObject<Element | null>, threshold = 0.15): boolean {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) setInView(entry.isIntersecting);
    }, { threshold });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, threshold]);
  return inView;
}

export type StageLayout = 'wide' | 'tall';

/** Narrow stages switch to a vertical composition instead of shrinking the wide one. */
export const TALL_BELOW = 520;

export function useStageLayout(ref: RefObject<Element | null>): StageLayout {
  const [layout, setLayout] = useState<StageLayout>(() => (typeof window !== 'undefined' && window.innerWidth < TALL_BELOW + 64 ? 'tall' : 'wide'));
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      const width = entries[entries.length - 1]?.contentRect.width ?? 0;
      if (width > 0) setLayout(width < TALL_BELOW ? 'tall' : 'wide');
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return layout;
}
