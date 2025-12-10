import { createPublicClient, createWalletClient, http, type PublicClient, type WalletClient, type Chain, type Account } from "viem";
import * as viemAccounts from "npm:viem@2.21.54/accounts";

// Tempo Testnet chain definition
export const tempoTestnet: Chain = {
  id: 42429,
  name: "Tempo Testnet",
  nativeCurrency: {
    name: "USD",
    symbol: "USD",
    decimals: 6,
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.testnet.tempo.xyz"],
    },
  },
  blockExplorers: {
    default: {
      name: "Tempo Explorer",
      url: "https://explore.tempo.xyz",
    },
  },
  testnet: true,
};

// Default fee token (AlphaUSD on testnet)
export const DEFAULT_FEE_TOKEN = "0x20c0000000000000000000000000000000000001";

// Create a public client for reading from the chain
export function createTempoPublicClient(): PublicClient {
  return createPublicClient({
    chain: tempoTestnet,
    transport: http(),
  });
}

// Create a wallet client for signing transactions (server-side only)
export function createTempoWalletClient(privateKey: `0x${string}`): WalletClient {
  const account = viemAccounts.privateKeyToAccount(privateKey);
  return createWalletClient({
    account,
    chain: tempoTestnet,
    transport: http(),
  });
}

// Get the admin private key from environment
export function getAdminPrivateKey(): `0x${string}` {
  const key = Deno.env.get("ADMIN_PRIVATE_KEY");
  if (!key) {
    throw new Error("ADMIN_PRIVATE_KEY environment variable is required");
  }
  if (!key.startsWith("0x")) {
    return `0x${key}`;
  }
  return key as `0x${string}`;
}

// Format token amount (6 decimals for TIP-20)
export function formatTokenAmount(amount: bigint, decimals = 6): string {
  const divisor = BigInt(10 ** decimals);
  const integerPart = amount / divisor;
  const fractionalPart = amount % divisor;
  
  if (fractionalPart === 0n) {
    return integerPart.toLocaleString();
  }
  
  const fractionalStr = fractionalPart.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${integerPart.toLocaleString()}.${fractionalStr}`;
}

// Parse token amount to bigint
export function parseTokenAmount(amount: string, decimals = 6): bigint {
  const [integerPart, fractionalPart = ""] = amount.split(".");
  const paddedFractional = fractionalPart.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(integerPart + paddedFractional);
}

// Truncate address for display
export function truncateAddress(address: string, startChars = 6, endChars = 4): string {
  if (address.length <= startChars + endChars) return address;
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

