import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { DataSource } from './DataSource';
import type { DataTopic } from './types';

const DataSourceContext = createContext<DataSource | null>(null);

export function DataProvider({ source, children }: { readonly source: DataSource; readonly children: ReactNode }) {
  return <DataSourceContext.Provider value={source}>{children}</DataSourceContext.Provider>;
}

export function useDataSource(): DataSource {
  const source = useContext(DataSourceContext);
  if (!source) throw new Error('useDataSource must be used inside DataProvider');
  return source;
}

export type Resource<T> =
  | { readonly status: 'loading'; readonly data: undefined; readonly error: undefined; readonly reload: () => void }
  | { readonly status: 'ready'; readonly data: T; readonly error: undefined; readonly reload: () => void }
  | { readonly status: 'error'; readonly data: T | undefined; readonly error: unknown; readonly reload: () => void };

/**
 * Load data through the DataSource and refresh it whenever one of `topics`
 * changes. Refreshes keep the previous data visible (no skeleton flash).
 */
export function useResource<T>(load: (source: DataSource) => Promise<T>, topics: readonly DataTopic[], deps: readonly unknown[] = []): Resource<T> {
  const source = useDataSource();
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'error'; data: T | undefined; error: unknown }>({ status: 'loading', data: undefined, error: undefined });
  const loadRef = useRef(load);
  loadRef.current = load;
  const request = useRef(0);
  const topicKey = topics.join(',');

  const run = useCallback(() => {
    request.current += 1;
    const id = request.current;
    loadRef
      .current(source)
      .then((data) => {
        if (id === request.current) setState({ status: 'ready', data, error: undefined });
      })
      .catch((error: unknown) => {
        if (id === request.current) setState((previous) => ({ status: 'error', data: previous.data, error }));
      });
  }, [source]);

  useEffect(() => {
    setState({ status: 'loading', data: undefined, error: undefined });
    run();
    const watched = new Set(topicKey.split(',').filter(Boolean));
    const unsubscribe = source.subscribe((changed) => {
      if (changed.some((topic) => watched.has(topic))) run();
    });
    return () => {
      unsubscribe();
      request.current += 1;
    };
  }, [source, run, topicKey, ...deps]);

  if (state.status === 'ready' && state.data !== undefined) return { status: 'ready', data: state.data, error: undefined, reload: run };
  if (state.status === 'error') return { status: 'error', data: state.data, error: state.error, reload: run };
  return { status: 'loading', data: undefined, error: undefined, reload: run };
}
