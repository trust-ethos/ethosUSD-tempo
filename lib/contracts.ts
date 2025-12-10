// Contract addresses on Tempo Testnet
export const CONTRACTS = {
  TIP20_FACTORY: "0x20c0000000000000000000000000000000000000" as const,
  TIP403_REGISTRY: "0x403c000000000000000000000000000000000000" as const,
  // ethosUSD token - deployed via deploy:token script
  ETHOS_USD_TOKEN: (Deno.env.get("ETHOS_USD_TOKEN") || "0x20c0000000000000000000000000000000000726") as `0x${string}`,
  // Policy ID created via deploy script (145 = full Ethos whitelist)
  POLICY_ID: BigInt(Deno.env.get("ETHOS_POLICY_ID") || "145"),
} as const;

// Quote token for USD-denominated stablecoins (AlphaUSD on testnet)
export const ALPHA_USD = "0x20c0000000000000000000000000000000000001" as const;

// TIP20Factory ABI (subset needed for token creation)
export const TIP20_FACTORY_ABI = [
  {
    name: "createToken",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "name", type: "string" },
      { name: "symbol", type: "string" },
      { name: "currency", type: "string" },
      { name: "quoteToken", type: "address" },
      { name: "admin", type: "address" },
    ],
    outputs: [{ name: "token", type: "address" }],
  },
  {
    name: "tokenIdCounter",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "isTIP20",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    name: "TokenCreated",
    type: "event",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "id", type: "uint256", indexed: true },
      { name: "name", type: "string", indexed: false },
      { name: "symbol", type: "string", indexed: false },
      { name: "currency", type: "string", indexed: false },
      { name: "quoteToken", type: "address", indexed: true },
      { name: "admin", type: "address", indexed: false },
    ],
  },
] as const;

// TIP20 Token ABI (subset needed for operations)
export const TIP20_ABI = [
  {
    name: "name",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    name: "symbol",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    name: "totalSupply",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    name: "transferWithMemo",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "memo", type: "bytes32" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    name: "mint",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "changeTransferPolicyId",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "policyId", type: "uint64" }],
    outputs: [],
  },
  {
    name: "transferPolicyId",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint64" }],
  },
  // Role-based access control
  {
    name: "ISSUER_ROLE",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bytes32" }],
  },
  {
    name: "grantRole",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "role", type: "bytes32" },
      { name: "account", type: "address" },
    ],
    outputs: [],
  },
  {
    name: "hasRole",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "role", type: "bytes32" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    name: "Transfer",
    type: "event",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
  {
    name: "TransferWithMemo",
    type: "event",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
      { name: "memo", type: "bytes32", indexed: false },
    ],
  },
] as const;

// TIP403 Registry ABI
export const TIP403_REGISTRY_ABI = [
  {
    name: "createPolicy",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "admin", type: "address" },
      { name: "policyType", type: "uint8" }, // 0 = WHITELIST, 1 = BLACKLIST
    ],
    outputs: [{ name: "newPolicyId", type: "uint64" }],
  },
  {
    name: "createPolicyWithAccounts",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "admin", type: "address" },
      { name: "policyType", type: "uint8" },
      { name: "accounts", type: "address[]" },
    ],
    outputs: [{ name: "newPolicyId", type: "uint64" }],
  },
  {
    name: "modifyPolicyWhitelist",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "policyId", type: "uint64" },
      { name: "account", type: "address" },
      { name: "allowed", type: "bool" },
    ],
    outputs: [],
  },
  {
    name: "modifyPolicyBlacklist",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "policyId", type: "uint64" },
      { name: "account", type: "address" },
      { name: "restricted", type: "bool" },
    ],
    outputs: [],
  },
  {
    name: "isAuthorized",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "policyId", type: "uint64" },
      { name: "user", type: "address" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    name: "policyIdCounter",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint64" }],
  },
  {
    name: "policyData",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "policyId", type: "uint64" }],
    outputs: [
      { name: "policyType", type: "uint8" },
      { name: "admin", type: "address" },
    ],
  },
  {
    name: "PolicyCreated",
    type: "event",
    inputs: [
      { name: "policyId", type: "uint64", indexed: true },
      { name: "updater", type: "address", indexed: true },
      { name: "policyType", type: "uint8", indexed: false },
    ],
  },
  {
    name: "WhitelistUpdated",
    type: "event",
    inputs: [
      { name: "policyId", type: "uint64", indexed: true },
      { name: "updater", type: "address", indexed: true },
      { name: "account", type: "address", indexed: true },
      { name: "allowed", type: "bool", indexed: false },
    ],
  },
] as const;

// Policy types
export const POLICY_TYPE = {
  WHITELIST: 0,
  BLACKLIST: 1,
} as const;

