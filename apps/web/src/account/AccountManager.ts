import {
  createBackupFile,
  deriveMasterKeys,
  fromBase64Url,
  generateRecoveryPhrase,
  openBackupFile,
  openVault,
  parseEnvelope,
  sealWithPassword,
  sealWithPrf,
  serializeEnvelope,
  validateRecoveryPhrase,
  type AccountSecrets,
  type BackupFileContents,
  type JsonValue,
  type MasterKeys,
  type OpenVault,
  type VaultEnvelope,
} from '@hushcross/core';
import type { PasskeyPort } from './passkey';

export type AccountStatus = 'none' | 'locked' | 'unlocked';
export type Protection = { readonly kind: 'password'; readonly password: string } | { readonly kind: 'passkey' };

export interface UnlockedAccount {
  readonly secrets: AccountSecrets;
  readonly keys: MasterKeys;
}

/** What ChainDataSource needs from the session. */
export interface AccountSession {
  current(): UnlockedAccount | null;
  update(mutate: (secrets: AccountSecrets) => AccountSecrets): Promise<UnlockedAccount>;
  subscribe(listener: () => void): () => void;
  envelopeKind(): 'passkey' | 'passphrase' | null;
}

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export const VAULT_STORAGE_KEY = 'hushcross.vault.v1';
export const MIN_PASSWORD_LENGTH = 10;

export class AccountError extends Error {
  readonly code: 'bad_phrase' | 'bad_password' | 'no_vault' | 'passkey_unavailable' | 'wrong_secret' | 'bad_backup';

  constructor(code: AccountError['code']) {
    super(code);
    this.name = 'AccountError';
    this.code = code;
  }
}

export function browserStore(): KeyValueStore {
  return {
    get: (key) => {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set: (key, value) => window.localStorage.setItem(key, value),
    remove: (key) => {
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* storage blocked: nothing stored to remove */
      }
    },
  };
}

/**
 * Local account lifecycle: create / import / unlock / lock, encrypted at rest.
 * Only the encrypted envelope is persisted; phrase and keys live in memory while unlocked.
 */
export class AccountManager implements AccountSession {
  private unlocked: UnlockedAccount | null = null;
  private vault: OpenVault | null = null;
  private readonly listeners = new Set<() => void>();
  private lastActivity: number;
  private writes: Promise<unknown> = Promise.resolve();
  private generation = 0;

  constructor(
    private readonly store: KeyValueStore,
    private readonly passkeys: PasskeyPort | null,
    private readonly now: () => number = Date.now,
  ) {
    this.lastActivity = now();
  }

  status(): AccountStatus {
    if (this.unlocked) return 'unlocked';
    return this.envelope() ? 'locked' : 'none';
  }

  current(): UnlockedAccount | null {
    return this.unlocked;
  }

