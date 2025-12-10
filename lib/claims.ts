// Claims tracking system - tracks who has claimed their ethosUSD

import { getUserData, getScoreByAddress } from "./ethos.ts";
import { createTempoPublicClient } from "./tempo.ts";
import { CONTRACTS } from "./contracts.ts";

const CLAIMS_FILE = "./data/claims.json";

// TIP20 ABI for balance check
const TIP20_BALANCE_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

// Check on-chain if user has ethosUSD balance (indicates they've claimed or received tokens)
// This is more reliable than checking logs since Tempo RPC limits block range queries
async function hasClaimedOnChain(address: string): Promise<boolean> {
  try {
    const client = createTempoPublicClient();
    
    // Check user's ethosUSD balance
    const balance = await client.readContract({
      address: CONTRACTS.ETHOS_USD_TOKEN,
      abi: TIP20_BALANCE_ABI,
      functionName: "balanceOf",
      args: [address.toLowerCase() as `0x${string}`],
    });
    
    // If they have any ethosUSD balance, they've likely claimed
    // (Since the primary way to get ethosUSD is through claiming)
    return balance > 0n;
  } catch (err) {
    console.error("Error checking on-chain balance:", err);
    return false; // Fall back to local check if on-chain check fails
  }
}

export interface ClaimRecord {
  address: string;
  amount: bigint; // Amount claimed in token units (6 decimals)
  xp: number; // XP at time of claim
  txHash: string;
  timestamp: number;
}

// Serializable version for JSON storage
interface ClaimRecordJSON {
  address: string;
  amount: string; // Stored as string since BigInt can't be JSON serialized
  xp: number;
  txHash: string;
  timestamp: number;
}

// Load claims from file (always reads fresh for reliability)
async function loadClaims(): Promise<Map<string, ClaimRecord>> {
  try {
    const content = await Deno.readTextFile(CLAIMS_FILE);
    const records: ClaimRecordJSON[] = JSON.parse(content);
    return new Map(
      records.map((r) => [
        r.address.toLowerCase(),
        {
          ...r,
          address: r.address.toLowerCase(),
          amount: BigInt(r.amount),
        },
      ])
    );
  } catch {
    // File doesn't exist or is invalid, start with empty map
    return new Map();
  }
}

// Save claims to file
async function saveClaims(claims: Map<string, ClaimRecord>): Promise<void> {
  const records: ClaimRecordJSON[] = Array.from(claims.values()).map((r) => ({
    ...r,
    amount: r.amount.toString(),
  }));

  // Ensure data directory exists
  try {
    await Deno.mkdir("./data", { recursive: true });
  } catch {
    // Directory might already exist
  }

  await Deno.writeTextFile(CLAIMS_FILE, JSON.stringify(records, null, 2));
}

// Check if an address has already claimed
export async function hasClaimed(address: string): Promise<boolean> {
  const claims = await loadClaims();
  return claims.has(address.toLowerCase());
}

// Get claim record for an address
export async function getClaimRecord(address: string): Promise<ClaimRecord | null> {
  const claims = await loadClaims();
  return claims.get(address.toLowerCase()) || null;
}

// Record a new claim
export async function recordClaim(
  address: string,
  amount: bigint,
  xp: number,
  txHash: string
): Promise<void> {
  const claims = await loadClaims();
  
  const record: ClaimRecord = {
    address: address.toLowerCase(),
    amount,
    xp,
    txHash,
    timestamp: Date.now(),
  };

  claims.set(address.toLowerCase(), record);
  
  await saveClaims(claims);
}

// Get claimable amount for an address
// Returns the amount in token units (with 6 decimals)
// 1 XP = 1 ethosUSD = 1_000_000 token units
export async function getClaimableAmount(address: string): Promise<{
  canClaim: boolean;
  amount: bigint;
  xp: number;
  score?: number;
  alreadyClaimed: boolean;
  claimRecord?: ClaimRecord;
  error?: string;
}> {
  // First check on-chain if they've received a mint (most reliable)
  const claimedOnChain = await hasClaimedOnChain(address);
  if (claimedOnChain) {
    // Try to get local record for details, but we know they claimed
    const existingClaim = await getClaimRecord(address);
    return {
      canClaim: false,
      amount: 0n,
      xp: existingClaim?.xp ?? 0,
      alreadyClaimed: true,
      claimRecord: existingClaim ?? undefined,
    };
  }

  // Also check local file (belt and suspenders)
  const existingClaim = await getClaimRecord(address);
  if (existingClaim) {
    return {
      canClaim: false,
      amount: 0n,
      xp: existingClaim.xp,
      alreadyClaimed: true,
      claimRecord: existingClaim,
    };
  }

  // First, try to get user data with XP
  const userData = await getUserData(address);
  
  // If user data is available and has XP
  if (userData && userData.xp > 0) {
    const amount = BigInt(Math.floor(userData.xp)) * 1_000_000n;
    return {
      canClaim: true,
      amount,
      xp: userData.xp,
      score: userData.score,
      alreadyClaimed: false,
    };
  }

  // Fall back to checking if they at least have an Ethos profile via score API
  const scoreData = await getScoreByAddress(address);
  
  if (!scoreData) {
    return {
      canClaim: false,
      amount: 0n,
      xp: 0,
      alreadyClaimed: false,
      error: "No Ethos profile found. Create one at ethos.network to earn Contributor XP.",
    };
  }

  // They have a profile but no XP (or XP endpoint failed)
  // Check if userData returned but with 0 XP
  const xp = userData?.xp ?? 0;
  
  return {
    canClaim: false,
    amount: 0n,
    xp,
    score: scoreData.score,
    alreadyClaimed: false,
    error: xp === 0 
      ? "You have an Ethos profile but no Contributor XP yet. Earn XP by contributing to Ethos!"
      : "Unable to fetch your Contributor XP. Please try again later.",
  };
}

// Get all claims (for admin/stats)
export async function getAllClaims(): Promise<ClaimRecord[]> {
  const claims = await loadClaims();
  return Array.from(claims.values());
}

// Get total claimed amount
export async function getTotalClaimed(): Promise<bigint> {
  const claims = await loadClaims();
  let total = 0n;
  for (const claim of claims.values()) {
    total += claim.amount;
  }
  return total;
}

