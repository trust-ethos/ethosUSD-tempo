import { Handlers } from "$fresh/server.ts";
import { getScoreByAddress, getScoresByAddresses, getScoreLevel, MIN_ETHOS_SCORE } from "../../lib/ethos.ts";
import { checkAuthorization } from "../../lib/whitelist.ts";

const ETHOS_API_BASE = "https://api.ethos.network";
const ETHOS_CLIENT_ID = "ethosUSD@1.0.0";

// Get all addresses associated with an Ethos user
async function getAllAddressesForUser(address: string): Promise<string[]> {
  try {
    const response = await fetch(
      `${ETHOS_API_BASE}/api/v2/internal/users/address:${address}`,
      { headers: { "X-Ethos-Client": ETHOS_CLIENT_ID } }
    );
    
    if (!response.ok) return [address];
    
    const data = await response.json();
    const allAddresses = data.allAddresses;
    
    if (!allAddresses) return [address];
    
    // Collect all addresses: regular addresses, primary, embedded, smart wallet
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
    
    // Always include the queried address
    addresses.add(address.toLowerCase());
    
    return Array.from(addresses);
  } catch (error) {
    console.error("Error fetching all addresses:", error);
    return [address];
  }
}

// Check if ANY of the user's addresses is whitelisted, return which one
async function findWhitelistedAddress(addresses: string[]): Promise<string | null> {
  for (const addr of addresses) {
    const isAuth = await checkAuthorization(addr);
    if (isAuth) return addr;
  }
  return null;
}

export const handler: Handlers = {
  // GET /api/ethos-score?address=0x...
  async GET(req) {
    const url = new URL(req.url);
    const address = url.searchParams.get("address");

    if (!address) {
      return new Response(JSON.stringify({ error: "address parameter required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const scoreData = await getScoreByAddress(address);
      
      // Get ALL addresses for this user
      const allAddresses = await getAllAddressesForUser(address);
      
      // Check if the queried address is authorized
      const isOnChainAuthorized = await checkAuthorization(address);
      
      // Find any whitelisted address for this user
      const whitelistedAddress = await findWhitelistedAddress(allAddresses);
      const hasAnyWhitelistedAddress = whitelistedAddress !== null;

      if (!scoreData) {
        return new Response(JSON.stringify({
          address,
          score: null,
          level: null,
          isEligible: false,
          isAuthorized: false,
          isOnChainAuthorized,
          hasAnyWhitelistedAddress,
          whitelistedAddress,
          allAddresses,
          minScore: MIN_ETHOS_SCORE,
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      const isEligible = scoreData.score >= MIN_ETHOS_SCORE;
      // User is authorized if they have a whitelisted address AND current score qualifies
      const isAuthorized = hasAnyWhitelistedAddress && isEligible;

      return new Response(JSON.stringify({
        address,
        score: scoreData.score,
        level: getScoreLevel(scoreData.score),
        isEligible,
        isAuthorized,
        isOnChainAuthorized,
        hasAnyWhitelistedAddress,
        whitelistedAddress,
        allAddresses,
        minScore: MIN_ETHOS_SCORE,
        reviews: scoreData.reviews,
        vouches: scoreData.vouches,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: String(error) }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },

  // POST /api/ethos-score with { addresses: [...] }
  async POST(req) {
    try {
      const { addresses } = await req.json();

      if (!Array.isArray(addresses)) {
        return new Response(JSON.stringify({ error: "addresses array required" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const scores = await getScoresByAddresses(addresses);
      
      const results = Object.entries(scores).map(([address, scoreData]) => ({
        address,
        score: scoreData?.score ?? null,
        level: scoreData ? getScoreLevel(scoreData.score) : null,
        isEligible: scoreData ? scoreData.score >= MIN_ETHOS_SCORE : false,
      }));

      return new Response(JSON.stringify({
        results,
        minScore: MIN_ETHOS_SCORE,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: String(error) }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};

