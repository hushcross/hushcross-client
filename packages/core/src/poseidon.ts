import { poseidon1 as poseidon1Lite } from "poseidon-lite/poseidon1";
import { poseidon2 as poseidon2Lite } from "poseidon-lite/poseidon2";
import { poseidon3 as poseidon3Lite } from "poseidon-lite/poseidon3";
import { poseidon4 as poseidon4Lite } from "poseidon-lite/poseidon4";
import { requireField } from "./field.js";

function asField(value: bigint): bigint {
  return requireField("poseidon input", value);
}

/** Single-output Poseidon, matching circomlib `Poseidon(n)` and not the multi-output sponge. */
export function poseidon1(value: bigint): bigint {
  return poseidon1Lite([asField(value)]);
}

export function poseidon2(left: bigint, right: bigint): bigint {
  return poseidon2Lite([asField(left), asField(right)]);
}

export function poseidon3(first: bigint, second: bigint, third: bigint): bigint {
  return poseidon3Lite([asField(first), asField(second), asField(third)]);
}

export function poseidon4(a: bigint, b: bigint, c: bigint, d: bigint): bigint {
  return poseidon4Lite([asField(a), asField(b), asField(c), asField(d)]);
}
