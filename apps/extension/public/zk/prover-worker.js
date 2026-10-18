'use strict';
// Owned MV3 boundary; the bundled prover is copied unchanged.
const PROVER_HASH = "3bf5b5123047ed9187baa7d4c11285019f09fbed88a28693984ed9dd0508466a";
const EXPECTED = {
  "commitment.wasm": {
    "sha256": "254d2130607182fd6fd1aee67971526b13cfe178c88e360da96dce92663828d8",
    "bytes": 2380442
  },
  "commitment.zkey": {
    "sha256": "494ae92d64098fda2a5649690ddc5821fcd7449ca5fe8ef99ee7447544d7e1f3",
    "bytes": 901233
  },
  "commitment.vkey": {
    "sha256": "7d48b4eb3dedc12fb774348287b587f0c18c3c7254cd60e9cf0f8b3636a570d8",
    "bytes": 3477
  },
  "withdraw.wasm": {
    "sha256": "36cda22791def3d520a55c0fc808369cd5849532a75fab65686e666ed3d55c10",
    "bytes": 2607967
  },
  "withdraw.zkey": {
    "sha256": "2a893b42174c813566e5c40c715a8b90cd49fc4ecf384e3a6024158c3d6de677",
    "bytes": 17793015
  },
  "withdraw.vkey": {
    "sha256": "666bd0983b20c1611543b04f7712e067fbe8cad69f07ada8a310837ff398d21e",
    "bytes": 4208
  }
};

// A DedicatedWorker is terminable by its owner. Disable nested worker creation
// in this realm so ffjavascript's existing Worker-unavailable path also covers
// groth16.verify, whose public API has no singleThread option.
Object.defineProperty(globalThis, 'Worker', { value: undefined, writable: false, configurable: false });
const quiet = () => undefined;
Object.defineProperty(globalThis, 'console', { value: Object.freeze(Object.fromEntries(
  ['log', 'info', 'warn', 'error', 'debug', 'trace', 'dir', 'table', 'assert'].map(name => [name, quiet]),
)), configurable: false });

const scalar = value => typeof value === 'string' && /^(0|[1-9][0-9]{0,77})$/.test(value);
const vector = (value, n) => Array.isArray(value) && value.length === n && value.every(scalar);
const proofShape = value => !!value && typeof value === 'object'
  && vector(value.pi_a, 3) && vector(value.pi_c, 3)
  && Array.isArray(value.pi_b) && value.pi_b.length === 3 && value.pi_b.every(row => vector(row, 2));
const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
const hash = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
  .map(byte => byte.toString(16).padStart(2, '0')).join('');
async function checked(name, bytes) {
  const expected = EXPECTED[name];
  if (!expected || !(bytes instanceof Uint8Array) || bytes.length !== expected.bytes || await hash(bytes) !== expected.sha256) throw new Error('integrity');
  return bytes;
}
async function verificationKey(circuit) {
  const name = `${circuit}.vkey`;
  const response = await fetch(new URL(`./circuits/${name}`, self.location.href), { credentials: 'omit', cache: 'no-store' });
  if (!response.ok) throw new Error('artifact');
  const bytes = await checked(name, new Uint8Array(await response.arrayBuffer()));
  return JSON.parse(new TextDecoder().decode(bytes));
}
async function loadProver() {
  if (self.location.protocol !== 'chrome-extension:') throw new Error('context');
  const url = new URL('./snarkjs-0.7.5.min.js', self.location.href);
  const response = await fetch(url, { credentials: 'omit', cache: 'no-store' });
  if (!response.ok || await hash(await response.arrayBuffer()) !== PROVER_HASH) throw new Error('integrity');
  // Same-package URL, never script text, a Blob URL or a request-controlled path.
  importScripts('./snarkjs-0.7.5.min.js');
  if (typeof self.snarkjs?.groth16?.fullProve !== 'function' || typeof self.snarkjs?.groth16?.verify !== 'function') throw new Error('prover');
}
function witnessShape(circuit, witness) {
  if (!witness || typeof witness !== 'object' || Array.isArray(witness)) return false;
  const keys = circuit === 'commitment' ? ['value', 'label', 'nullifier', 'secret']
    : ['withdrawnValue', 'stateRoot', 'stateTreeDepth', 'ASPRoot', 'ASPTreeDepth', 'context', 'label', 'existingValue',
      'existingNullifier', 'existingSecret', 'newNullifier', 'newSecret', 'stateSiblings', 'stateIndex', 'ASPSiblings', 'ASPIndex'];
  return Object.keys(witness).length === keys.length && keys.every(key => key.endsWith('Siblings')
    ? vector(witness[key], 32) : scalar(witness[key]));
}
let used = false;
self.addEventListener('message', async ({ data }) => {
  if (used) return;
  used = true;
  try {
    if (!data || !['prove', 'verify'].includes(data.operation) || !['commitment', 'withdraw'].includes(data.circuit)) throw new Error('request');
    const count = data.circuit === 'commitment' ? 4 : 8;
    if (data.operation === 'prove') {
      if (!witnessShape(data.circuit, data.witness)) throw new Error('witness');
      await Promise.all([checked(`${data.circuit}.wasm`, data.wasm), checked(`${data.circuit}.zkey`, data.zkey)]);
    } else if (!proofShape(data.proof) || !vector(data.publicSignals, count)) throw new Error('proof');
    await loadProver();
    const vkey = await verificationKey(data.circuit);
    if (data.operation === 'prove') {
      const result = await self.snarkjs.groth16.fullProve(data.witness,
        { type: 'mem', data: data.wasm }, { type: 'mem', data: data.zkey }, undefined, undefined, { singleThread: true });
      if (!proofShape(result.proof) || !vector(result.publicSignals, count)
        || await self.snarkjs.groth16.verify(vkey, result.publicSignals, result.proof) !== true) throw new Error('verification');
      self.postMessage({ type: 'result', operation: 'prove', result: { proof: result.proof, publicSignals: result.publicSignals } });
    } else {
      // Do not silently substitute a different verification key for the caller.
      const result = canonical(data.vkey) === canonical(vkey)
        && await self.snarkjs.groth16.verify(vkey, data.publicSignals, data.proof) === true;
      self.postMessage({ type: 'result', operation: 'verify', result });
    }
  } catch {
    // Witness calculators can include secret input values in diagnostics.
    self.postMessage({ type: 'error' });
  } finally {
    self.close();
  }
});
