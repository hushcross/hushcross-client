import type { Groth16Proof, Groth16Prover, ProofBundle } from '@hushcross/core';
import manifest from '../../../../packages/core/artifacts/MANIFEST.json';
import { createZkLoader, sha256Hex, type ZkLoader } from './loadProver';

type Circuit = 'commitment' | 'withdraw';
type WorkerPort = Pick<Worker, 'postMessage' | 'terminate' | 'addEventListener' | 'removeEventListener'>;
export interface ExtensionProverHost {
  readonly location: Pick<Location, 'protocol' | 'hostname' | 'href'>;
  readonly extensionId: string;
  readonly document: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>;
  readonly page: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  readonly createWorker: (url: URL) => WorkerPort;
}
export interface ExtensionZkOptions {
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  /** Trusted test/runtime injection, never taken from request or URL data. */
  readonly host?: ExtensionProverHost;
  readonly fetchBytes?: (url: string) => Promise<Uint8Array>;
}
type Packet = { readonly operation: 'prove' | 'verify'; readonly circuit: Circuit } & Record<string, unknown>;
type Prepared = { readonly packet: Packet; readonly transfers: Transferable[] };
const active = new Set<() => void>();
export const EXTENSION_PROVER_PATH = '/zk/prover-worker.js';
const failed = (): Error => new Error('extension_prover_failed');

/** Locking the account must invalidate outstanding work, including artifact preparation. */
export function cancelExtensionProofs(): void { for (const cancel of [...active]) cancel(); }
function browserHost(): ExtensionProverHost {
  const extensionId = (globalThis as { chrome?: { runtime?: { id?: string } } }).chrome?.runtime?.id ?? '';
  return { location: window.location, extensionId, document, page: window,
    createWorker: url => new Worker(url, { type: 'classic', name: 'hushcross-local-prover' }) };
}
function packageBase(input: string, host: ExtensionProverHost): URL {
  if (host.location.protocol !== 'chrome-extension:' || !/^[a-p]{32}$/.test(host.extensionId)
    || host.location.hostname !== host.extensionId) throw new Error('extension_prover_unavailable');
  const base = new URL(input, host.location.href);
  if (base.protocol !== 'chrome-extension:' || base.hostname !== host.extensionId || base.username || base.password
    || base.search || base.hash || base.pathname !== '/') throw new Error('extension_prover_unavailable');
  return base;
}
function scalar(value: unknown): value is string { return typeof value === 'string' && /^(0|[1-9][0-9]{0,77})$/.test(value); }
function vector(value: unknown, count: number): value is string[] { return Array.isArray(value) && value.length === count && value.every(scalar); }
function proof(value: unknown): value is Groth16Proof {
  if (!value || typeof value !== 'object') return false;
  const p = value as Partial<Groth16Proof>;
  return p.protocol === 'groth16' && p.curve === 'bn128' && vector(p.pi_a, 3) && vector(p.pi_c, 3)
    && Array.isArray(p.pi_b) && p.pi_b.length === 3 && p.pi_b.every(row => vector(row, 2));
}
function bundle(value: unknown, circuit: Circuit): ProofBundle {
  if (!value || typeof value !== 'object') throw failed();
  const result = value as Partial<ProofBundle>;
  if (!proof(result.proof) || !vector(result.publicSignals, circuit === 'commitment' ? 4 : 8)) throw failed();
  return { proof: result.proof, publicSignals: result.publicSignals };
}
async function identify(wasm: Uint8Array, zkey: Uint8Array): Promise<Circuit> {
  const [wasmHash, zkeyHash] = await Promise.all([sha256Hex(wasm), sha256Hex(zkey)]);
  for (const circuit of ['commitment', 'withdraw'] as const) {
    const w = manifest.artifacts[`${circuit}.wasm`]; const z = manifest.artifacts[`${circuit}.zkey`];
    if (wasm.byteLength === w.bytes && zkey.byteLength === z.bytes && wasmHash === w.sha256 && zkeyHash === z.sha256) return circuit;
  }
  throw failed();
}

