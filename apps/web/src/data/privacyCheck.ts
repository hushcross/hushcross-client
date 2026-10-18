/**
 * Privacy Check (SPEC 2.1). The rules and default thresholds live in @hushcross/core;
 * this module keeps the web import path stable.
 */
export {
  DEFAULT_THRESHOLDS,
  assessPrivacy,
  type FindingCode,
  type FindingSeverity,
  type PrivacyAssessment,
  type PrivacyContext,
  type PrivacyFinding,
  type PrivacyLevel,
  type PrivacyThresholds,
  type RecipientFacts,
  type SpentNoteFacts,
} from '@hushcross/core';
