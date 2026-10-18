import type { Groth16Proof, Groth16Prover } from "./prover.js";

/**
 * Adapts an injected Groth16 proving module (the GPL-3.0 prover is loaded by the caller at
 * runtime and is never bundled or imported here) to `Groth16Prover`. Files are passed in
 * memory (`{ type: "mem" }`), which the prover's file layer accepts in browsers and Node.
 */
export interface Groth16ModuleLike {
  readonly groth16: {
    fullProve(
      input: Readonly<Record<string, string | readonly string[]>>,
      wasm: { readonly type: "mem"; readonly data: Uint8Array },
      zkey: { readonly type: "mem"; readonly data: Uint8Array },
    ): Promise<{ readonly proof: unknown; readonly publicSignals: readonly unknown[] }>;
    verify(vkey: unknown, publicSignals: readonly string[], proof: unknown): Promise<boolean>;
  };
}

export function proverFromGroth16Module(module: Groth16ModuleLike): Groth16Prover {
  return {
    async prove({ wasm, zkey, witness }) {
      const result = await module.groth16.fullProve(witness, { type: "mem", data: wasm }, { type: "mem", data: zkey });
      return { proof: normalizeProof(result.proof), publicSignals: result.publicSignals.map(scalar) };
    },
    verify({ vkey, publicSignals, proof }) {
      return module.groth16.verify(vkey, publicSignals, proof);
    },
  };
}

function normalizeProof(raw: unknown): Groth16Proof {
  if (typeof raw !== "object" || raw === null) throw new Error("prover returned no proof");
  const proof = raw as { pi_a?: unknown; pi_b?: unknown; pi_c?: unknown };
  const list = (value: unknown, length: number, label: string): unknown[] => {
    if (!Array.isArray(value) || value.length < length) throw new Error(`prover ${label} is short`);
    return value;
  };
  const a = list(proof.pi_a, 3, "pi_a");
  const b = list(proof.pi_b, 3, "pi_b").map((row, i) => list(row, 2, `pi_b${i}`));
  const c = list(proof.pi_c, 3, "pi_c");
  return {
    pi_a: [scalar(a[0]), scalar(a[1]), scalar(a[2])],
    pi_b: [
      [scalar(b[0]?.[0]), scalar(b[0]?.[1])],
      [scalar(b[1]?.[0]), scalar(b[1]?.[1])],
      [scalar(b[2]?.[0]), scalar(b[2]?.[1])],
    ],
    pi_c: [scalar(c[0]), scalar(c[1]), scalar(c[2])],
    protocol: "groth16",
    curve: "bn128",
  };
}

function scalar(value: unknown): string {
  if (typeof value === "string" || typeof value === "bigint" || typeof value === "number") return value.toString();
  throw new Error("prover returned a non-scalar proof element");
}
