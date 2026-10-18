import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { AccountManager, type KeyValueStore } from '../../account/AccountManager';
import type { PasskeyPort } from '../../account/passkey';
import { SimpleOnboarding } from '../../account/SimpleOnboarding';

function memoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return { get: (k) => map.get(k) ?? null, set: (k, v) => void map.set(k, v), remove: (k) => void map.delete(k) };
}

/** Review aid: the Simple onboarding screen without a chain backend (`?passkey=1` pretends passkeys work). */
export function DevOnboardingPage() {
  const [params] = useSearchParams();
  const passkey = params.get('passkey') === '1';
  const manager = useMemo(() => {
    const port: PasskeyPort | null = passkey
      ? {
          isSupported: async () => true,
          register: async () => Promise.reject(new Error('preview only')),
          evaluate: async () => Promise.reject(new Error('preview only')),
        }
      : null;
    return new AccountManager(memoryStore(), port);
  }, [passkey]);
  return <SimpleOnboarding manager={manager} />;
}
