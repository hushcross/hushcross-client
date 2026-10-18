export class CoreError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

export class RelayFeeAboveCapError extends CoreError {
  readonly bps: bigint;
  readonly maxBps: bigint;

  constructor(bps: bigint, maxBps: bigint) {
    super("relay_fee_above_cap", `relay fee ${bps} bps exceeds ${maxBps}`);
    this.bps = bps;
    this.maxBps = maxBps;
  }
}

export class RecoveryMismatchError extends CoreError {
  constructor(message: string) {
    super("recovery_mismatch", message);
  }
}

export class DuplicatePrecommitmentError extends CoreError {
  constructor(poolId: string) {
    super("duplicate_precommitment", `duplicate precommitment in pool ${poolId}`);
  }
}

export class DuplicateNullifierError extends CoreError {
  constructor(poolId: string) {
    super("duplicate_nullifier", `duplicate spent nullifier in pool ${poolId}`);
  }
}

export class ArtifactHashMismatchError extends CoreError {
  constructor(fileName: string) {
    super("artifact_hash_mismatch", `sha256 mismatch for ${fileName}`);
  }
}
