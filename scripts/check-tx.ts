#!/usr/bin/env -S deno run -A
import "$std/dotenv/load.ts";
import { createPublicClient, http, decodeEventLog } from "viem";

const client = createPublicClient({
  chain: { id: 42429, name: "Tempo", nativeCurrency: { name: "USD", symbol: "USD", decimals: 6 }, rpcUrls: { default: { http: ["https://rpc.testnet.tempo.xyz"] } } },
  transport: http(),
});

// Check transaction receipt
const txHash = Deno.args[0] || "0xff51016072d19d793288b4d7e68d69f31c8d4bd62846173f1beefa0e25c46b02";
console.log("Checking transaction:", txHash);

try {
  const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
  console.log("Status:", receipt.status);
  console.log("Gas used:", receipt.gasUsed);
  console.log("Number of logs:", receipt.logs.length);
  
  for (const log of receipt.logs) {
    console.log("\nLog from:", log.address);
    console.log("Topics:", log.topics);
    console.log("Data:", log.data);
  }
} catch (e) {
  console.error("Error:", e.message);
}

// Check for higher token numbers
const TIP20_ABI = [
  { name: "name", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

console.log("\n\nChecking tokens 51-80...");
for (let i = 51; i <= 80; i++) {
  const tokenAddr = `0x20c0${i.toString(16).padStart(36, '0')}` as `0x${string}`;
  try {
    const name = await client.readContract({ address: tokenAddr, abi: TIP20_ABI, functionName: "name" });
    const symbol = await client.readContract({ address: tokenAddr, abi: TIP20_ABI, functionName: "symbol" });
    console.log(`Token ${i}: ${tokenAddr} = ${name} (${symbol})`);
  } catch {}
}