/** Same ZkLoader contract, but execution never uses the web loader's Blob script path. */
export function createExtensionZkLoader(options: ExtensionZkOptions = {}): ZkLoader {
  const host = options.host ?? browserHost();
  const base = packageBase(options.baseUrl ?? '/', host);
  const timeout = options.timeoutMs ?? 120_000;
  if (!Number.isSafeInteger(timeout) || timeout <= 0 || timeout > 300_000) throw new Error('extension_prover_unavailable');
  const artifacts = createZkLoader({ baseUrl: base.href, ...(options.fetchBytes ? { fetchBytes: options.fetchBytes } : {}) });
  const workerUrl = new URL(EXTENSION_PROVER_PATH, base);
  const run = <T>(prepare: () => Promise<Prepared>, decode: (value: unknown, circuit: Circuit) => T): Promise<T> => new Promise((resolve, reject) => {
    let worker: WorkerPort | undefined;
    let prepared: Prepared | undefined;
    let settled = false;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const cleanup = (): void => {
      active.delete(cancel); clearTimeout(deadline);
      host.document.removeEventListener('visibilitychange', visibility);
      host.page.removeEventListener('pagehide', cancel);
      host.page.removeEventListener('beforeunload', cancel);
      if (worker) {
        worker.removeEventListener('message', message); worker.removeEventListener('error', workerError); worker.removeEventListener('messageerror', workerError);
        worker.terminate(); worker = undefined;
      }
      prepared = undefined;
    };
    const fail = (error: Error): void => { if (settled) return; settled = true; cleanup(); reject(error); };
    const cancel = (): void => fail(new DOMException('Proof generation was cancelled.', 'AbortError'));
    const visibility = (): void => { if (host.document.hidden) cancel(); };
    const workerError = (event: Event): void => { event.preventDefault(); fail(failed()); };
    const message = (event: Event): void => {
      if (settled) return;
      if (host.document.hidden) { cancel(); return; }
      const data: unknown = (event as MessageEvent).data;
      if (!prepared || !data || typeof data !== 'object') { fail(failed()); return; }
      const result = data as { type?: unknown; operation?: unknown; result?: unknown };
      if (result.type !== 'result' || result.operation !== prepared.packet.operation) { fail(failed()); return; }
      try {
        const value = decode(result.result, prepared.packet.circuit);
        settled = true; cleanup(); resolve(value);
      } catch { fail(failed()); }
    };
    active.add(cancel);
    host.document.addEventListener('visibilitychange', visibility);
    host.page.addEventListener('pagehide', cancel); host.page.addEventListener('beforeunload', cancel);
    if (host.document.hidden) { cancel(); return; }
    deadline = setTimeout(() => fail(failed()), timeout);
    void Promise.resolve().then(() => settled ? null : prepare()).then(value => {
      if (settled || !value) return;
      if (host.document.hidden) { cancel(); return; }
      prepared = value; worker = host.createWorker(workerUrl);
      worker.addEventListener('message', message); worker.addEventListener('error', workerError); worker.addEventListener('messageerror', workerError);
      worker.postMessage(value.packet, value.transfers);
    }).catch(() => fail(failed()));
  });
  const prover: Groth16Prover = {
    prove(request) {
      return run(async () => {
        const wasm = new Uint8Array(request.wasm); const zkey = new Uint8Array(request.zkey);
        const witness = structuredClone(request.witness);
        const circuit = await identify(wasm, zkey);
        return { packet: { operation: 'prove', circuit, wasm, zkey, witness }, transfers: [wasm.buffer, zkey.buffer] };
      }, bundle);
    },
    verify(request) {
      return run(async () => {
        const circuit = request.vkey.nPublic === 4 ? 'commitment' : request.vkey.nPublic === 8 ? 'withdraw' : null;
        if (!circuit) throw failed();
        return { packet: { operation: 'verify', circuit, ...structuredClone(request) }, transfers: [] };
      }, value => { if (typeof value !== 'boolean') throw failed(); return value; });
    },
  };
  return { getArtifacts: () => artifacts.getArtifacts(), getProver: async () => prover };
}
