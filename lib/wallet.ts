// Simple wallet connection using window.ethereum directly
// This avoids the bundling issues with @wagmi/connectors

import { createPublicClient, http, type PublicClient, type Address } from "viem";

// Tempo Testnet chain config
export const tempoTestnet = {
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
} as const;

// Create public client for reading chain data
export function getPublicClient(): PublicClient {
  return createPublicClient({
    chain: tempoTestnet,
    transport: http(),
  });
}

// Contract addresses
export const CONTRACTS = {
  ETHOS_USD_TOKEN: "0x20c0000000000000000000000000000000000726" as Address,
  TIP403_REGISTRY: "0x403c000000000000000000000000000000000000" as Address,
  POLICY_ID: 145n,
} as const;

// TIP20 ABI for client-side operations
export const TIP20_ABI = [
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
] as const;

// Helper to format token amounts
export function formatAmount(amount: bigint, decimals = 6): string {
  const divisor = BigInt(10 ** decimals);
  const integerPart = amount / divisor;
  const fractionalPart = amount % divisor;
  
  if (fractionalPart === 0n) {
    return integerPart.toLocaleString();
  }
  
  const fractionalStr = fractionalPart.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${integerPart.toLocaleString()}.${fractionalStr}`;
}

// Helper to parse token amounts
export function parseAmount(amount: string, decimals = 6): bigint {
  const [integerPart, fractionalPart = ""] = amount.split(".");
  const paddedFractional = fractionalPart.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(integerPart.replace(/,/g, "") + paddedFractional);
}

// Truncate address for display
export function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Type for window.ethereum
declare global {
  interface Window {
    ethereum?: {
      isMetaMask?: boolean;
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, callback: (...args: unknown[]) => void) => void;
      removeListener: (event: string, callback: (...args: unknown[]) => void) => void;
    };
  }
}

// Storage key for manual disconnect state
const DISCONNECT_KEY = "ethosUSD_disconnected";

// Check if wallet is available
export function isWalletAvailable(): boolean {
  return typeof window !== "undefined" && !!window.ethereum;
}

// Check if user manually disconnected
function isManuallyDisconnected(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(DISCONNECT_KEY) === "true";
}

// Set manual disconnect state
function setManuallyDisconnected(value: boolean): void {
  if (typeof window === "undefined") return;
  if (value) {
    sessionStorage.setItem(DISCONNECT_KEY, "true");
  } else {
    sessionStorage.removeItem(DISCONNECT_KEY);
  }
}

// Disconnect wallet (clears local state)
export function disconnectWallet(): void {
  setManuallyDisconnected(true);
  // Notify listeners
  disconnectListeners.forEach(cb => cb());
}

// Listeners for disconnect events
const disconnectListeners = new Set<() => void>();

export function onDisconnect(callback: () => void): () => void {
  disconnectListeners.add(callback);
  return () => disconnectListeners.delete(callback);
}

// Connect wallet using window.ethereum
export async function connectWallet(): Promise<Address> {
  if (!isWalletAvailable()) {
    throw new Error("Please install MetaMask or another wallet extension");
  }
  
  // Clear disconnect state when user explicitly connects
  setManuallyDisconnected(false);
  
  const accounts = await window.ethereum!.request({
    method: "eth_requestAccounts",
  }) as string[];
  
  if (!accounts || accounts.length === 0) {
    throw new Error("No accounts found");
  }
  
  // Request to switch to Tempo Testnet
  try {
    await window.ethereum!.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: `0x${tempoTestnet.id.toString(16)}` }],
    });
  } catch (switchError: unknown) {
    // Chain doesn't exist, add it
    if ((switchError as { code: number }).code === 4902) {
      await window.ethereum!.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: `0x${tempoTestnet.id.toString(16)}`,
          chainName: tempoTestnet.name,
          nativeCurrency: tempoTestnet.nativeCurrency,
          rpcUrls: tempoTestnet.rpcUrls.default.http,
          blockExplorerUrls: [tempoTestnet.blockExplorers.default.url],
        }],
      });
    } else {
      console.warn("Could not switch to Tempo Testnet:", switchError);
    }
  }
  
  return accounts[0] as Address;
}

// Get current connected account
export async function getConnectedAccount(): Promise<Address | null> {
  if (!isWalletAvailable()) {
    return null;
  }
  
  // Check if user manually disconnected
  if (isManuallyDisconnected()) {
    return null;
  }
  
  try {
    const accounts = await window.ethereum!.request({
      method: "eth_accounts",
    }) as string[];
    
    return accounts?.[0] as Address || null;
  } catch {
    return null;
  }
}

// Watch for account changes
export function watchAccount(callback: (account: Address | null) => void): () => void {
  if (!isWalletAvailable()) {
    return () => {};
  }
  
  const handleAccountsChanged = (accounts: unknown) => {
    const accs = accounts as string[];
    callback(accs?.[0] as Address || null);
  };
  
  window.ethereum!.on("accountsChanged", handleAccountsChanged);
  
  return () => {
    window.ethereum!.removeListener("accountsChanged", handleAccountsChanged);
  };
}

// Send transaction using window.ethereum
export async function sendTransaction(params: {
  to: Address;
  data: `0x${string}`;
  from: Address;
}): Promise<`0x${string}`> {
  if (!isWalletAvailable()) {
    throw new Error("Wallet not available");
  }
  
  // Estimate gas first - helps with Ledger and other hardware wallets
  let gasLimit: string;
  try {
    const gasEstimate = await window.ethereum!.request({
      method: "eth_estimateGas",
      params: [{
        from: params.from,
        to: params.to,
        data: params.data,
      }],
    }) as string;
    
    // Add 20% buffer to gas estimate
    const estimatedGas = BigInt(gasEstimate);
    const bufferedGas = (estimatedGas * 120n) / 100n;
    gasLimit = `0x${bufferedGas.toString(16)}`;
  } catch (err) {
    console.warn("Gas estimation failed, using default:", err);
    gasLimit = "0x100000"; // Default fallback: ~1M gas
  }

  // Get current gas price from the network
  let gasPrice: string;
  try {
    gasPrice = await window.ethereum!.request({
      method: "eth_gasPrice",
      params: [],
    }) as string;
  } catch {
    gasPrice = "0x5F5E100"; // 100M wei = 100 gwei fallback
  }
  
  const txHash = await window.ethereum!.request({
    method: "eth_sendTransaction",
    params: [{
      from: params.from,
      to: params.to,
      data: params.data,
      gas: gasLimit,
      gasPrice: gasPrice,
      // Use legacy transaction type for better hardware wallet compatibility
      type: "0x0",
    }],
  }) as `0x${string}`;
  
  return txHash;
}

// Sign a message using window.ethereum
export async function signMessage(message: string, from: Address): Promise<`0x${string}`> {
  if (!isWalletAvailable()) {
    throw new Error("Wallet not available");
  }
  
  const signature = await window.ethereum!.request({
    method: "personal_sign",
    params: [message, from],
  }) as `0x${string}`;
  
  return signature;
}

// Generate a claim message for signing
export function getClaimMessage(address: string, timestamp: number): string {
  return `I am claiming my $ethosUSD tokens for address ${address.toLowerCase()} at timestamp ${timestamp}`;
}

