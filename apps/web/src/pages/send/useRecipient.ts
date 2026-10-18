import { useEffect, useState } from 'react';
import { useDataSource } from '../../data/DataProvider';
import type { RecipientResolution } from '../../data/types';

export type RecipientState = { readonly status: 'idle' } | { readonly status: 'checking' } | { readonly status: 'done'; readonly resolution: RecipientResolution };

/** Debounced Hush ID / address resolution. */
export function useRecipient(input: string, delayMs = 350): RecipientState {
  const ds = useDataSource();
  const [state, setState] = useState<RecipientState>({ status: 'idle' });
  useEffect(() => {
    const value = input.trim();
    if (value.length < 3) {
      setState({ status: 'idle' });
      return undefined;
    }
    let cancelled = false;
    setState({ status: 'checking' });
    const timer = setTimeout(() => {
      ds.resolveRecipient(value)
        .then((resolution) => {
          if (!cancelled) setState({ status: 'done', resolution });
        })
        .catch(() => {
          if (!cancelled) setState({ status: 'done', resolution: { ok: false, reason: 'format' } });
        });
    }, delayMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ds, input, delayMs]);
  return state;
}
