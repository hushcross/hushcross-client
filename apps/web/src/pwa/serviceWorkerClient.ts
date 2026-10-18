export type PwaUpdateState = 'idle' | 'ready' | 'applying' | 'error';
let snapshot: PwaUpdateState = 'idle';
let registration: ServiceWorkerRegistration | undefined;
let registered = false;
let applying = false;
const listeners = new Set<() => void>();
const publish = (state: PwaUpdateState): void => {
  snapshot = state;
  for (const listener of listeners) listener();
};
export const getPwaUpdateSnapshot = (): PwaUpdateState => snapshot;
export function subscribePwaUpdate(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function applyPwaUpdate(): void {
  if (!registration?.waiting || applying) return;
  applying = true;
  publish('applying');
  try {
    registration.waiting.postMessage({ type: 'HUSHCROSS_APPLY_UPDATE' });
    window.setTimeout(() => { if (applying) { applying = false; publish('error'); } }, 15_000);
  } catch {
    applying = false;
    publish('error');
  }
}
export async function registerServiceWorker(): Promise<void> {
  if (registered || !import.meta.env.PROD || !('serviceWorker' in navigator) || !['https:', 'http:'].includes(location.protocol)) return;
  registered = true;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (applying) window.location.reload();
  });
  try {
    registration = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
    const ready = (): void => { if (registration?.waiting && navigator.serviceWorker.controller) publish('ready'); };
    ready();
    registration.addEventListener('updatefound', () => {
      const worker = registration?.installing;
      worker?.addEventListener('statechange', () => { if (worker.state === 'installed') ready(); });
    });
    // Browser navigation performs its own update check. No idle polling or forced reload.
  } catch {
    publish('error');
  }
}
