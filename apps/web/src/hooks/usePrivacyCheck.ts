import { useEffect, useRef, useState } from 'react';
import { useDataSource } from '../data/DataProvider';
import { assessPrivacy, type PrivacyAssessment } from '../data/privacyCheck';
import type { PrivacyContextRequest } from '../data/types';
import { usePreferences } from '../lib/preferences';

export type PrivacyCheckState = { readonly status: 'idle' } | { readonly status: 'checking' } | { readonly status: 'ready'; readonly assessment: PrivacyAssessment };

/** Fetch chain facts for a pending action and rate them locally with the user's thresholds. */
export function usePrivacyCheck(request: PrivacyContextRequest | null): PrivacyCheckState {
  const ds = useDataSource();
  const { preferences } = usePreferences();
  const [state, setState] = useState<PrivacyCheckState>({ status: 'idle' });
  const key = request ? JSON.stringify(request, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)) : '';
  const thresholds = preferences.privacy;
  // The effect keys on the serialised request; keep the latest object in a ref.
  const requestRef = useRef(request);
  requestRef.current = request;

  useEffect(() => {
    const request = requestRef.current;
    if (!request) {
      setState({ status: 'idle' });
      return undefined;
    }
    let cancelled = false;
    setState((previous) => (previous.status === 'ready' ? previous : { status: 'checking' }));
    ds.getPrivacyContext(request)
      .then((ctx) => {
        if (!cancelled) setState({ status: 'ready', assessment: assessPrivacy(ctx, thresholds) });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'idle' });
      });
    return () => {
      cancelled = true;
    };
  }, [ds, key, thresholds]);

  return state;
}
