import "$std/dotenv/load.ts";
import { Handlers } from "$fresh/server.ts";
import { verifyMessage } from "viem";
import { getClaimableAmount, recordClaim } from "../../lib/claims.ts";
import { CONTRACTS, TIP20_ABI } from "../../lib/contracts.ts";
import { createTempoPublicClient, createTempoWalletClient, getAdminPrivateKey, formatTokenAmount } from "../../lib/tempo.ts";

// Generate the same claim message format as the client
function getClaimMessage(address: string, timestamp: number): string {
  return `I am claiming my $ethosUSD tokens for address ${address.toLowerCase()} at timestamp ${timestamp}`;
}

// Maximum age of a valid signature (5 minutes)
const MAX_SIGNATURE_AGE_MS = 5 * 60 * 1000;

export const handler: Handlers = {
  async POST(req) {
    try {
      const body = await req.json();
      const { address: rawAddress, signature, timestamp } = body;

      if (!rawAddress) {
        return new Response(
          JSON.stringify({ success: false, error: "Address required" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      if (!signature || !timestamp) {
        return new Response(
          JSON.stringify({ success: false, error: "Signature verification required" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const address = rawAddress.toLowerCase() as `0x${string}`;

      // Validate address format
      if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return new Response(
          JSON.stringify({ success: false, error: "Invalid address format" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      // Validate timestamp is not too old
      const now = Date.now();
      if (typeof timestamp !== "number" || timestamp > now || now - timestamp > MAX_SIGNATURE_AGE_MS) {
        return new Response(
          JSON.stringify({ success: false, error: "Signature expired. Please try again." }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      // Verify the signature
      const message = getClaimMessage(address, timestamp);
      let isValidSignature = false;
      
      try {
        isValidSignature = await verifyMessage({
          address: address,
          message: message,
          signature: signature as `0x${string}`,
        });
      } catch (err) {
        console.error("Signature verification error:", err);
        return new Response(
          JSON.stringify({ success: false, error: "Invalid signature format" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      if (!isValidSignature) {
        return new Response(
          JSON.stringify({ success: false, error: "Invalid signature. Please sign with the correct wallet." }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }

      // Check claim eligibility
      const claimStatus = await getClaimableAmount(address);

      if (!claimStatus.canClaim) {
        return new Response(
          JSON.stringify({
            success: false,
            error: claimStatus.alreadyClaimed
              ? "You have already claimed your $ethosUSD"
              : claimStatus.error || "Not eligible to claim",
            alreadyClaimed: claimStatus.alreadyClaimed,
            claimRecord: claimStatus.claimRecord
              ? {
                  txHash: claimStatus.claimRecord.txHash,
                  amount: claimStatus.claimRecord.amount.toString(),
                }
              : undefined,
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      console.log(`Processing claim for ${address}: ${formatTokenAmount(claimStatus.amount)} $ethosUSD (${claimStatus.xp} XP)`);

      // Initialize clients for minting
      const privateKey = getAdminPrivateKey();
      const publicClient = createTempoPublicClient();
      const walletClient = createTempoWalletClient(privateKey);

      // Mint tokens to the user using direct contract call
      const mintHash = await walletClient.writeContract({
        address: CONTRACTS.ETHOS_USD_TOKEN,
        abi: TIP20_ABI,
        functionName: "mint",
        args: [address, claimStatus.amount],
      });

      console.log(`Mint transaction sent: ${mintHash}`);

      // Wait for confirmation
      const receipt = await publicClient.waitForTransactionReceipt({ hash: mintHash });

      if (receipt.status !== "success") {
        return new Response(
          JSON.stringify({ success: false, error: "Mint transaction failed" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      console.log(`Mint confirmed in block ${receipt.blockNumber}`);

      // Record the claim
      await recordClaim(address, claimStatus.amount, claimStatus.xp, mintHash);

      return new Response(
        JSON.stringify({
          success: true,
          txHash: mintHash,
          amount: claimStatus.amount.toString(),
          amountFormatted: formatTokenAmount(claimStatus.amount),
          xp: claimStatus.xp,
          explorerUrl: `https://explore.tempo.xyz/receipt/${mintHash}`,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    } catch (error) {
      console.error("Claim error:", error);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: error instanceof Error ? error.message : "Failed to process claim" 
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  },
};
