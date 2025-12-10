#!/usr/bin/env -S deno run -A
/**
 * Create whitelist in chunks - uses batch creation for first chunk, then parallel adds
 * 
 * Usage: deno run -A scripts/create-whitelist-chunked.ts <csv-file>
 */

import "$std/dotenv/load.ts";
import { CONTRACTS, TIP403_REGISTRY_ABI, TIP20_ABI, POLICY_TYPE } from "../lib/contracts.ts";
import { createTempoPublicClient, createTempoWalletClient, getAdminPrivateKey } from "../lib/tempo.ts";

const BATCH_CREATE_SIZE = 450; // Safe limit for createPolicyWithAccounts
const PARALLEL_ADD_SIZE = 30;  // Parallel transactions for remaining

async function parseCSV(filePath: string): Promise<string[]> {
  const content = await Deno.readTextFile(filePath);
  const lines = content.split("\n").filter(line => line.trim());
  
  const header = lines[0].toLowerCase().split(",").map(h => h.trim());
  const addressIndex = header.indexOf("address");
  if (addressIndex === -1) throw new Error("CSV must have 'address' column");
  
  const addresses: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map(v => v.trim());
    const address = values[addressIndex];
    if (address && address.startsWith("0x") && address.length === 42) {
      addresses.push(address.toLowerCase());
    }
  }
  return [...new Set(addresses)]; // Dedupe
}

async function main() {
  const csvPath = Deno.args[0];
  if (!csvPath) {
    console.log("Usage: deno run -A scripts/create-whitelist-chunked.ts <csv-file>");
    Deno.exit(1);
  }
  
  console.log("\n⚡ Chunked Whitelist Creation\n");
  console.log("=".repeat(50));
  
  const addresses = await parseCSV(csvPath);
  console.log(`\n📄 Loaded ${addresses.length} unique addresses`);
  
  const privateKey = getAdminPrivateKey();
  const publicClient = createTempoPublicClient();
  const walletClient = createTempoWalletClient(privateKey);
  const adminAddress = walletClient.account!.address.toLowerCase();
  
  // Ensure admin is in the list
  if (!addresses.includes(adminAddress)) {
    addresses.unshift(adminAddress);
  }
  
  console.log(`📍 Admin: ${adminAddress}`);
  
  // Split into first batch (for creation) and remaining
  const firstBatch = addresses.slice(0, BATCH_CREATE_SIZE);
  const remaining = addresses.slice(BATCH_CREATE_SIZE);
  
  console.log(`\n📋 Strategy:`);
  console.log(`   1. Create policy with ${firstBatch.length} addresses (1 transaction)`);
  console.log(`   2. Add remaining ${remaining.length} addresses (${Math.ceil(remaining.length / PARALLEL_ADD_SIZE)} batches of ${PARALLEL_ADD_SIZE})`);
  
  // Step 1: Create policy with first batch
  console.log(`\n🚀 Step 1: Creating policy with ${firstBatch.length} addresses...`);
  
  const createHash = await walletClient.writeContract({
    address: CONTRACTS.TIP403_REGISTRY,
    abi: TIP403_REGISTRY_ABI,
    functionName: "createPolicyWithAccounts",
    args: [
      adminAddress as `0x${string}`,
      POLICY_TYPE.WHITELIST,
      firstBatch as `0x${string}`[],
    ],
  });
  
  console.log(`   Tx: ${createHash.slice(0, 20)}...`);
  await publicClient.waitForTransactionReceipt({ hash: createHash });
  
  const policyIdCounter = await publicClient.readContract({
    address: CONTRACTS.TIP403_REGISTRY,
    abi: TIP403_REGISTRY_ABI,
    functionName: "policyIdCounter",
  });
  const newPolicyId = policyIdCounter - 1n;
  console.log(`   ✅ Policy ID: ${newPolicyId} with ${firstBatch.length} addresses`);
  
  // Step 2: Add remaining in parallel batches
  if (remaining.length > 0) {
    console.log(`\n🔄 Step 2: Adding ${remaining.length} more addresses...`);
    
    let added = 0;
    let errors = 0;
    const startTime = Date.now();
    
    for (let i = 0; i < remaining.length; i += PARALLEL_ADD_SIZE) {
      const batch = remaining.slice(i, i + PARALLEL_ADD_SIZE);
      const batchNum = Math.floor(i / PARALLEL_ADD_SIZE) + 1;
      const totalBatches = Math.ceil(remaining.length / PARALLEL_ADD_SIZE);
      
      // Send all in parallel
      const txPromises = batch.map(async (addr) => {
        try {
          const hash = await walletClient.writeContract({
            address: CONTRACTS.TIP403_REGISTRY,
            abi: TIP403_REGISTRY_ABI,
            functionName: "modifyPolicyWhitelist",
            args: [newPolicyId, addr as `0x${string}`, true],
          });
          await publicClient.waitForTransactionReceipt({ hash });
          return true;
        } catch {
          return false;
        }
      });
      
      const results = await Promise.all(txPromises);
      const batchAdded = results.filter(r => r).length;
      const batchErrors = results.filter(r => !r).length;
      
      added += batchAdded;
      errors += batchErrors;
      
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = (added / elapsed).toFixed(1);
      const remaining_count = remaining.length - added - errors;
      const eta = remaining_count > 0 ? ((remaining_count / parseFloat(rate)) / 60).toFixed(1) : "0";
      
      console.log(`   Batch ${batchNum}/${totalBatches}: +${batchAdded} | Total: ${firstBatch.length + added}/${addresses.length} | ${rate}/s | ETA: ${eta}m`);
    }
  }
  
  // Step 3: Update token
  console.log(`\n🔒 Step 3: Updating token to use policy ${newPolicyId}...`);
  
  const updateHash = await walletClient.writeContract({
    address: CONTRACTS.ETHOS_USD_TOKEN,
    abi: TIP20_ABI,
    functionName: "changeTransferPolicyId",
    args: [newPolicyId],
  });
  await publicClient.waitForTransactionReceipt({ hash: updateHash });
  console.log(`   ✅ Token updated`);
  
  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("✨ Complete!\n");
  console.log(`   Policy ID:       ${newPolicyId}`);
  console.log(`   Total addresses: ${addresses.length}`);
  console.log(`\n📝 Update .env: ETHOS_POLICY_ID=${newPolicyId}`);
}

main().catch((error) => {
  console.error("❌ Error:", error.message || error);
  Deno.exit(1);
});

