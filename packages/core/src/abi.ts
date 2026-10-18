/**
 * Contract ABIs used by the client. Upstream Privacy Pools v1.3.0 signatures
 * (commit c312dcd58f6ad085204be61923c49f8065e4e9ae) and the INTERFACES.md adapters.
 */
const WITHDRAWAL_TUPLE = {
  type: "tuple",
  components: [
    { name: "processooor", type: "address" },
    { name: "data", type: "bytes" },
  ],
} as const;

const WITHDRAW_PROOF_TUPLE = {
  type: "tuple",
  components: [
    { name: "pA", type: "uint256[2]" },
    { name: "pB", type: "uint256[2][2]" },
    { name: "pC", type: "uint256[2]" },
    { name: "pubSignals", type: "uint256[8]" },
  ],
} as const;

const RAGEQUIT_PROOF_TUPLE = {
  type: "tuple",
  components: [
    { name: "pA", type: "uint256[2]" },
    { name: "pB", type: "uint256[2][2]" },
    { name: "pC", type: "uint256[2]" },
    { name: "pubSignals", type: "uint256[4]" },
  ],
} as const;

export const ENTRYPOINT_ABI = [
  { type: "function", name: "deposit", stateMutability: "payable", inputs: [{ name: "_precommitment", type: "uint256" }], outputs: [{ name: "_commitment", type: "uint256" }] },
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_asset", type: "address" },
      { name: "_value", type: "uint256" },
      { name: "_precommitment", type: "uint256" },
    ],
    outputs: [{ name: "_commitment", type: "uint256" }],
  },
  {
    type: "function",
    name: "relay",
    stateMutability: "nonpayable",
    inputs: [
      { ...WITHDRAWAL_TUPLE, name: "_withdrawal" },
      { ...WITHDRAW_PROOF_TUPLE, name: "_proof" },
      { name: "_scope", type: "uint256" },
    ],
    outputs: [],
  },
  { type: "function", name: "latestRoot", stateMutability: "view", inputs: [], outputs: [{ name: "_root", type: "uint256" }] },
  { type: "function", name: "scopeToPool", stateMutability: "view", inputs: [{ name: "_scope", type: "uint256" }], outputs: [{ name: "_pool", type: "address" }] },
  { type: "function", name: "usedPrecommitments", stateMutability: "view", inputs: [{ name: "_precommitment", type: "uint256" }], outputs: [{ name: "_used", type: "bool" }] },
  {
    type: "function",
    name: "assetConfig",
    stateMutability: "view",
    inputs: [{ name: "_asset", type: "address" }],
    outputs: [
      { name: "_pool", type: "address" },
      { name: "_minimumDepositAmount", type: "uint256" },
      { name: "_vettingFeeBPS", type: "uint256" },
      { name: "_maxRelayFeeBPS", type: "uint256" },
    ],
  },
] as const;

export const PRIVACY_POOL_ABI = [
  { type: "function", name: "SCOPE", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "ASSET", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "currentRoot", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "currentTreeSize", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "nullifierHashes", stateMutability: "view", inputs: [{ name: "_nullifierHash", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "ragequit", stateMutability: "nonpayable", inputs: [{ ...RAGEQUIT_PROOF_TUPLE, name: "_proof" }], outputs: [] },
  {
    type: "event",
    name: "Deposited",
    inputs: [
      { name: "_depositor", type: "address", indexed: true },
      { name: "_commitment", type: "uint256", indexed: false },
      { name: "_label", type: "uint256", indexed: false },
      { name: "_value", type: "uint256", indexed: false },
      { name: "_precommitmentHash", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Withdrawn",
    inputs: [
      { name: "_processooor", type: "address", indexed: true },
      { name: "_value", type: "uint256", indexed: false },
      { name: "_spentNullifier", type: "uint256", indexed: false },
      { name: "_newCommitment", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Ragequit",
    inputs: [
      { name: "_ragequitter", type: "address", indexed: true },
      { name: "_commitment", type: "uint256", indexed: false },
      { name: "_label", type: "uint256", indexed: false },
      { name: "_value", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "LeafInserted",
    inputs: [
      { name: "_index", type: "uint256", indexed: false },
      { name: "_leaf", type: "uint256", indexed: false },
      { name: "_root", type: "uint256", indexed: false },
    ],
  },
] as const;

export const HUSH_SEND_ABI = [
  {
    type: "function",
    name: "send",
    stateMutability: "payable",
    inputs: [
      { name: "pool", type: "address" },
      { ...WITHDRAWAL_TUPLE, name: "withdrawal" },
      { ...WITHDRAW_PROOF_TUPLE, name: "proof" },
    ],
    outputs: [],
  },
] as const;

export const GIFT_ADAPTER_ABI = [
  {
    type: "function",
    name: "gift",
    stateMutability: "nonpayable",
    inputs: [
      { name: "pool", type: "address" },
      { ...WITHDRAWAL_TUPLE, name: "w" },
      { ...WITHDRAW_PROOF_TUPLE, name: "p" },
    ],
    outputs: [],
  },
] as const;

export const ERC20_ABI = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
] as const;

export const ERC6538_REGISTRY_ABI = [
  { type: "function", name: "registerKeys", stateMutability: "nonpayable", inputs: [{ name: "schemeId", type: "uint256" }, { name: "stealthMetaAddress", type: "bytes" }], outputs: [] },
  { type: "function", name: "stealthMetaAddressOf", stateMutability: "view", inputs: [{ name: "registrant", type: "address" }, { name: "schemeId", type: "uint256" }], outputs: [{ name: "", type: "bytes" }] },
] as const;

export const ERC5564_ANNOUNCER_ABI = [
  {
    type: "function",
    name: "announce",
    stateMutability: "nonpayable",
    inputs: [
      { name: "schemeId", type: "uint256" },
      { name: "stealthAddress", type: "address" },
      { name: "ephemeralPubKey", type: "bytes" },
      { name: "metadata", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "Announcement",
    inputs: [
      { name: "schemeId", type: "uint256", indexed: true },
      { name: "stealthAddress", type: "address", indexed: true },
      { name: "caller", type: "address", indexed: true },
      { name: "ephemeralPubKey", type: "bytes", indexed: false },
      { name: "metadata", type: "bytes", indexed: false },
    ],
  },
] as const;

export const CHAINLINK_FEED_ABI = [
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint8" }] },
  {
    type: "function",
    name: "latestRoundData",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
] as const;
