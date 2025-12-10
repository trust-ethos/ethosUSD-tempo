#!/usr/bin/env -S deno run -A
/**
 * Check for existing TIP-20 tokens on Tempo Testnet
 */

import "$std/dotenv/load.ts";
import { createPublicClient, http } from "viem";

const tempoTestnet = {
  id: 42429,
  name: "Tempo Testnet",
  nativeCurrency: { name: "USD", symbol: "USD", decimals: 6 },
  rpcUrls: { default: { http: ["https://rpc.testnet.tempo.xyz"] } },
};

const client = createPublicClient({ chain: tempoTestnet, transport: http() });

const TIP20_ABI = [
  { name: "name", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

console.log("Checking for existing TIP-20 tokens on Tempo Testnet...\n");

// Check potential token addresses (TIP-20 format: 0x20c0 + 36 hex chars)
for (let i = 1; i <= 50; i++) {
  const tokenAddr = `0x20c0${i.toString(16).padStart(36, '0')}` as `0x${string}`;
  try {
    const name = await client.readContract({ address: tokenAddr, abi: TIP20_ABI, functionName: "name" });
    const symbol = await client.readContract({ address: tokenAddr, abi: TIP20_ABI, functionName: "symbol" });
    console.log(`Token ${i}: ${tokenAddr}`);
    console.log(`   Name: ${name}, Symbol: ${symbol}`);
  } catch {
    // Token doesn't exist
  }
}

console.log("\nDone checking tokens.");

