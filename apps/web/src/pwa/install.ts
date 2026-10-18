export type InstallMode = 'installed' | 'prompt' | 'ios' | 'manual';
export type InstallResult = 'accepted' | 'dismissed' | 'unavailable' | 'failed';
export interface InstallSnapshot {
  readonly mode: InstallMode;
  readonly busy: boolean;
  readonly result: InstallResult | null;
}
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ readonly outcome: 'accepted' | 'dismissed' }>;
}
export interface InstallEnvironment {
  readonly events: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
  readonly display: MediaQueryList | null;
  readonly userAgent: string;
  readonly platform: string;
  readonly maxTouchPoints: number;
  readonly standalone: () => boolean;
}
export function isIosDevice(userAgent: string, platform: string, maxTouchPoints: number): boolean {
  return /iPad|iPhone|iPod/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
}
export function browserInstallEnvironment(): InstallEnvironment | null {
  if (typeof window === 'undefined') return null;
  return {
    events: window,
    display: typeof window.matchMedia === 'function' ? window.matchMedia('(display-mode: standalone)') : null,
    userAgent: window.navigator.userAgent, platform: window.navigator.platform,
    maxTouchPoints: window.navigator.maxTouchPoints ?? 0,
    standalone: () => (window.navigator as Navigator & { standalone?: boolean }).standalone === true,
  };
}

/** Transient browser capability only. No wallet state, local storage or network access. */
export function createInstallController(environment: InstallEnvironment | null = browserInstallEnvironment()) {
  let deferred: InstallPromptEvent | null = null;
  let installed = false;
  let started = false;
  let generation = 0;
  let busy = false;
  let result: InstallResult | null = null;
  const listeners = new Set<() => void>();
  const mode = (): InstallMode => installed || environment?.display?.matches || environment?.standalone()
    ? 'installed' : deferred ? 'prompt'
      : environment && isIosDevice(environment.userAgent, environment.platform, environment.maxTouchPoints) ? 'ios' : 'manual';
  let snapshot: InstallSnapshot = { mode: mode(), busy, result };
  const publish = (): void => {
    const next = { mode: mode(), busy, result };
    if (next.mode === snapshot.mode && next.busy === snapshot.busy && next.result === snapshot.result) return;
    snapshot = next; for (const listener of listeners) listener();
  };
  const beforeInstall = (event: Event): void => {
    const candidate = event as Partial<InstallPromptEvent>;
    if (typeof candidate.prompt !== 'function' || typeof candidate.userChoice?.then !== 'function' || installed) return;
    event.preventDefault(); deferred = event as InstallPromptEvent; result = null; publish();
  };
  const didInstall = (): void => { installed = true; deferred = null; result = null; publish(); };
  const displayChanged = (): void => { publish(); };
  return {
    getSnapshot: (): InstallSnapshot => snapshot,
    subscribe(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start(): void {
      if (started || !environment) return;
      started = true;
      environment.events.addEventListener('beforeinstallprompt', beforeInstall);
      environment.events.addEventListener('appinstalled', didInstall);
      if (typeof environment.display?.addEventListener === 'function') environment.display.addEventListener('change', displayChanged);
      else environment.display?.addListener?.(displayChanged);
      publish();
    },
    stop(): void {
      if (!started || !environment) return;
      started = false; generation++; deferred = null; busy = false;
      environment.events.removeEventListener('beforeinstallprompt', beforeInstall);
      environment.events.removeEventListener('appinstalled', didInstall);
      if (typeof environment.display?.removeEventListener === 'function') environment.display.removeEventListener('change', displayChanged);
      else environment.display?.removeListener?.(displayChanged);
      publish();
    },
    async promptInstall(): Promise<InstallResult> {
      if (!deferred || busy || !started) return 'unavailable';
      const event = deferred; const current = generation;
      deferred = null; busy = true; result = null; publish();
      let outcome: InstallResult;
      try { await event.prompt(); outcome = (await event.userChoice).outcome; }
      catch { outcome = 'failed'; }
      if (current === generation && started) {
        busy = false;
        // Browser acceptance is not installation confirmation. Wait for the
        // appinstalled event or observed standalone display before saying installed.
        result = installed ? null : outcome;
        publish();
      }
      return outcome;
    },
  };
}
export type InstallController = ReturnType<typeof createInstallController>;
