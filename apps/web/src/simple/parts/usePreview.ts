import { useEffect, useRef, useState } from 'react';

export type Preview<T> = { readonly status: 'idle' } | { readonly status: 'loading'; readonly last: T | null } | { readonly status: 'ready'; readonly value: T } | { readonly status: 'error'; readonly error: unknown };

/** Debounced async derivation keyed by `key`; keeps the last value visible while recomputing. */
export function usePreview<T>(key: string | null, compute: () => Promise<T>, delayMs = 250): Preview<T> {
  const [state, setState] = useState<Preview<T>>({ status: 'idle' });
  const computeRef = useRef(compute);
  computeRef.current = compute;
  useEffect(() => {
    if (key === null) {
      setState({ status: 'idle' });
      return undefined;
    }
    let live = true;
    setState((prev) => ({ status: 'loading', last: prev.status === 'ready' ? prev.value : prev.status === 'loading' ? prev.last : null }));
    const timer = setTimeout(() => {
      computeRef
        .current()
        .then((value) => {
          if (live) setState({ status: 'ready', value });
        })
        .catch((error: unknown) => {
          if (live) setState({ status: 'error', error });
        });
    }, delayMs);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [key, delayMs]);
  return state;
}

export function previewValue<T>(p: Preview<T>): T | null {
  return p.status === 'ready' ? p.value : p.status === 'loading' ? p.last : null;
}
