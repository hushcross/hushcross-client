import { CoreError } from "./errors.js";

/**
 * Privacy Check (SPEC 2.1): a local, advisory rating of a withdrawal-style action.
 * Pure function: callers gather chain facts, nothing is uploaded, nothing is blocked.
 */
export interface PrivacyThresholds {
  /** Later deposits below this are weak. */
  readonly anonymityWeak: number;
  /** Later deposits below this (and at least `anonymityWeak`) are fair. */
  readonly anonymityFair: number;
  readonly ageWeakMinutes: number;
  readonly ageFairHours: number;
  /** Prior withdrawals to the same fresh address at or above this are fair. */
  readonly repeatRecipient: number;
}

export const DEFAULT_THRESHOLDS: PrivacyThresholds = {
  anonymityWeak: 5,
  anonymityFair: 20,
  ageWeakMinutes: 30,
  ageFairHours: 6,
  repeatRecipient: 2,
};

export interface SpentNoteFacts {
  /** Deposits into the same pool after this note's deposit. */
  readonly mixedAfter: number;
  readonly ageMs: number;
  readonly amount: bigint;
  /** Total of the deposit transaction this note came from. */
  readonly depositTotal: bigint;
}

export type RecipientFacts =
  | { readonly kind: "stealth" }
  | { readonly kind: "none" }
  | {
      readonly kind: "address";
      readonly ownDepositAddress: boolean;
      readonly ownPublicWallet: boolean;
      /** `null` when the read-only RPC lookup could not confirm either way. */
      readonly firstFundingFromOwnDeposit: boolean | null;
    };

export interface PrivacyContext {
  readonly notes: readonly SpentNoteFacts[];
  readonly total: bigint;
  /** All units of one deposit leave together within a short window. */
  readonly sameDepositAllUnits: boolean;
  readonly recipient: RecipientFacts;
  readonly relayDelayMinutes: number;
  readonly priorWithdrawalsToRecipient: number;
}

export type PrivacyLevel = "good" | "fair" | "weak";
export type FindingSeverity = "weak" | "fair" | "info";

export type FindingCode =
  | "anonymity_low"
  | "time_short"
  | "amount_matches_deposit"
  | "drains_deposit"
  | "recipient_own_deposit"
  | "recipient_own_wallet"
  | "recipient_funded_by_you"
  | "recipient_unverified"
  | "no_delay"
  | "repeat_recipient";

export interface PrivacyFinding {
  readonly code: FindingCode;
  readonly severity: FindingSeverity;
  readonly vars: Readonly<Record<string, string | number>>;
}

export interface PrivacyAssessment {
  readonly level: PrivacyLevel;
  readonly findings: readonly PrivacyFinding[];
  /** Obviously deanonymising: ask for a second confirmation (never block). */
  readonly requiresConfirm: boolean;
}

const RANK: Readonly<Record<FindingSeverity, number>> = { weak: 0, fair: 1, info: 2 };

export function assertThresholds(th: PrivacyThresholds): void {
  const values = [th.anonymityWeak, th.anonymityFair, th.ageWeakMinutes, th.ageFairHours, th.repeatRecipient];
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new CoreError("privacy_threshold", "privacy threshold must be a non-negative number");
  }
  if (th.anonymityFair < th.anonymityWeak) {
    throw new CoreError("privacy_threshold", "fair anonymity threshold must not be below the weak threshold");
  }
}

export function assessPrivacy(ctx: PrivacyContext, th: PrivacyThresholds = DEFAULT_THRESHOLDS): PrivacyAssessment {
  assertThresholds(th);
  const findings: PrivacyFinding[] = [];
  const add = (code: FindingCode, severity: FindingSeverity, vars: Record<string, string | number> = {}): void => {
    findings.push({ code, severity, vars });
  };

  if (ctx.notes.length > 0) {
    const minMixed = Math.min(...ctx.notes.map((n) => n.mixedAfter));
    if (minMixed < th.anonymityWeak) add("anonymity_low", "weak", { n: minMixed });
    else if (minMixed < th.anonymityFair) add("anonymity_low", "fair", { n: minMixed });

    const minAgeMinutes = Math.floor(Math.min(...ctx.notes.map((n) => n.ageMs)) / 60_000);
    if (minAgeMinutes < th.ageWeakMinutes) add("time_short", "weak", { minutes: minAgeMinutes });
    else if (minAgeMinutes < th.ageFairHours * 60) add("time_short", "fair", { minutes: minAgeMinutes });

    if (ctx.notes.some((n) => n.depositTotal === ctx.total)) add("amount_matches_deposit", "fair");
  }
  if (ctx.sameDepositAllUnits) add("drains_deposit", "weak");

  let requiresConfirm = false;
  if (ctx.recipient.kind === "address") {
    if (ctx.recipient.ownDepositAddress) {
      add("recipient_own_deposit", "weak");
      requiresConfirm = true;
    } else if (ctx.recipient.ownPublicWallet) {
      add("recipient_own_wallet", "weak");
      requiresConfirm = true;
    } else if (ctx.recipient.firstFundingFromOwnDeposit === true) {
      add("recipient_funded_by_you", "weak");
    } else if (ctx.recipient.firstFundingFromOwnDeposit === null) {
      add("recipient_unverified", "info");
    }
    if (ctx.priorWithdrawalsToRecipient >= th.repeatRecipient) {
      add("repeat_recipient", "fair", { n: ctx.priorWithdrawalsToRecipient });
    }
  }
  if (ctx.recipient.kind !== "none" && ctx.relayDelayMinutes <= 0) add("no_delay", "fair");

  const sorted = [...findings].sort((a, b) => RANK[a.severity] - RANK[b.severity]);
  const level: PrivacyLevel = sorted.some((f) => f.severity === "weak")
    ? "weak"
    : sorted.some((f) => f.severity === "fair")
      ? "fair"
      : "good";
  return { level, findings: sorted, requiresConfirm };
}
