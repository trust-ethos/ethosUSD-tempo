// Ethos API client for fetching reputation scores
// API docs: https://developers.ethos.network/

const ETHOS_API_BASE = "https://api.ethos.network";
const ETHOS_CLIENT_ID = "ethosUSD@1.0.0";

// Minimum score required to be whitelisted
export const MIN_ETHOS_SCORE = 1400;

export interface EthosScore {
  score: number;
  // Additional fields from the API response
  reviews?: number;
  vouches?: number;
}

export interface EthosProfile {
  id: number;
  address: string;
  score: number;
  name?: string;
  avatar?: string;
  reviews: number;
  vouches: number;
}

export interface EthosUserData {
  score: number;
  xp: number; // Contributor XP
  reviews: number;
  vouches: number;
  vouchesReceived: number;
}

export interface BulkScoreResponse {
  [address: string]: EthosScore | null;
}

// Fetch full user data including contributor XP
// Uses the internal API endpoint which returns xpTotal
export async function getUserData(address: string): Promise<EthosUserData | null> {
  try {
    // Use the internal endpoint that returns XP data
    const response = await fetch(
      `${ETHOS_API_BASE}/api/v2/internal/users/address:${address}`,
      {
        headers: {
          "X-Ethos-Client": ETHOS_CLIENT_ID,
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Ethos API error: ${response.status}`);
    }

    const data = await response.json();
    const user = data.user;
    
    if (!user) {
      return null;
    }

    // Extract stats from the response
    const reviewStats = user.stats?.review?.received ?? {};
    const vouchStats = user.stats?.vouch ?? {};

    return {
      score: user.score ?? 0,
      xp: user.xpTotal ?? 0,
      reviews: (reviewStats.positive ?? 0) + (reviewStats.neutral ?? 0) + (reviewStats.negative ?? 0),
      vouches: vouchStats.given?.count ?? 0,
      vouchesReceived: vouchStats.received?.count ?? 0,
    };
  } catch (error) {
    console.error(`Error fetching Ethos user data for ${address}:`, error);
    return null;
  }
}

// Fetch score for a single address
export async function getScoreByAddress(address: string): Promise<EthosScore | null> {
  try {
    const response = await fetch(
      `${ETHOS_API_BASE}/api/v2/score/address?address=${address}`,
      {
        headers: {
          "X-Ethos-Client": ETHOS_CLIENT_ID,
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return null; // No score found for this address
      }
      throw new Error(`Ethos API error: ${response.status}`);
    }

    const data = await response.json();
    return {
      score: data.score ?? 0,
      reviews: data.reviews,
      vouches: data.vouches,
    };
  } catch (error) {
    console.error(`Error fetching Ethos score for ${address}:`, error);
    return null;
  }
}

// Fetch scores for multiple addresses in bulk
export async function getScoresByAddresses(addresses: string[]): Promise<BulkScoreResponse> {
  if (addresses.length === 0) {
    return {};
  }

  try {
    const response = await fetch(
      `${ETHOS_API_BASE}/api/v2/score/addresses`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Ethos-Client": ETHOS_CLIENT_ID,
        },
        body: JSON.stringify({ addresses }),
      }
    );

    if (!response.ok) {
      throw new Error(`Ethos API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Transform the response to our format
    const result: BulkScoreResponse = {};
    for (const address of addresses) {
      const scoreData = data[address.toLowerCase()] || data[address];
      if (scoreData) {
        result[address.toLowerCase()] = {
          score: scoreData.score ?? 0,
          reviews: scoreData.reviews,
          vouches: scoreData.vouches,
        };
      } else {
        result[address.toLowerCase()] = null;
      }
    }
    
    return result;
  } catch (error) {
    console.error("Error fetching bulk Ethos scores:", error);
    return {};
  }
}

// Check if an address meets the minimum score requirement
export async function isAddressEligible(address: string): Promise<boolean> {
  const score = await getScoreByAddress(address);
  return score !== null && score.score >= MIN_ETHOS_SCORE;
}

// Filter addresses that meet the minimum score requirement
export async function filterEligibleAddresses(
  addresses: string[]
): Promise<{ eligible: string[]; scores: Map<string, number> }> {
  const scores = await getScoresByAddresses(addresses);
  const eligible: string[] = [];
  const scoreMap = new Map<string, number>();

  for (const [address, scoreData] of Object.entries(scores)) {
    if (scoreData && scoreData.score >= MIN_ETHOS_SCORE) {
      eligible.push(address);
    }
    if (scoreData) {
      scoreMap.set(address.toLowerCase(), scoreData.score);
    }
  }

  return { eligible, scores: scoreMap };
}

// Get Ethos profile URL for an address
export function getEthosProfileUrl(address: string): string {
  return `https://app.ethos.network/profile/${address}`;
}

// Get score level based on Ethos scoring ranges
export function getScoreLevel(score: number): "untrusted" | "questionable" | "neutral" | "reputable" | "exemplary" {
  if (score < 800) return "untrusted";
  if (score < 1200) return "questionable";
  if (score < 1600) return "neutral";
  if (score < 2000) return "reputable";
  return "exemplary";
}

// Get CSS class for score display
export function getScoreClass(score: number): string {
  if (score >= 1600) return "ethos-score-high";
  if (score >= 1200) return "ethos-score-medium";
  return "ethos-score-low";
}

