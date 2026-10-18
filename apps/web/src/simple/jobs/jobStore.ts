import { jobToJson, jobsFromJson, type Job, type JobStore } from '@hushcross/core';
import type { AccountSession } from '../../account/AccountManager';
import { JOBS_META_KEY, withMeta } from '../../chain/meta';

/** Finished jobs kept for the history list; older ones are dropped when the list is saved. */
export const KEEP_FINISHED = 40;

export function pruneJobs(jobs: readonly Job[]): Job[] {
  const finished = jobs.filter((j) => j.status === 'done' || j.status === 'cancelled').sort((a, b) => b.updatedAt - a.updatedAt);
  const drop = new Set(finished.slice(KEEP_FINISHED).map((j) => j.id));
  return jobs.filter((j) => !drop.has(j.id));
}

/**
 * Jobs live inside the encrypted vault (`AccountSecrets.meta.simpleJobs`): they hold note ids, recipients
 * and sale details, so they are sealed with the same passkey / password as everything else. While the
 * vault is locked the store is unavailable and the runner pauses.
 */
export function vaultJobStore(session: AccountSession): JobStore {
  return {
    async load() {
      const account = session.current();
      return account ? jobsFromJson(account.secrets.meta[JOBS_META_KEY]) : null;
    },
    async save(jobs) {
      if (!session.current()) return;
      const json = pruneJobs(jobs).map(jobToJson);
      await session.update((s) => withMeta(s, { [JOBS_META_KEY]: json }));
    },
  };
}

/** The demo (mock data) keeps jobs for the tab's lifetime only; its vault resets on reload too. */
export function memoryJobStore(initial: readonly Job[] = []): JobStore & { readonly snapshot: () => readonly Job[] } {
  let saved = jobsFromJson(initial.map(jobToJson));
  return {
    async load() {
      return [...saved];
    },
    async save(jobs) {
      saved = pruneJobs(jobs);
    },
    snapshot: () => saved,
  };
}
