import { Handlers } from "$fresh/server.ts";
import { getClaimableAmount } from "../../lib/claims.ts";

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

    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return new Response(
        JSON.stringify({ error: "Invalid address format" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    try {
      const result = await getClaimableAmount(address);

      return new Response(
        JSON.stringify({
          address: address.toLowerCase(),
          canClaim: result.canClaim,
          amount: result.amount.toString(),
          amountFormatted: (Number(result.amount) / 1_000_000).toFixed(2),
          xp: result.xp,
          score: result.score,
          alreadyClaimed: result.alreadyClaimed,
          claimRecord: result.claimRecord
            ? {
                txHash: result.claimRecord.txHash,
                timestamp: result.claimRecord.timestamp,
                amount: result.claimRecord.amount.toString(),
              }
            : undefined,
          error: result.error,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    } catch (error) {
      console.error("Error checking claim status:", error);
      return new Response(
        JSON.stringify({ error: "Failed to check claim status" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  },
};

