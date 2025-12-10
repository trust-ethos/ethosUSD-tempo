// Whitelist sync logic - syncs Ethos scores to TIP-403 policy

import { CONTRACTS, TIP403_REGISTRY_ABI } from "./contracts.ts";
import { createTempoPublicClient, createTempoWalletClient, getAdminPrivateKey } from "./tempo.ts";
import { filterEligibleAddresses, MIN_ETHOS_SCORE } from "./ethos.ts";

// In-memory cache of whitelisted addresses (in production, use a database)
const whitelistedAddresses = new Set<string>();

// Load seed addresses from CSV or env
export async function loadSeedAddresses(): Promise<string[]> {
  const addresses: string[] = [];
  
  // Try to load from CSV
  try {
    const csvContent = await Deno.readTextFile("./data/seed-addresses.csv");
    const lines = csvContent.split("\n").filter(line => line.trim());
    
    for (const line of lines) {
      // Skip header row if present
      if (line.toLowerCase().includes("address")) continue;
      
      const address = line.split(",")[0]?.trim();
      if (address && address.startsWith("0x")) {
        addresses.push(address.toLowerCase());
      }
    }
  } catch {
    // CSV doesn't exist, try env
    const envAddresses = Deno.env.get("SEED_ADDRESSES");
    if (envAddresses) {
      addresses.push(...envAddresses.split(",").map(a => a.trim().toLowerCase()));
    }
  }
  
  return addresses;
}

export interface WhitelistSyncResult {
  checked: number;
  added: string[];
  removed: string[];
  scores: Map<string, number>;
  errors: string[];
}

// Sync whitelist with current Ethos scores
export async function syncWhitelist(
  addressesToCheck?: string[]
): Promise<WhitelistSyncResult> {
  const result: WhitelistSyncResult = {
    checked: 0,
    added: [],
    removed: [],
    scores: new Map(),
    errors: [],
  };

  try {
    // Get addresses to check
    const addresses = addressesToCheck || await loadSeedAddresses();
    result.checked = addresses.length;

    if (addresses.length === 0) {
      return result;
    }

    // Filter eligible addresses via Ethos API
    const { eligible, scores } = await filterEligibleAddresses(addresses);
    result.scores = scores;

    // Get policy ID
    const policyId = CONTRACTS.POLICY_ID;
    if (policyId === 0n) {
      result.errors.push("ETHOS_POLICY_ID not configured");
      return result;
    }

    // Initialize clients
    const publicClient = createTempoPublicClient();
    const walletClient = createTempoWalletClient(getAdminPrivateKey());

    // Check current authorization status and update
    for (const address of addresses) {
      const normalizedAddress = address.toLowerCase() as `0x${string}`;
      const isCurrentlyAuthorized = await publicClient.readContract({
        address: CONTRACTS.TIP403_REGISTRY,
        abi: TIP403_REGISTRY_ABI,
        functionName: "isAuthorized",
        args: [policyId, normalizedAddress],
      });

      const shouldBeAuthorized = eligible.includes(normalizedAddress);

      if (shouldBeAuthorized && !isCurrentlyAuthorized) {
        // Add to whitelist
        try {
          const hash = await walletClient.writeContract({
            address: CONTRACTS.TIP403_REGISTRY,
            abi: TIP403_REGISTRY_ABI,
            functionName: "modifyPolicyWhitelist",
            args: [policyId, normalizedAddress, true],
          });
          await publicClient.waitForTransactionReceipt({ hash });
          result.added.push(normalizedAddress);
          whitelistedAddresses.add(normalizedAddress);
        } catch (error) {
          result.errors.push(`Failed to add ${normalizedAddress}: ${error}`);
        }
      } else if (!shouldBeAuthorized && isCurrentlyAuthorized) {
        // Remove from whitelist
        try {
          const hash = await walletClient.writeContract({
            address: CONTRACTS.TIP403_REGISTRY,
            abi: TIP403_REGISTRY_ABI,
            functionName: "modifyPolicyWhitelist",
            args: [policyId, normalizedAddress, false],
          });
          await publicClient.waitForTransactionReceipt({ hash });
          result.removed.push(normalizedAddress);
          whitelistedAddresses.delete(normalizedAddress);
        } catch (error) {
          result.errors.push(`Failed to remove ${normalizedAddress}: ${error}`);
        }
      } else if (shouldBeAuthorized) {
        whitelistedAddresses.add(normalizedAddress);
      }
    }

    return result;
  } catch (error) {
    result.errors.push(`Sync failed: ${error}`);
    return result;
  }
}

// Check if an address is whitelisted (cached)
export function isWhitelisted(address: string): boolean {
  return whitelistedAddresses.has(address.toLowerCase());
}

// Check if an address is authorized on-chain
export async function checkAuthorization(address: string): Promise<boolean> {
  const policyId = CONTRACTS.POLICY_ID;
  if (policyId === 0n) {
    return false;
  }

  const publicClient = createTempoPublicClient();
  
  try {
    const isAuthorized = await publicClient.readContract({
      address: CONTRACTS.TIP403_REGISTRY,
      abi: TIP403_REGISTRY_ABI,
      functionName: "isAuthorized",
      args: [policyId, address.toLowerCase() as `0x${string}`],
    });
    return isAuthorized;
  } catch {
    return false;
  }
}

// Add a single address to whitelist (if eligible)
export async function addToWhitelistIfEligible(
  address: string
): Promise<{ success: boolean; score?: number; error?: string }> {
  try {
    const { eligible, scores } = await filterEligibleAddresses([address]);
    const score = scores.get(address.toLowerCase());

    if (!eligible.includes(address.toLowerCase())) {
      return {
        success: false,
        score,
        error: `Score ${score ?? "unknown"} is below minimum ${MIN_ETHOS_SCORE}`,
      };
    }

    const policyId = CONTRACTS.POLICY_ID;
    if (policyId === 0n) {
      return { success: false, score, error: "Policy not configured" };
    }

    const walletClient = createTempoWalletClient(getAdminPrivateKey());
    const publicClient = createTempoPublicClient();

    const hash = await walletClient.writeContract({
      address: CONTRACTS.TIP403_REGISTRY,
      abi: TIP403_REGISTRY_ABI,
      functionName: "modifyPolicyWhitelist",
      args: [policyId, address.toLowerCase() as `0x${string}`, true],
    });

    await publicClient.waitForTransactionReceipt({ hash });
    whitelistedAddresses.add(address.toLowerCase());

    return { success: true, score };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

