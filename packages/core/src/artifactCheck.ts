import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { ArtifactHashMismatchError, CoreError } from "./errors.js";
import type { Groth16VerificationKey } from "./prover.js";

/** Browser-safe half of the artifact loader: hash checks and vkey parsing, no file system. */
export interface ArtifactEntry {
  readonly sha256: string;
  readonly bytes: number;
  readonly url: string;
}

export interface Manifest {
  readonly upstream: {
    readonly repository: string;
    readonly version: string;
    readonly commit: string;
    readonly license: string;
  };
  readonly treeDepth: number;
  readonly artifacts: Readonly<Record<ArtifactName, ArtifactEntry>>;
}

export interface CircuitFiles {
  readonly wasm: Uint8Array;
  readonly zkey: Uint8Array;
  readonly vkey: Groth16VerificationKey;
}

export interface CircuitArtifacts {
  readonly manifest: Manifest;
  readonly commitment: CircuitFiles;
  readonly withdraw: CircuitFiles;
}

export const ARTIFACT_NAMES = [
  "commitment.wasm",
  "commitment.zkey",
  "commitment.vkey",
  "withdraw.wasm",
  "withdraw.zkey",
  "withdraw.vkey",
] as const;

export type ArtifactName = (typeof ARTIFACT_NAMES)[number];

export function parseManifest(raw: unknown): Manifest {
  if (!isRecord(raw) || !isRecord(raw.artifacts) || !isRecord(raw.upstream)) {
    throw new CoreError("manifest", "artifact manifest is incomplete");
  }
  for (const name of ARTIFACT_NAMES) {
    const entry = raw.artifacts[name];
    if (!isRecord(entry) || typeof entry.sha256 !== "string" || typeof entry.bytes !== "number") {
      throw new CoreError("manifest", `artifact manifest is missing ${name}`);
    }
  }
  return raw as unknown as Manifest;
}

export function verifyArtifactBytes(name: ArtifactName, bytes: Uint8Array, manifest: Manifest): Uint8Array {
  const entry = manifest.artifacts[name];
  if (bytesToHex(sha256(bytes)) !== entry.sha256 || bytes.byteLength !== entry.bytes) throw new ArtifactHashMismatchError(name);
  return bytes;
}

/** Check every file against the manifest, then parse the verification keys. */
export function assembleCircuitArtifacts(manifest: Manifest, files: Readonly<Record<ArtifactName, Uint8Array>>): CircuitArtifacts {
  for (const name of ARTIFACT_NAMES) verifyArtifactBytes(name, files[name], manifest);
  return {
    manifest,
    commitment: { wasm: files["commitment.wasm"], zkey: files["commitment.zkey"], vkey: parseVkey(files["commitment.vkey"], 4) },
    withdraw: { wasm: files["withdraw.wasm"], zkey: files["withdraw.zkey"], vkey: parseVkey(files["withdraw.vkey"], 8) },
  };
}

function parseVkey(bytes: Uint8Array, nPublic: number): Groth16VerificationKey {
  const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!isRecord(parsed) || parsed.protocol !== "groth16" || parsed.curve !== "bn128" || parsed.nPublic !== nPublic) {
    throw new CoreError("vkey", "verification key does not match the published circuit");
  }
  return parsed as unknown as Groth16VerificationKey;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
