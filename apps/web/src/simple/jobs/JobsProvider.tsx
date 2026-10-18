import { JobRunner, type Job, type JobDraft, type JobPlan, type JobStore } from '@hushcross/core';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useDataSource } from '../../data/DataProvider';
import { useI18n } from '../../i18n/I18nProvider';
import { usePreferences } from '../../lib/preferences';
import { memoryJobStore } from './jobStore';
import { notifySettled, requestNotificationPermission } from './notify';
import { WebJobEnv } from './webJobEnv';

export interface JobsContextValue {
  readonly jobs: readonly Job[];
  /** False while the vault is locked (jobs pause) or before the first load. */
  readonly ready: boolean;
  /** This tab runs the jobs (another open tab may own them instead). */
  readonly leader: boolean;
  readonly plan: (draft: JobDraft) => Promise<JobPlan>;
  readonly start: (draft: JobDraft) => Promise<Job>;
  readonly sendAnyway: (id: string) => Promise<void>;
  readonly retry: (id: string) => Promise<void>;
  readonly cancel: (id: string) => Promise<void>;
  /** Run a pass now (after a wallet connects, on focus...). */
  readonly poke: () => void;
}

const JobsContext = createContext<JobsContextValue | null>(null);

export interface JobsProviderProps {
  readonly children: ReactNode;
  /** Defaults to an in-memory store (demo data). The chain app passes the vault-backed store. */
  readonly store?: JobStore;
  /** Fires when the store becomes available or unavailable (vault unlock / lock). */
  readonly subscribeStore?: (listener: () => void) => () => void;
  readonly pollMs?: number;
}

type LockManagerLike = { request: (name: string, options: { signal: AbortSignal }, cb: (lock: unknown) => Promise<void> | void) => Promise<unknown> };

/**
 * Runs one-step jobs in the background for as long as the app is open. Only one tab runs them (Web
 * Locks); the others just show the list. Ticks on a timer, on data changes and when the tab gets focus.
 */
export function JobsProvider({ children, store: given, subscribeStore, pollMs = 4000 }: JobsProviderProps) {
  const source = useDataSource();
  const { preferences } = usePreferences();
  const { t } = useI18n();
  const thresholdsRef = useRef(preferences.privacy);
  thresholdsRef.current = preferences.privacy;
  const tRef = useRef(t);
  tRef.current = t;
  const [fallback] = useState(() => memoryJobStore());
  const store = given ?? fallback;
  const [jobs, setJobs] = useState<readonly Job[]>([]);
  const [ready, setReady] = useState(false);
  const [leader, setLeader] = useState(false);

  const { runner, env } = useMemo(() => {
    const webEnv = new WebJobEnv({ source, thresholds: () => thresholdsRef.current });
    const jobRunner = new JobRunner(store, webEnv, {
      onChange: (list) => setJobs(list),
      onSettled: (job) => notifySettled(job, tRef.current),
    });
    return { runner: jobRunner, env: webEnv };
  }, [source, store]);

  const tick = useCallback(() => {
    void runner
      .tick()
      .then(async () => {
        const loaded = await runner.load();
        setReady(loaded !== null);
      })
      .catch(() => {
        // A failed save (vault locked mid-step) or a network error: the next tick retries.
      });
  }, [runner]);

  // Leadership: one tab runs the jobs. Others wait in the lock queue and take over when it closes.
  useEffect(() => {
    const locks = (typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManagerLike }).locks : undefined) ?? null;
    if (!locks) {
      setLeader(true);
      return undefined;
    }
    const abort = new AbortController();
    let release: (() => void) | null = null;
    void locks
      .request('hushcross-jobs', { signal: abort.signal }, () => {
        if (abort.signal.aborted) return undefined;
        setLeader(true);
        return new Promise<void>((resolve) => {
          release = resolve;
        });
      })
      .catch(() => undefined);
    return () => {
      abort.abort();
      release?.();
      setLeader(false);
    };
  }, []);

  useEffect(() => {
    void runner.load().then((loaded) => setReady(loaded !== null), () => setReady(false));
    if (!subscribeStore) return undefined;
    return subscribeStore(() => {
      runner.unload();
      void runner.load().then((loaded) => setReady(loaded !== null), () => setReady(false));
    });
  }, [runner, subscribeStore]);

  useEffect(() => {
    if (leader) return undefined;
    // Another tab runs the jobs: just follow the stored list.
    const timer = window.setInterval(() => {
      void store.load().then((list) => {
        if (list) setJobs([...list].sort((a, b) => b.createdAt - a.createdAt));
      }, () => undefined);
    }, pollMs);
    return () => window.clearInterval(timer);
  }, [leader, store, pollMs]);

  useEffect(() => {
    if (!leader) return undefined;
    tick();
    const timer = window.setInterval(tick, pollMs);
    const unsubscribe = source.subscribe((topics) => {
      if (topics.some((topic) => topic === 'notes' || topic === 'send' || topic === 'bids' || topic === 'sales' || topic === 'account')) tick();
    });
    const onFocus = (): void => tick();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      unsubscribe();
      window.removeEventListener('focus', onFocus);
    };
  }, [leader, tick, pollMs, source]);

  const value = useMemo<JobsContextValue>(
    () => ({
      jobs,
      ready,
      leader,
      plan: (draft) => runner.plan(draft),
      start: async (draft) => {
        void requestNotificationPermission();
        const job = await runner.create(draft);
        env.allowWallet(job.id);
        tick();
        return job;
      },
      sendAnyway: async (id) => {
        await runner.sendAnyway(id);
        tick();
      },
      retry: async (id) => {
        env.allowWallet(id);
        await runner.retry(id);
        tick();
      },
      cancel: async (id) => {
        await runner.cancel(id);
      },
      poke: tick,
    }),
    [jobs, ready, leader, runner, env, tick],
  );
  return <JobsContext.Provider value={value}>{children}</JobsContext.Provider>;
}

export function useJobs(): JobsContextValue {
  const value = useContext(JobsContext);
  if (!value) throw new Error('useJobs must be used inside JobsProvider');
  return value;
}

export function useJob(id: string | undefined): Job | null {
  const { jobs } = useJobs();
  return jobs.find((j) => j.id === id) ?? null;
}
