/**
 * Browser-safe entry: everything except the Node file-system artifact loader.
 * `index.ts` re-exports this plus the Node-only pieces.
 */
export {
  ArtifactHashMismatchError,
  CoreError,
  DuplicateNullifierError,
  DuplicatePrecommitmentError,
  RecoveryMismatchError,
  RelayFeeAboveCapError,
} from "./errors.js";
export {
  CIRCUIT_TREE_DEPTH,
  MAX_NOTE_VALUE,
  SECP256K1_ORDER,
  SNARK_SCALAR_FIELD,
  bigintFromBytes,
  bigintToBytes,
  fieldFromBytes,
  requireField,
  requireUint256,
  secpScalarFromBytes,
} from "./field.js";
export { concatBytes, fromBase64Url, randomBytes, toBase64Url } from "./bytes.js";
export { hkdfSha256 } from "./kdf.js";
export { poseidon1, poseidon2, poseidon3, poseidon4 } from "./poseidon.js";
export {
  deriveChangeSecrets,
  deriveDepositSecrets,
  deriveIdentityKey,
  deriveMasterKeys,
  generateRecoveryPhrase,
  validateRecoveryPhrase,
  type MasterKeys,
  type NoteSecrets,
} from "./keys.js";
export { commitmentOf, nullifierHash, precommitmentHash, type Commitment } from "./commitment.js";
export { createNoteTree, inclusionAt, padSiblings, type InclusionWitness } from "./merkle.js";
export {
  depositLabel,
  encodeDepositLabel,
  encodeWithdrawalContext,
  withdrawalContext,
  type WithdrawalContextInput,
} from "./context.js";
export {
  ARTIFACT_NAMES,
  assembleCircuitArtifacts,
  parseManifest,
  verifyArtifactBytes,
  type ArtifactEntry,
  type ArtifactName,
  type CircuitArtifacts,
  type CircuitFiles,
  type Manifest,
} from "./artifactCheck.js";
export {
  formatProofForSolidity,
  type Groth16Proof,
  type Groth16Prover,
  type Groth16VerificationKey,
  type ProofBundle,
  type ProveRequest,
  type SolidityProof,
  type VerifyRequest,
} from "./prover.js";
export { proverFromGroth16Module, type Groth16ModuleLike } from "./groth16Module.js";
export {
  proveCommitment,
  proveWithdrawal,
  proveWithdrawalWithWitnesses,
  type CommitmentProofInput,
  type WithdrawalProofInput,
  type WithdrawalWitnessInput,
} from "./proof.js";
export {
  deriveStealthKey,
  formatMetaAddress,
  generateStealthPayment,
  parseMetaAddress,
  scanAnnouncement,
  scanAnnouncements,
  stealthMetaFromMaster,
  type MetaAddress,
  type StealthAnnouncement,
  type StealthDiscovery,
  type StealthPayment,
} from "./stealth.js";
export {
  BNB_UNITS,
  BPS_DENOMINATOR,
  MAX_RELAY_FEE_BPS,
  USDT_UNITS,
  VETTING_FEE_BPS,
  grossForNet,
  netAfterFee,
  relayFeeBps,
  splitIntoUnits,
  type RelayFeeInput,
  type UnitCount,
  type UnitSplit,
} from "./units.js";
export {
  RECOVERY_GAP_LIMIT,
  recoverNotes,
  type DepositRecord,
  type ExitRecord,
  type NoteStatus,
  type RecoveredNote,
  type RecoveryInput,
  type RecoveryPool,
  type RecoveryResult,
  type WithdrawalRecord,
} from "./recovery.js";
export {
  DEFAULT_THRESHOLDS,
  assertThresholds,
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
} from "./privacy.js";
export {
  GIFT_MAX_PACKETS,
  GIFT_MAX_UNITS,
  GIFT_PACKETS_PER_CALL,
  GIFT_SECRET_BYTES,
  cryptoRandom,
  deriveGiftChange,
  deriveGiftKeys,
  deriveGiftPacket,
  generateGiftSecret,
  giftPacketRefs,
  personalPacketSecret,
  planReclaim,
  seededRandom,
  splitRedPacket,
  type GiftKeys,
  type GiftMode,
  type GiftPacketRef,
  type GiftPacketState,
  type RandomSource,
} from "./gift.js";
export { GIFT_LINK_VERSION, GIFT_MEMO_MAX_CHARS, decodeGiftLink, encodeGiftLink, giftLinkPath, type GiftLinkPayload } from "./giftLink.js";
export {
  STEALTH_SCHEME_ID,
  SWEEP_APPROVE_GAS,
  SWEEP_NATIVE_GAS,
  SWEEP_TOKEN_DEPOSIT_GAS,
  buildStealthSendFields,
  encodeRegisterKeys,
  metaAddressBytes,
  metaFromRegistryBytes,
  planSweep,
  scanIndexerAnnouncements,
  type IndexerAnnouncement,
  type OwnedAnnouncement,
  type StealthSendFields,
  type SweepInput,
  type SweepPlan,
  type TxRequest,
} from "./hushId.js";
export {
  PBKDF2_MIN_ITERATIONS,
  VAULT_FORMAT,
  createBackupFile,
  openBackupFile,
  openWithPassword,
  openVault,
  openWithPrf,
  parseEnvelope,
  sealWithPassword,
  sealWithPrf,
  serializeEnvelope,
  type AccountSecrets,
  type BackupFileContents,
  type JsonValue,
  type OpenVault,
  type StoredGift,
  type VaultEnvelope,
  type VaultKdf,
  type VaultSecret,
} from "./vaultStore.js";
export {
  CHAINLINK_FEED_ABI,
  ENTRYPOINT_ABI,
  ERC20_ABI,
  ERC5564_ANNOUNCER_ABI,
  ERC6538_REGISTRY_ABI,
  GIFT_ADAPTER_ABI,
  HUSH_SEND_ABI,
  PRIVACY_POOL_ABI,
} from "./abi.js";
export {
  GIFT_DATA_ABI,
  RELAY_DATA_ABI,
  SEND_DATA_ABI,
  decodeGiftData,
  decodeRelayData,
  decodeSendData,
  encodeGiftData,
  encodeRelayData,
  encodeSendData,
  type GiftData,
  type RelayData,
  type SendData,
  type Withdrawal,
  type WithdrawTarget,
} from "./withdrawData.js";
export { quoteRelayFee, type ChainlinkPrice, type RelayQuote, type RelayQuoteInput } from "./relayFee.js";
export {
  FINAL_JOB_STATES,
  FINAL_TASK_STATES,
  IndexerClient,
  parseIndexedSale,
  type IndexedSale,
  type RelayTaskView,
  RelayClient,
  ScreenClient,
  ServiceError,
  type AnnouncementPage,
  type AspInclusion,
  type FetchLike,
  type RelayInfo,
  type RelayJobView,
  type RelayWithdrawRequest,
  type RequestInitLike,
  type ResponseLike,
  type ScreenHealth,
  type ScreenPoolHealth,
  type ScreenStatus,
} from "./services.js";
export { NATIVE_ASSET, loadDeployments, parseDeployments, type BookPairDeployment, type Deployments, type DeploymentsSource, type PoolAsset, type PoolDeployment } from "./deployments.js";
export { planDeposit, planPrecommitmentDeposits, type DepositAsset, type DepositPlan, type DepositPlanInput, type PlannedNote, type PrecommitmentDeposit } from "./flows/deposit.js";
export { aspRootMatches, buildRelayRequest, proveSpend, stateInclusion, type SpendInput, type SpendNote, type SpendProof } from "./flows/spend.js";
export {
  buildGiftClaimToAddress,
  buildGiftClaimToVault,
  buildGiftFundingWithdrawal,
  planGiftVaultFunding,
  withdrawnFor,
  type FundingNote,
  type GiftClaimToVault,
  type GiftFundingCall,
  type GiftFundingInput,
  type GiftFundingPlan,
} from "./flows/gift.js";
export { findGiftPacketStates, scanAccount, type GiftPacketStatus, type PoolEventSource, type PoolEvents, type ScanPool } from "./flows/recovery.js";
export {
  deriveIdentity,
  nameDomain,
  normalizeShortName,
  parseNameRecord,
  registryDomain,
  signNameRecord,
  signRegisterKeys,
  verifyNameRecord,
  NAME_RECORD_TYPES,
  REGISTRY_ENTRY_TYPES,
  SHORT_NAME_PATTERN,
  type Identity,
  type NameRecord,
  type RegisterKeysRequest,
} from "./identity.js";
export { GAS_DROP_DEFAULT_MIN_USDT, gasDropPolicy, quoteWithGasDrop, type GasDropAsset, type GasDropPolicy, type GasDropQuote, type GasDropReason } from "./gasDrop.js";
export { ERC20_METADATA_ABI, FUND_DATA_ABI, LAUNCH_ADAPTER_ABI, LAUNCH_FACTORY_ABI, SEALED_SALE_ABI } from "./launch/abi.js";
export { LAUNCH_BID_TAG, MAX_REFUND_NOTES, MAX_UINT128, assertRevealable, launchBidCommitment, randomSalt, refundsHash, revealArgs, type LaunchBidPreimage } from "./launch/commitment.js";
export {
  buildFundBidWithdrawal,
  buildPublicCommitTxs,
  decodeFundData,
  encodeFundData,
  escrowUnitsFor,
  launchRelayFee,
  planPrivateBid,
  refundNoteBound,
  refundNotesAt,
  type EscrowUnits,
  type FundData,
  type PrivateBidPlan,
  type RefundNote,
} from "./launch/funding.js";
export {
  BID_STATUS,
  BID_VALIDITY,
  LAUNCH_BOUNDS,
  bidStatusName,
  buildClaimTx,
  buildCollectFeesTx,
  buildCreateSaleTx,
  buildFinalizeTx,
  buildLaunchParams,
  buildRevealTx,
  launchPhase,
  saleOutcomeName,
  type LaunchParamIssue,
  type LaunchParams,
  type LaunchPhase,
  type OnchainBidStatus,
  type SaleDraft,
  type SaleOutcome,
} from "./launch/sale.js";
export { SEALED_REVEAL_INFO, SEALED_REVEAL_SCHEME, SEALED_REVEAL_TAG, openReveal, sealReveal, sealedRevealAad, type SealedReveal } from "./launch/sealedReveal.js";
export { clearingPriceFromEntries } from "./launch/hint.js";
export {
  ONE_TIME_NATIVE_TRANSFER_GAS,
  ONE_TIME_TOKEN_TRANSFER_GAS,
  bookOneTimeRecords,
  giveOneTimeRecords,
  launchOneTimeRecords,
  listOneTimeAddresses,
  oneTimeTokens,
  oneTimeVaultOptions,
  planOneTimeTransfer,
  planOneTimeVaultMove,
  readOneTimeBalances,
  recoverOneTimeKey,
  signOneTimeTransfer,
  signOneTimeTx,
  type BalanceReader,
  type OneTimeAddress,
  type OneTimeBalance,
  type OneTimeRecord,
  type OneTimeSource,
  type OneTimeToken,
  type OneTimeTransferInput,
  type OneTimeTransferPlan,
  type SaleTokenInfo,
  type SignedOneTimeTx,
  type VaultMoveFacts,
} from "./oneTime.js";
export * from "./jobs/index.js";
export * from "./book/index.js";
export * from "./give/index.js";
export * from "./saleProfile/index.js";
