/**
 * Launch contract ABIs (contracts/src/launch: SealedSale, LaunchFactory, LaunchAdapter).
 * Only the members the client and services use; signatures copied from the Solidity sources.
 */
const BID_TUPLE = {
  type: "tuple",
  components: [
    { name: "escrow", type: "uint128" },
    { name: "prefix", type: "uint256" },
    { name: "recipient", type: "address" },
    { name: "entry", type: "uint32" },
    { name: "bidId", type: "uint32" },
    { name: "status", type: "uint8" },
    { name: "vaultFunded", type: "bool" },
    { name: "refundsHash", type: "bytes32" },
  ],
} as const;

const RESULT_TUPLE = {
  type: "tuple",
  components: [
    { name: "clearingPrice", type: "uint256" },
    { name: "undersubscribed", type: "bool" },
    { name: "totalDemand", type: "uint256" },
    { name: "demandAbove", type: "uint256" },
    { name: "marginalDemand", type: "uint256" },
    { name: "marginalRemaining", type: "uint256" },
    { name: "tokensSold", type: "uint256" },
    { name: "attemptedRaise", type: "uint256" },
  ],
} as const;

const view = (name: string, type: string) => ({ type: "function", name, stateMutability: "view", inputs: [], outputs: [{ name: "", type }] }) as const;

const REVEAL_INPUTS = [
  { name: "price", type: "uint256" },
  { name: "maxSpend", type: "uint256" },
  { name: "recipient", type: "address" },
  { name: "precommitments", type: "uint256[]" },
  { name: "salt", type: "bytes32" },
] as const;

