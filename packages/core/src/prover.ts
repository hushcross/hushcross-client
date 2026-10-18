/**
 * Groth16 prover injected by the caller.
 * The proving library is loaded by the caller at runtime and is not imported here.
 */
export interface Groth16Proof {
  readonly pi_a: readonly [string, string, string];
  readonly pi_b: readonly [
    readonly [string, string],
    readonly [string, string],
    readonly [string, string],
  ];
  readonly pi_c: readonly [string, string, string];
  readonly protocol: "groth16";
  readonly curve: "bn128";
}

export interface Groth16VerificationKey {
  readonly protocol: string;
  readonly curve: string;
  readonly nPublic: number;
  readonly vk_alpha_1: readonly string[];
  readonly vk_beta_2: readonly (readonly string[])[];
  readonly vk_gamma_2: readonly (readonly string[])[];
  readonly vk_delta_2: readonly (readonly string[])[];
  readonly vk_alphabeta_12: readonly unknown[];
  readonly IC: readonly (readonly string[])[];
}

export interface ProveRequest {
  readonly wasm: Uint8Array;
  readonly zkey: Uint8Array;
  readonly witness: Readonly<Record<string, string | readonly string[]>>;
}

export interface VerifyRequest {
  readonly vkey: Groth16VerificationKey;
  readonly publicSignals: readonly string[];
  readonly proof: Groth16Proof;
}

export interface Groth16Prover {
  prove(request: ProveRequest): Promise<{
    readonly proof: Groth16Proof;
    readonly publicSignals: readonly string[];
  }>;
  verify(request: VerifyRequest): Promise<boolean>;
}

export interface ProofBundle {
  readonly proof: Groth16Proof;
  readonly publicSignals: readonly string[];
}

export interface SolidityProof {
  readonly pA: readonly [bigint, bigint];
  readonly pB: readonly [readonly [bigint, bigint], readonly [bigint, bigint]];
  readonly pC: readonly [bigint, bigint];
  readonly pubSignals: readonly bigint[];
}

function element(values: readonly string[], index: number, label: string): string {
  const value = values[index];
  if (value === undefined) throw new Error(`proof ${label}[${index}] is missing`);
  return value;
}

/** Solidity's G2 points store Fp2 coefficients in the opposite order from the JSON proof. */
export function formatProofForSolidity(proof: Groth16Proof, publicSignals: readonly string[]): SolidityProof {
  return {
    pA: [BigInt(element(proof.pi_a, 0, "pi_a")), BigInt(element(proof.pi_a, 1, "pi_a"))],
    pB: [
      [BigInt(element(proof.pi_b[0], 1, "pi_b")), BigInt(element(proof.pi_b[0], 0, "pi_b"))],
      [BigInt(element(proof.pi_b[1], 1, "pi_b")), BigInt(element(proof.pi_b[1], 0, "pi_b"))],
    ],
    pC: [BigInt(element(proof.pi_c, 0, "pi_c")), BigInt(element(proof.pi_c, 1, "pi_c"))],
    pubSignals: publicSignals.map((signal) => BigInt(signal)),
  };
}