  envelopeKind(): 'passkey' | 'passphrase' | null {
    const envelope = this.envelope();
    if (!envelope) return null;
    return envelope.kdf.type === 'webauthn-prf' ? 'passkey' : 'passphrase';
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  generatePhrase(): string {
    return generateRecoveryPhrase();
  }

  async passkeySupported(): Promise<boolean> {
    return this.passkeys ? this.passkeys.isSupported() : false;
  }

  /** Create or import: seal the phrase locally and unlock. */
  async create(phrase: string, protection: Protection): Promise<void> {
    const clean = phrase.trim().split(/\s+/u).join(' ').toLowerCase();
    if (!validateRecoveryPhrase(clean)) throw new AccountError('bad_phrase');
    const secrets: AccountSecrets = { version: 1, phrase: clean, createdAt: this.now(), notes: [], gifts: [], meta: {} };
    await this.adopt(secrets, protection);
  }

  async unlockWithPassword(password: string): Promise<void> {
    const envelope = this.requireEnvelope();
    const generation = ++this.generation;
    let vault: OpenVault;
    try {
      vault = await openVault(envelope, { password });
    } catch {
      throw new AccountError('wrong_secret');
    }
    this.assertCurrent(generation);
    this.vault = vault;
    this.setUnlocked(vault.account);
  }

  async unlockWithPasskey(): Promise<void> {
    const envelope = this.requireEnvelope();
    const generation = ++this.generation;
    if (envelope.kdf.type !== 'webauthn-prf' || !this.passkeys) throw new AccountError('passkey_unavailable');
    let prfOutput: Uint8Array;
    try {
      prfOutput = await this.passkeys.evaluate(fromBase64Url(envelope.kdf.credentialId), fromBase64Url(envelope.kdf.prfSalt));
    } catch {
      throw new AccountError('passkey_unavailable');
    }
    let vault: OpenVault;
    try {
      vault = await openVault(envelope, { prfOutput });
    } catch {
      throw new AccountError('wrong_secret');
    }
    this.assertCurrent(generation);
    this.vault = vault;
    this.setUnlocked(vault.account);
  }

  lock(): void {
    this.generation += 1;
    this.unlocked = null;
    this.vault = null;
    this.emit();
  }

  /** Forget this device's vault (the phrase or a backup file is needed to come back). */
  forget(): void {
    this.lock();
    this.store.remove(VAULT_STORAGE_KEY);
    this.emit();
  }

  touch(): void {
    this.lastActivity = this.now();
  }

  /** Lock when idle for longer than `idleMs`. Returns true when it locked. */
  lockIfIdle(idleMs: number): boolean {
    if (this.unlocked && this.now() - this.lastActivity >= idleMs) {
      this.lock();
      return true;
    }
    return false;
  }

  async update(mutate: (secrets: AccountSecrets) => AccountSecrets): Promise<UnlockedAccount> {
    const generation = this.generation;
    const run = this.writes.then(async () => {
      this.assertCurrent(generation);
      const vault = this.vault;
      const unlocked = this.unlocked;
      if (!vault || !unlocked) throw new AccountError('no_vault');
      const previous = this.store.get(VAULT_STORAGE_KEY);
      const next = mutate(unlocked.secrets);
      const envelope = await vault.seal(next, this.now());
      this.assertCurrent(generation);
      if (this.store.get(VAULT_STORAGE_KEY) !== previous) {
        this.lock();
        throw new AccountError('no_vault');
      }
      this.store.set(VAULT_STORAGE_KEY, serializeEnvelope(envelope));
      this.unlocked = { secrets: next, keys: unlocked.keys };
      this.emit();
      return this.unlocked;
    });
    this.writes = run.then(() => undefined, () => undefined);
    return run;
  }

  async exportBackup(passphrase: string): Promise<BackupFileContents> {
    const unlocked = this.unlocked;
    if (!unlocked) throw new AccountError('no_vault');
    if (passphrase.length < MIN_PASSWORD_LENGTH) throw new AccountError('bad_password');
    const generation = this.generation;
    const file = await createBackupFile(unlocked.secrets, passphrase, this.now());
    this.assertCurrent(generation);
    await this.update((s) => ({ ...s, meta: { ...s.meta, lastExportAt: this.now() } }));
    return file;
  }

  /** Passkey-protected backup: the current envelope, re-sealed now (opens with the same synced passkey). */
  async exportPasskeyBackup(): Promise<BackupFileContents> {
    const unlocked = this.unlocked;
    if (!unlocked || !this.vault) throw new AccountError('no_vault');
    if (this.envelopeKind() !== 'passkey') throw new AccountError('passkey_unavailable');
    const generation = this.generation;
    const at = this.now();
    const next = { ...unlocked.secrets, meta: { ...unlocked.secrets.meta, lastExportAt: at } };
    const envelope = await this.vault.seal(next, at);
    this.assertCurrent(generation);
    await this.update(() => next);
    return { fileName: `hushcross-backup-${new Date(at).toISOString().slice(0, 10)}.json`, mimeType: 'application/json', contents: serializeEnvelope(envelope), createdAt: at };
  }

  /** Restore a passkey-protected backup file on a device that has the same passkey. */
  async restorePasskeyBackup(contents: string): Promise<void> {
    let envelope: VaultEnvelope;
    try {
      envelope = parseEnvelope(contents);
    } catch {
      throw new AccountError('bad_backup');
    }
    if (envelope.kdf.type !== 'webauthn-prf') throw new AccountError('bad_backup');
    if (!this.passkeys) throw new AccountError('passkey_unavailable');
    const generation = ++this.generation;
    let prfOutput: Uint8Array;
    try {
      prfOutput = await this.passkeys.evaluate(fromBase64Url(envelope.kdf.credentialId), fromBase64Url(envelope.kdf.prfSalt));
    } catch {
      throw new AccountError('passkey_unavailable');
    }
    let vault: OpenVault;
    try {
      vault = await openVault(envelope, { prfOutput });
    } catch {
      throw new AccountError('wrong_secret');
    }
    this.assertCurrent(generation);
    this.store.set(VAULT_STORAGE_KEY, serializeEnvelope(envelope));
    this.vault = vault;
    this.setUnlocked(vault.account);
  }

  /** Restore from an encrypted backup file and protect it locally with `protection`. */
  async restoreBackup(contents: string, passphrase: string, protection: Protection): Promise<void> {
    const generation = ++this.generation;
    let secrets: AccountSecrets;
    try {
      secrets = await openBackupFile(contents, passphrase);
    } catch {
      throw new AccountError('bad_backup');
    }
    this.assertCurrent(generation);
    await this.adopt(secrets, protection, generation);
  }

  meta(key: string): JsonValue | undefined {
    return this.unlocked?.secrets.meta[key];
  }

  private async adopt(secrets: AccountSecrets, protection: Protection, generation = ++this.generation): Promise<void> {
    let envelope: VaultEnvelope;
    let vault: OpenVault;
    if (protection.kind === 'password') {
      if (protection.password.length < MIN_PASSWORD_LENGTH) throw new AccountError('bad_password');
      envelope = await sealWithPassword(secrets, protection.password, { now: this.now() });
      vault = await openVault(envelope, { password: protection.password });
    } else {
      if (!this.passkeys) throw new AccountError('passkey_unavailable');
      let registration;
      try {
        registration = await this.passkeys.register('HushCross vault');
      } catch {
        throw new AccountError('passkey_unavailable');
      }
      envelope = await sealWithPrf(secrets, registration.prfOutput, registration.credentialId, registration.prfSalt, { now: this.now() });
      vault = await openVault(envelope, { prfOutput: registration.prfOutput });
    }
    this.assertCurrent(generation);
    this.store.set(VAULT_STORAGE_KEY, serializeEnvelope(envelope));
    this.vault = vault;
    this.setUnlocked(secrets);
  }

  private assertCurrent(generation: number): void {
    if (generation !== this.generation) throw new AccountError('no_vault');
  }

  private setUnlocked(secrets: AccountSecrets): void {
    this.unlocked = { secrets, keys: deriveMasterKeys(secrets.phrase) };
    this.touch();
    this.emit();
  }

  private envelope(): VaultEnvelope | null {
    const raw = this.store.get(VAULT_STORAGE_KEY);
    if (!raw) return null;
    try {
      return parseEnvelope(raw);
    } catch {
      return null;
    }
  }

  private requireEnvelope(): VaultEnvelope {
    const envelope = this.envelope();
    if (!envelope) throw new AccountError('no_vault');
    return envelope;
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
