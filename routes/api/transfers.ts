import { Handlers } from "$fresh/server.ts";
import { createTempoPublicClient } from "../../lib/tempo.ts";
import { CONTRACTS, TIP20_ABI } from "../../lib/contracts.ts";
import { parseAbiItem } from "viem";

const TRANSFER_EVENT = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

export const handler: Handlers = {
  async GET(req) {
    const url = new URL(req.url);
    const tokenAddress = url.searchParams.get("token") || CONTRACTS.ETHOS_USD_TOKEN;
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 100);
    const filterAddress = url.searchParams.get("address")?.toLowerCase();

    if (!tokenAddress) {
      return new Response(JSON.stringify({
        transfers: [],
        error: "Token address not configured",
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const publicClient = createTempoPublicClient();

      // Get the latest block number
      const latestBlock = await publicClient.getBlockNumber();
      
      // Search the last 10000 blocks (or since genesis if chain is newer)
      const fromBlock = latestBlock > 10000n ? latestBlock - 10000n : 0n;

      // Fetch Transfer events
      const logs = await publicClient.getLogs({
        address: tokenAddress as `0x${string}`,
        event: TRANSFER_EVENT,
        fromBlock,
        toBlock: "latest",
      });

      // Filter and format transfers
      let transfers = logs
        .map((log) => ({
          from: log.args.from as string,
          to: log.args.to as string,
          value: (log.args.value as bigint).toString(),
          transactionHash: log.transactionHash,
          blockNumber: Number(log.blockNumber),
        }))
        .filter((tx) => {
          if (!filterAddress) return true;
          return tx.from.toLowerCase() === filterAddress || 
                 tx.to.toLowerCase() === filterAddress;
        })
        .reverse() // Most recent first
        .slice(0, limit);

      return new Response(JSON.stringify({
        transfers,
        tokenAddress,
        fromBlock: fromBlock.toString(),
        toBlock: latestBlock.toString(),
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Error fetching transfers:", error);
      
      // Return empty array with error info rather than failing
      return new Response(JSON.stringify({
        transfers: [],
        error: String(error),
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};