export const SEALED_SALE_ABI = [
  view("saleId", "uint256"),
  view("factory", "address"),
  view("creator", "address"),
  view("token", "address"),
  view("treasury", "address"),
  view("quoteAsset", "address"),
  view("saleSupply", "uint256"),
  view("lpTokenReserve", "uint256"),
  view("floorPrice", "uint256"),
  view("minRaise", "uint256"),
  view("minEscrow", "uint256"),
  view("commitEnd", "uint64"),
  view("revealEnd", "uint64"),
  view("liquidityBps", "uint16"),
  view("maxBids", "uint32"),
  view("bidCount", "uint256"),
  view("totalEscrow", "uint256"),
  view("outcome", "uint8"),
  view("finalizedAt", "uint64"),
  view("raise", "uint256"),
  view("fee", "uint256"),
  view("tokensBurned", "uint256"),
  view("creatorProceeds", "uint256"),
  view("lpPool", "address"),
  view("lpTokenId", "uint256"),
  view("entryCount", "uint256"),
  view("liveBidCount", "uint256"),
  view("privateMinEscrow", "uint256"),
  { type: "function", name: "units", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256[5]" }] },
  { type: "function", name: "entryAt", stateMutability: "view", inputs: [{ name: "index", type: "uint256" }], outputs: [{ name: "price", type: "uint256" }, { name: "qty", type: "uint256" }] },
  { type: "function", name: "bidInfo", stateMutability: "view", inputs: [{ name: "commitment", type: "bytes32" }], outputs: [BID_TUPLE] },
  { type: "function", name: "allocationOf", stateMutability: "view", inputs: [{ name: "commitment", type: "bytes32" }], outputs: [{ name: "tokens", type: "uint256" }, { name: "paid", type: "uint256" }] },
  { type: "function", name: "clearingResult", stateMutability: "view", inputs: [], outputs: [RESULT_TUPLE] },
  { type: "function", name: "previewFinalize", stateMutability: "view", inputs: [{ name: "clearingPrice", type: "uint256" }], outputs: [RESULT_TUPLE] },
  {
    type: "function",
    name: "computeCommitment",
    stateMutability: "view",
    inputs: [
      { name: "price", type: "uint256" },
      { name: "maxSpend", type: "uint256" },
      { name: "recipient", type: "address" },
      { name: "refundsHash", type: "bytes32" },
      { name: "salt", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "bytes32" }],
  },
  { type: "function", name: "commit", stateMutability: "payable", inputs: [{ name: "commitment", type: "bytes32" }, { name: "amount", type: "uint256" }], outputs: [{ name: "bidId", type: "uint256" }] },
  { type: "function", name: "reveal", stateMutability: "nonpayable", inputs: REVEAL_INPUTS, outputs: [{ name: "commitment", type: "bytes32" }] },
  { type: "function", name: "lateReveal", stateMutability: "nonpayable", inputs: REVEAL_INPUTS, outputs: [{ name: "commitment", type: "bytes32" }] },
  { type: "function", name: "finalize", stateMutability: "nonpayable", inputs: [{ name: "clearingPrice", type: "uint256" }], outputs: [] },
  { type: "function", name: "claim", stateMutability: "nonpayable", inputs: [{ name: "commitment", type: "bytes32" }, { name: "precommitments", type: "uint256[]" }], outputs: [] },
  { type: "function", name: "claimToPayout", stateMutability: "nonpayable", inputs: [{ name: "commitment", type: "bytes32" }], outputs: [] },
  { type: "function", name: "claimProceeds", stateMutability: "nonpayable", inputs: [], outputs: [{ name: "amount", type: "uint256" }] },
  { type: "function", name: "collectFees", stateMutability: "nonpayable", inputs: [{ name: "saleId_", type: "uint256" }], outputs: [] },
  {
    type: "event",
    name: "BidClaimed",
    inputs: [
      { name: "commitment", type: "bytes32", indexed: true },
      { name: "tokens", type: "uint256", indexed: false },
      { name: "spend", type: "uint256", indexed: false },
      { name: "refund", type: "uint256", indexed: false },
      { name: "notes", type: "uint256", indexed: false },
      { name: "dust", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "VaultDeposit",
    inputs: [
      { name: "precommitment", type: "uint256", indexed: true },
      { name: "unit", type: "uint256", indexed: false },
      { name: "gross", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "BidValidity",
    inputs: [
      { name: "commitment", type: "bytes32", indexed: true },
      { name: "reason", type: "uint8", indexed: false },
      { name: "quantity", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "SaleCleared",
    inputs: [
      { name: "saleId", type: "uint256", indexed: true },
      { name: "clearingPrice", type: "uint256", indexed: false },
      { name: "tokensSold", type: "uint256", indexed: false },
      { name: "raise", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "LiquidityAdded",
    inputs: [
      { name: "saleId", type: "uint256", indexed: true },
      { name: "pool", type: "address", indexed: true },
      { name: "positionId", type: "uint256", indexed: false },
      { name: "tokenAmount", type: "uint256", indexed: false },
      { name: "quoteAmount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "BidDisplaced",
    inputs: [
      { name: "saleId", type: "uint256", indexed: true },
      { name: "commitment", type: "bytes32", indexed: true },
      { name: "payer", type: "address", indexed: false },
      { name: "escrow", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "FeesCollected",
    inputs: [
      { name: "saleId", type: "uint256", indexed: true },
      { name: "token0", type: "address", indexed: false },
      { name: "token1", type: "address", indexed: false },
      { name: "amount0", type: "uint256", indexed: false },
      { name: "amount1", type: "uint256", indexed: false },
    ],
  },
] as const;

const LAUNCH_PARAMS_TUPLE = {
  type: "tuple",
  components: [
    { name: "name", type: "string" },
    { name: "symbol", type: "string" },
    { name: "quoteAsset", type: "address" },
    { name: "saleSupply", type: "uint256" },
    { name: "liquiditySupply", type: "uint256" },
    { name: "creatorSupply", type: "uint256" },
    { name: "floorPrice", type: "uint256" },
    { name: "minRaise", type: "uint256" },
    { name: "commitDuration", type: "uint64" },
    { name: "revealDuration", type: "uint64" },
    { name: "liquidityBps", type: "uint16" },
    { name: "vestingDuration", type: "uint64" },
    { name: "maxBids", type: "uint32" },
  ],
} as const;

export const LAUNCH_FACTORY_ABI = [
  view("saleCount", "uint256"),
  view("launchAdapter", "address"),
  view("usdt", "address"),
  view("treasury", "address"),
  { type: "function", name: "sales", stateMutability: "view", inputs: [{ name: "", type: "uint256" }], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "isSale", stateMutability: "view", inputs: [{ name: "sale", type: "address" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "validateParams", stateMutability: "view", inputs: [{ ...LAUNCH_PARAMS_TUPLE, name: "p" }], outputs: [] },
  { type: "function", name: "createSale", stateMutability: "nonpayable", inputs: [{ ...LAUNCH_PARAMS_TUPLE, name: "p" }], outputs: [{ name: "sale", type: "address" }, { name: "token", type: "address" }] },
  { type: "function", name: "collectFees", stateMutability: "nonpayable", inputs: [{ name: "saleId_", type: "uint256" }], outputs: [] },
  { type: "function", name: "creatorOf", stateMutability: "view", inputs: [{ name: "sale", type: "address" }], outputs: [{ name: "", type: "address" }] },
  {
    type: "function",
    name: "setProfile",
    stateMutability: "nonpayable",
    inputs: [
      { name: "sale", type: "address" },
      { name: "contentHash", type: "bytes32" },
      { name: "uri", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "profileOf",
    stateMutability: "view",
    inputs: [{ name: "sale", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "contentHash", type: "bytes32" },
          { name: "uri", type: "string" },
          { name: "updatedAt", type: "uint64" },
        ],
      },
    ],
  },
  {
    type: "event",
    name: "SaleProfileSet",
    inputs: [
      { name: "saleId", type: "uint256", indexed: true },
      { name: "sale", type: "address", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "contentHash", type: "bytes32", indexed: false },
      { name: "uri", type: "string", indexed: false },
    ],
  },
  { type: "error", name: "UnknownSale", inputs: [] },
  { type: "error", name: "NotSaleCreator", inputs: [] },
  { type: "error", name: "InvalidProfile", inputs: [] },
  {
    type: "event",
    name: "SaleCreated",
    inputs: [
      { name: "saleId", type: "uint256", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "quoteAsset", type: "address", indexed: false },
      { name: "tokensForSale", type: "uint256", indexed: false },
      { name: "floorPrice", type: "uint256", indexed: false },
      { name: "minRaise", type: "uint256", indexed: false },
      { name: "commitEnd", type: "uint64", indexed: false },
      { name: "revealEnd", type: "uint64", indexed: false },
    ],
  },
  {
    type: "event",
    name: "SaleDeployed",
    inputs: [
      { name: "saleId", type: "uint256", indexed: true },
      { name: "sale", type: "address", indexed: true },
      { name: "vesting", type: "address", indexed: false },
    ],
  },
] as const;

export const LAUNCH_ADAPTER_ABI = [
  {
    type: "function",
    name: "fundBid",
    stateMutability: "nonpayable",
    inputs: [
      { name: "pool", type: "address" },
      {
        name: "withdrawal",
        type: "tuple",
        components: [
          { name: "processooor", type: "address" },
          { name: "data", type: "bytes" },
        ],
      },
      {
        name: "proof",
        type: "tuple",
        components: [
          { name: "pA", type: "uint256[2]" },
          { name: "pB", type: "uint256[2][2]" },
          { name: "pC", type: "uint256[2]" },
          { name: "pubSignals", type: "uint256[8]" },
        ],
      },
    ],
    outputs: [{ name: "bidId", type: "uint256" }],
  },
  {
    type: "event",
    name: "BidFunded",
    inputs: [
      { name: "sale", type: "address", indexed: true },
      { name: "bidId", type: "uint256", indexed: true },
      { name: "commitment", type: "bytes32", indexed: true },
      { name: "escrow", type: "uint256", indexed: false },
      { name: "relayFee", type: "uint256", indexed: false },
    ],
  },
] as const;

export const ERC20_METADATA_ABI = [view("name", "string"), view("symbol", "string"), view("totalSupply", "uint256"), view("decimals", "uint8")] as const;

/** `LaunchAdapter.FundData` = abi.encode(FundData): all-static tuple, exactly four words. */
export const FUND_DATA_ABI = [
  {
    type: "tuple",
    components: [
      { name: "sale", type: "address" },
      { name: "commitment", type: "bytes32" },
      { name: "feeRecipient", type: "address" },
      { name: "relayFee", type: "uint256" },
    ],
  },
] as const;
