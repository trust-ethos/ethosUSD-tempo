#!/usr/bin/env -S deno run -A
/**
 * Fast parallel upload of addresses to the on-chain whitelist
 * 
 * Usage: deno run -A scripts/upload-whitelist-fast.ts <csv-file> [batch-size]
 * 
 * Default batch size is 20 (sends 20 transactions in parallel)
 */

import "$std/dotenv/load.ts";
import { CONTRACTS, TIP403_REGISTRY_ABI } from "../lib/contracts.ts";
import { createTempoPublicClient, createTempoWalletClient, getAdminPrivateKey } from "../lib/tempo.ts";

interface CSVEntry {
  address: string;
  allowed: boolean;
}

async function parseCSV(filePath: string): Promise<CSVEntry[]> {
  const content = await Deno.readTextFile(filePath);
  const lines = content.split("\n").filter(line => line.trim());
  
  const header = lines[0].toLowerCase().split(",").map(h => h.trim());
  const addressIndex = header.indexOf("address");
  const allowedIndex = header.indexOf("allowed");
  
  if (addressIndex === -1) throw new Error("CSV must have 'address' column");
  
  const entries: CSVEntry[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map(v => v.trim());
    const address = values[addressIndex];
    
    if (!address || !address.startsWith("0x") || address.length !== 42) continue;
    
    entries.push({
      address: address.toLowerCase(),
      allowed: allowedIndex === -1 ? true : values[allowedIndex]?.toLowerCase() === "true",
    });
  }
  
  return entries;
}

async function main() {
  const csvPath = Deno.args[0];
  const BATCH_SIZE = parseInt(Deno.args[1] || "20", 10);
  
  if (!csvPath) {
    console.log("Usage: deno run -A scripts/upload-whitelist-fast.ts <csv-file> [batch-size]");
    Deno.exit(1);
  }
  
  console.log("\n⚡ Fast Parallel Whitelist Upload\n");
  console.log("=".repeat(50));
  
  const entries = await parseCSV(csvPath);
  console.log(`\n📄 Loaded ${entries.length} addresses from ${csvPath}`);
  console.log(`   Batch size: ${BATCH_SIZE} parallel transactions`);
  
  const privateKey = getAdminPrivateKey();
  const publicClient = createTempoPublicClient();
  const walletClient = createTempoWalletClient(privateKey);
  
  console.log(`\n📍 Admin: ${walletClient.account!.address}`);
  console.log(`   Policy ID: ${CONTRACTS.POLICY_ID}\n`);
  
  // First, check which addresses need updating
  console.log("🔍 Checking current whitelist status...");
  
  const toAdd: string[] = [];
  const alreadyDone: string[] = [];
  
  // Check in batches of 50 for speed
  for (let i = 0; i < entries.length; i += 50) {
    const batch = entries.slice(i, i + 50);
    const checks = await Promise.all(
      batch.map(async (entry) => {
        const isAuthorized = await publicClient.readContract({
          address: CONTRACTS.TIP403_REGISTRY,
          abi: TIP403_REGISTRY_ABI,
          functionName: "isAuthorized",
          args: [CONTRACTS.POLICY_ID, entry.address as `0x${string}`],
        });
        return { address: entry.address, shouldAdd: entry.allowed && !isAuthorized };
      })
    );
    
    for (const { address, shouldAdd } of checks) {
      if (shouldAdd) {
        toAdd.push(address);
      } else {
        alreadyDone.push(address);
      }
    }
    
    process.stdout.write(`\r   Checked ${Math.min(i + 50, entries.length)}/${entries.length}`);
  }
  
  console.log(`\n\n   Already whitelisted: ${alreadyDone.length}`);
  console.log(`   Need to add: ${toAdd.length}`);
  
  if (toAdd.length === 0) {
    console.log("\n✅ All addresses already whitelisted!");
    return;
  }
  
  // Process in parallel batches
  console.log(`\n🚀 Adding ${toAdd.length} addresses in batches of ${BATCH_SIZE}...\n`);
  
  let added = 0;
  let errors = 0;
  const startTime = Date.now();
  
  for (let i = 0; i < toAdd.length; i += BATCH_SIZE) {
    const batch = toAdd.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(toAdd.length / BATCH_SIZE);
    
    console.log(`   Batch ${batchNum}/${totalBatches} (${batch.length} addresses)...`);
    
    // Send all transactions in parallel
    const txPromises = batch.map(async (address) => {
      try {
        const hash = await walletClient.writeContract({
          address: CONTRACTS.TIP403_REGISTRY,
          abi: TIP403_REGISTRY_ABI,
          functionName: "modifyPolicyWhitelist",
          args: [CONTRACTS.POLICY_ID, address as `0x${string}`, true],
        });
        return { address, hash, success: true };
      } catch (error) {
        return { address, error, success: false };
      }
    });
    
    const results = await Promise.all(txPromises);
    
    // Wait for all receipts in parallel
    const receiptPromises = results
      .filter(r => r.success && r.hash)
      .map(async (r) => {
        try {
          await publicClient.waitForTransactionReceipt({ hash: r.hash! });
          return { address: r.address, success: true };
        } catch {
          return { address: r.address, success: false };
        }
      });
    
    const receipts = await Promise.all(receiptPromises);
    
    const batchAdded = receipts.filter(r => r.success).length;
    const batchErrors = results.filter(r => !r.success).length + receipts.filter(r => !r.success).length;
    
    added += batchAdded;
    errors += batchErrors;
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const rate = (added / parseFloat(elapsed)).toFixed(1);
    const eta = toAdd.length > added ? (((toAdd.length - added) / parseFloat(rate)) / 60).toFixed(1) : "0";
    
    console.log(`   ✅ ${batchAdded} added | ${errors} errors | ${added}/${toAdd.length} total | ${rate}/sec | ETA: ${eta}min`);
  }
  
  // Summary
  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  
  console.log("\n" + "=".repeat(50));
  console.log("📊 Complete!\n");
  console.log(`   Total added:    ${added}`);
  console.log(`   Already done:   ${alreadyDone.length}`);
  console.log(`   Errors:         ${errors}`);
  console.log(`   Time:           ${totalTime} minutes`);
  console.log();
}

main().catch((error) => {
  console.error("❌ Error:", error);
  Deno.exit(1);
});

