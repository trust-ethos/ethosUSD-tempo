import { Handlers } from "$fresh/server.ts";
import { checkAuthorization } from "../../lib/whitelist.ts";

const ETHOS_API_BASE = "https://api.ethos.network";
const ETHOS_CLIENT_ID = "ethosUSD@1.0.0";
const MIN_SCORE = 1400;

export interface SearchResult {
  userkey: string;
  avatar: string | null;
  name: string;
  username: string | null;
  score: number;
  profileId: number;
  primaryAddress: string;
  whitelistedAddress: string | null; // The address that's actually whitelisted
  isAuthorized: boolean; // Whether they have any whitelisted address
}

// Get all addresses for a user and find whitelisted one
async function getAllAddressesForUser(primaryAddress: string): Promise<string[]> {
  try {
    const response = await fetch(
      `${ETHOS_API_BASE}/api/v2/internal/users/address:${primaryAddress}`,
      { headers: { "X-Ethos-Client": ETHOS_CLIENT_ID } }
    );
    
    if (!response.ok) return [primaryAddress];
    
    const data = await response.json();
    const allAddresses = data.allAddresses;
    
    if (!allAddresses) return [primaryAddress];
    
    const addresses = new Set<string>();
    
    if (allAddresses.addresses) {
      allAddresses.addresses.forEach((a: string) => addresses.add(a.toLowerCase()));
    }
    if (allAddresses.primaryAddress) {
      addresses.add(allAddresses.primaryAddress.toLowerCase());
    }
    if (allAddresses.embeddedWallet) {
      addresses.add(allAddresses.embeddedWallet.toLowerCase());
    }
    if (allAddresses.smartWallet) {
      addresses.add(allAddresses.smartWallet.toLowerCase());
    }
    
    addresses.add(primaryAddress.toLowerCase());
    
    return Array.from(addresses);
  } catch {
    return [primaryAddress];
  }
}

async function findWhitelistedAddress(addresses: string[]): Promise<string | null> {
  for (const addr of addresses) {
    const isAuth = await checkAuthorization(addr);
    if (isAuth) return addr;
  }
  return null;
}

export const handler: Handlers = {
  async GET(req) {
    const url = new URL(req.url);
    const query = url.searchParams.get("query");

    if (!query || query.length < 2) {
      return new Response(
        JSON.stringify({ results: [], error: "Query must be at least 2 characters" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    try {
      const response = await fetch(
        `${ETHOS_API_BASE}/api/v1/search?query=${encodeURIComponent(query)}&limit=20`,
        {
          headers: { "X-Ethos-Client": ETHOS_CLIENT_ID },
        }
      );

      if (!response.ok) {
        throw new Error(`Ethos API error: ${response.status}`);
      }

      const data = await response.json();
      const values = data.data?.values || [];

      // Filter for users with:
      // 1. A profile (profileId exists)
      // 2. A primary address
      // 3. Score >= 1400
      const eligibleUsers = values.filter((user: any) => 
        user.profileId && 
        user.primaryAddress && 
        user.score >= MIN_SCORE
      );

      // For each eligible user, find their whitelisted address
      const results: SearchResult[] = await Promise.all(
        eligibleUsers.map(async (user: any) => {
          const allAddresses = await getAllAddressesForUser(user.primaryAddress);
          const whitelistedAddress = await findWhitelistedAddress(allAddresses);
          
          return {
            userkey: user.userkey,
            avatar: user.avatar || null,
            name: user.name || user.username || `${user.primaryAddress.slice(0, 6)}...${user.primaryAddress.slice(-4)}`,
            username: user.username || null,
            score: user.score,
            profileId: user.profileId,
            primaryAddress: user.primaryAddress,
            whitelistedAddress,
            isAuthorized: whitelistedAddress !== null,
          };
        })
      );

      return new Response(
        JSON.stringify({ results }),
        { headers: { "Content-Type": "application/json" } }
      );
    } catch (error) {
      console.error("Search error:", error);
      return new Response(
        JSON.stringify({ results: [], error: "Search failed" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  },
};

