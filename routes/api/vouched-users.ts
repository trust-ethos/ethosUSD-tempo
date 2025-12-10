import { Handlers } from "$fresh/server.ts";
import { checkAuthorization } from "../../lib/whitelist.ts";
import { MIN_ETHOS_SCORE } from "../../lib/ethos.ts";

const ETHOS_API_BASE = "https://api.ethos.network";
const ETHOS_CLIENT_ID = "ethosUSD@1.0.0";

export interface VouchedUser {
  address: string;
  whitelistedAddress: string | null; // The address that's actually whitelisted
  name: string;
  username: string | null;
  avatar: string | null;
  score: number;
  isEligible: boolean;
  isAuthorized: boolean; // True if they have any whitelisted address
  profileId: number;
  profileUrl: string;
}

// Get all addresses for a user from Ethos API
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
    
    // Always include the primary address
    addresses.add(primaryAddress.toLowerCase());
    
    return Array.from(addresses);
  } catch (error) {
    console.error("Error fetching all addresses:", error);
    return [primaryAddress];
  }
}

// Find whitelisted address from a list
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
    const address = url.searchParams.get("address");

    if (!address) {
      return new Response(
        JSON.stringify({ error: "Address parameter required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    try {
      // First get the user's profileId
      const userResponse = await fetch(
        `${ETHOS_API_BASE}/api/v2/internal/users/address:${address}`,
        {
          headers: { "X-Ethos-Client": ETHOS_CLIENT_ID },
        }
      );

      if (!userResponse.ok) {
        return new Response(
          JSON.stringify({ users: [], error: "User not found" }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      const userData = await userResponse.json();
      const profileId = userData.user?.profileId;

      if (!profileId) {
        return new Response(
          JSON.stringify({ users: [] }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      // Use the dedicated vouches endpoint to get all vouches by this user
      // Paginate to get all vouches (limit is max 100 per request)
      const allVouches: any[] = [];
      let offset = 0;
      const pageSize = 100;
      const maxVouches = 200; // Cap at 200 to avoid too many API calls
      
      while (allVouches.length < maxVouches) {
        const vouchesResponse = await fetch(
          `${ETHOS_API_BASE}/api/v2/vouches`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Ethos-Client": ETHOS_CLIENT_ID,
            },
            body: JSON.stringify({
              authorProfileIds: [profileId],
              archived: false,
              limit: pageSize,
              offset: offset,
            }),
          }
        );

        if (!vouchesResponse.ok) {
          console.error("Vouches API error:", await vouchesResponse.text());
          break;
        }

        const vouchesData = await vouchesResponse.json();
        const pageVouches = vouchesData.values || [];
        
        if (pageVouches.length === 0) break;
        
        allVouches.push(...pageVouches);
        offset += pageSize;
        
        // If we got less than pageSize, we've reached the end
        if (pageVouches.length < pageSize) break;
      }

      console.log(`Found ${allVouches.length} vouches for profile ${profileId}`);

      // Extract unique vouched users
      const seenProfileIds = new Set<number>();
      const vouchedUsers: VouchedUser[] = [];

      for (const vouch of allVouches) {
        const subjectUser = vouch.subjectUser;
        if (!subjectUser) continue;
        
        // Skip if we've already seen this user
        if (seenProfileIds.has(subjectUser.profileId)) continue;
        seenProfileIds.add(subjectUser.profileId);
        
        // Get primary address from userkeys
        let primaryAddress: string | null = null;
        if (subjectUser.userkeys) {
          for (const key of subjectUser.userkeys) {
            if (key.startsWith("address:")) {
              primaryAddress = key.replace("address:", "");
              break;
            }
          }
        }
        
        if (!primaryAddress) continue;
        if (primaryAddress === "0x0000000000000000000000000000000000000000") continue;
        
        // Fetch ALL addresses for this user (including smart wallet, embedded wallet)
        const userAddresses = await getAllAddressesForUser(primaryAddress);
        
        // Check if any of their addresses is whitelisted
        const whitelistedAddress = await findWhitelistedAddress(userAddresses);
        const score = subjectUser.score || 0;
        const isEligible = score >= MIN_ETHOS_SCORE;
        
        vouchedUsers.push({
          address: primaryAddress,
          whitelistedAddress,
          name: subjectUser.displayName || subjectUser.username || `${primaryAddress.slice(0, 6)}...`,
          username: subjectUser.username || null,
          avatar: subjectUser.avatarUrl || null,
          score,
          isEligible,
          isAuthorized: whitelistedAddress !== null && isEligible,
          profileId: subjectUser.profileId,
          profileUrl: subjectUser.links?.profile || 
            `https://app.ethos.network/profile/${primaryAddress}`,
        });
      }

      console.log(`Returning ${vouchedUsers.length} unique vouched users`);

      // Shuffle the array to show random users each time
      for (let i = vouchedUsers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [vouchedUsers[i], vouchedUsers[j]] = [vouchedUsers[j], vouchedUsers[i]];
      }

      return new Response(
        JSON.stringify({ users: vouchedUsers }),
        { headers: { "Content-Type": "application/json" } }
      );
    } catch (error) {
      console.error("Error fetching vouched users:", error);
      return new Response(
        JSON.stringify({ users: [], error: "Failed to fetch vouched users" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  },
};
