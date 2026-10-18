import { EXTENSION_NAVIGATION_EVENT, IS_EXTENSION, extensionJobPath } from '../../platform/runtime';
import type { Job } from '@hushcross/core';
import type { MessageKey, Vars } from '../../i18n/types';

type Translate = (key: MessageKey, vars?: Vars) => string;

function api(): typeof Notification | null {
  return typeof window !== 'undefined' && 'Notification' in window ? window.Notification : null;
}

/** Asked once, when the first job starts (never on page load). */
export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  const N = api();
  if (!N) return 'unsupported';
  if (N.permission !== 'default') return N.permission;
  try {
    return await N.requestPermission();
  } catch {
    return 'denied';
  }
}

/** A short, content-free notice: no amounts or recipients on the lock screen. */
export function notifySettled(job: Job, t: Translate): void {
  const N = api();
  if (!N || N.permission !== 'granted') return;
  const done = job.status === 'done';
  const localPath = IS_EXTENSION ? extensionJobPath(job.id) : null;
  if (IS_EXTENSION && (!localPath || (job.status !== 'done' && job.status !== 'attention'))) return;
  try {
    const note = new N(t(done ? 'simple.notify.doneTitle' : 'simple.notify.attentionTitle'), { body: t(`simple.kind.${job.kind}`), tag: job.id });
    let active = true;
    const discard = (): void => {
      active = false;
      window.removeEventListener('pagehide', discard);
      note.close();
    };
    if (IS_EXTENSION) {
      window.addEventListener('pagehide', discard);
      note.onclose = () => { active = false; window.removeEventListener('pagehide', discard); };
    }
    note.onclick = () => {
      if (IS_EXTENSION) {
        if (!active || window.closed || !localPath) return;
        window.focus();
        window.dispatchEvent(new CustomEvent(EXTENSION_NAVIGATION_EVENT, { detail: localPath }));
        discard();
      } else {
        window.focus();
        window.location.assign(`/jobs/${encodeURIComponent(job.id)}`);
      }
    };
  } catch {
    // Some browsers only allow notifications from a service worker; the in-app list still shows it.
  }
}
