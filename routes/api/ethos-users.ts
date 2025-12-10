import { Handlers } from "$fresh/server.ts";

const ETHOS_API_BASE = "https://api.ethos.network";
const ETHOS_CLIENT_ID = "ethosUSD@1.0.0";

export interface EthosUserInfo {
  address: string;
  name: string | null;
  username: string | null;
  avatar: string | null;
  score: number;
}

// Cache to avoid repeated API calls
const userCache = new Map<string, { data: EthosUserInfo; timestamp: number }>();
const CACHE_TTL = 60000; // 1 minute

async function fetchUserInfo(address: string): Promise<EthosUserInfo> {
  const normalizedAddress = address.toLowerCase();
  
  // Check cache
  const cached = userCache.get(normalizedAddress);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const response = await fetch(
      `${ETHOS_API_BASE}/api/v2/internal/users/address:${address}`,
      {
        headers: { "X-Ethos-Client": ETHOS_CLIENT_ID },
      }
    );

    if (!response.ok) {
      // Return minimal info for addresses without Ethos profiles
      const fallback: EthosUserInfo = {
        address: normalizedAddress,
        name: null,
        username: null,
        avatar: null,
        score: 0,
      };
      userCache.set(normalizedAddress, { data: fallback, timestamp: Date.now() });
      return fallback;
    }

    const data = await response.json();
    const user = data.user;

    const userInfo: EthosUserInfo = {
      address: normalizedAddress,
      name: user?.displayName || null,
      username: user?.username || null,
      avatar: user?.avatarUrl || null,
      score: user?.score || 0,
    };

    userCache.set(normalizedAddress, { data: userInfo, timestamp: Date.now() });
    return userInfo;
  } catch (error) {
    console.error(`Error fetching Ethos user ${address}:`, error);
    const fallback: EthosUserInfo = {
      address: normalizedAddress,
      name: null,
      username: null,
      avatar: null,
      score: 0,
    };
    return fallback;
  }
}

export const handler: Handlers = {
  async GET(req) {
    const url = new URL(req.url);
    const addressesParam = url.searchParams.get("addresses");

    if (!addressesParam) {
      return new Response(
        JSON.stringify({ error: "addresses parameter required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const addresses = addressesParam.split(",").filter(a => a.trim());
    
    // Fetch all user info in parallel
    const userInfos = await Promise.all(
      addresses.map(addr => fetchUserInfo(addr.trim()))
    );

    // Return as a map for easy lookup
    const usersMap: Record<string, EthosUserInfo> = {};
    for (const info of userInfos) {
      usersMap[info.address] = info;
    }

    return new Response(
      JSON.stringify({ users: usersMap }),
      { headers: { "Content-Type": "application/json" } }
    );
  },
};

