import {
  ARTIFACT_NAMES,
  assembleCircuitArtifacts,
  parseManifest,
  proverFromGroth16Module,
  type ArtifactName,
  type CircuitArtifacts,
  type Groth16ModuleLike,
  type Groth16Prover,
} from '@hushcross/core';
import manifestJson from '../../../../packages/core/artifacts/MANIFEST.json';
import vendor from './vendor.json';

/**
 * The GPL-3.0 prover is not part of the app bundle. It is fetched as a separate file,
 * checked against the sha256 recorded in vendor.json, and only then executed. Circuit
 * files are checked against the hashes compiled in from packages/core/artifacts.
 */
export interface ZkLoader {
  getProver(): Promise<Groth16Prover>;
  getArtifacts(): Promise<CircuitArtifacts>;
}

export class ZkIntegrityError extends Error {
  constructor(file: string) {
    super(`integrity check failed for ${file}`);
    this.name = 'ZkIntegrityError';
  }
}

export interface ZkLoaderOptions {
  readonly baseUrl: string;
  readonly fetchBytes?: (url: string) => Promise<Uint8Array>;
  readonly runScript?: (source: string) => Promise<Groth16ModuleLike>;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', copy.buffer));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function defaultFetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`could not load ${url} (${response.status})`);
  return new Uint8Array(await response.arrayBuffer());
}

/** Executes the verified script text from a Blob URL and returns the global it defines. */
async function defaultRunScript(source: string): Promise<Groth16ModuleLike> {
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  try {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('prover script failed to load'));
      document.head.appendChild(script);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
  const loaded = (window as unknown as { snarkjs?: Groth16ModuleLike }).snarkjs;
  if (!loaded) throw new Error('prover script did not register');
  return loaded;
}

export function createZkLoader(options: ZkLoaderOptions): ZkLoader {
  const base = options.baseUrl.endsWith('/') ? options.baseUrl : `${options.baseUrl}/`;
  const fetchBytes = options.fetchBytes ?? defaultFetchBytes;
  const runScript = options.runScript ?? defaultRunScript;
  let prover: Promise<Groth16Prover> | null = null;
  let artifacts: Promise<CircuitArtifacts> | null = null;
  return {
    getProver() {
      prover ??= (async () => {
        const bytes = await fetchBytes(`${base}${vendor.snarkjs.file}`);
        if ((await sha256Hex(bytes)) !== vendor.snarkjs.sha256) throw new ZkIntegrityError(vendor.snarkjs.file);
        return proverFromGroth16Module(await runScript(new TextDecoder().decode(bytes)));
      })().catch((error: unknown) => {
        prover = null;
        throw error;
      });
      return prover;
    },
    getArtifacts() {
      artifacts ??= (async () => {
        const manifest = parseManifest(manifestJson);
        const entries = await Promise.all(ARTIFACT_NAMES.map(async (name) => [name, await fetchBytes(`${base}${vendor.circuits}${name}`)] as const));
        const files = Object.fromEntries(entries) as Record<ArtifactName, Uint8Array>;
        try {
          return assembleCircuitArtifacts(manifest, files);
        } catch {
          throw new ZkIntegrityError('circuit artifacts');
        }
      })().catch((error: unknown) => {
        artifacts = null;
        throw error;
      });
      return artifacts;
    },
  };
}

export const PROVER_SHA256 = vendor.snarkjs.sha256;
