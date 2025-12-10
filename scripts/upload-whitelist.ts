#!/usr/bin/env -S deno run -A
/**
 * Upload addresses to the on-chain whitelist from a CSV file
 * 
 * Usage: deno run -A scripts/upload-whitelist.ts <csv-file>
 * 
 * CSV Format (two options):
 * 
 * Option 1 - Just addresses (will check Ethos scores):
 *   address
 *   0x1234...
 *   0x5678...
 * 
 * Option 2 - Addresses with explicit allow/deny:
 *   address,allowed
 *   0x1234...,true
 *   0x5678...,false
 * 
 * Required environment variables:
 * - ADMIN_PRIVATE_KEY: Private key for the admin account
 */

import "$std/dotenv/load.ts";
import { CONTRACTS, TIP403_REGISTRY_ABI } from "../lib/contracts.ts";
import { createTempoPublicClient, createTempoWalletClient, getAdminPrivateKey } from "../lib/tempo.ts";
import { getScoreByAddress, MIN_ETHOS_SCORE } from "../lib/ethos.ts";

interface CSVEntry {
  address: string;
  allowed?: boolean; // If not specified, will check Ethos score
  score?: number;
}

async function parseCSV(filePath: string): Promise<CSVEntry[]> {
  const content = await Deno.readTextFile(filePath);
  const lines = content.split("\n").filter(line => line.trim());
  
  if (lines.length === 0) {
    throw new Error("CSV file is empty");
  }
  
  // Parse header
  const header = lines[0].toLowerCase().split(",").map(h => h.trim());
  const addressIndex = header.indexOf("address");
  const allowedIndex = header.indexOf("allowed");
  const scoreIndex = header.indexOf("score");
  
  if (addressIndex === -1) {
    throw new Error("CSV must have an 'address' column");
  }
  
  const entries: CSVEntry[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map(v => v.trim());
    const address = values[addressIndex];
    
    if (!address || !address.startsWith("0x") || address.length !== 42) {
      console.warn(`Skipping invalid address on line ${i + 1}: ${address}`);
      continue;
    }
    
    const entry: CSVEntry = { address: address.toLowerCase() };
    
    if (allowedIndex !== -1 && values[allowedIndex]) {
      entry.allowed = values[allowedIndex].toLowerCase() === "true";
    }
    
    if (scoreIndex !== -1 && values[scoreIndex]) {
      entry.score = parseInt(values[scoreIndex], 10);
    }
    
    entries.push(entry);
  }
  
  return entries;
}

async function main() {
  const csvPath = Deno.args[0];
  
  if (!csvPath) {
    console.log(`
Usage: deno run -A scripts/upload-whitelist.ts <csv-file>

CSV Format Options:

1. Just addresses (checks Ethos scores automatically):
   address
   0x1234567890123456789012345678901234567890
   0xabcdef1234567890123456789012345678901234

2. Addresses with explicit allow/deny (skips score check):
   address,allowed
   0x1234567890123456789012345678901234567890,true
   0xabcdef1234567890123456789012345678901234,false

3. Addresses with scores (for reference, still uses 'allowed' column):
   address,allowed,score
   0x1234567890123456789012345678901234567890,true,1650
   0xabcdef1234567890123456789012345678901234,false,800
`);
    Deno.exit(1);
  }
  
  console.log("\n📋 Uploading Whitelist from CSV\n");
  console.log("=".repeat(50));
  
  // Parse CSV
  console.log(`\n📄 Reading: ${csvPath}`);
  const entries = await parseCSV(csvPath);
  console.log(`   Found ${entries.length} addresses`);
  
  // Initialize clients
  const privateKey = getAdminPrivateKey();
  const publicClient = createTempoPublicClient();
  const walletClient = createTempoWalletClient(privateKey);
  const adminAddress = walletClient.account!.address;
  
  console.log(`\n📍 Admin: ${adminAddress}`);
  console.log(`   Policy ID: ${CONTRACTS.POLICY_ID}`);
  
  if (CONTRACTS.POLICY_ID === 0n) {
    console.error("\n❌ Error: ETHOS_POLICY_ID not configured");
    console.log("   Run 'deno task deploy:token' first to create a policy.");
    Deno.exit(1);
  }
  
  // Process entries
  console.log("\n🔄 Processing addresses...\n");
  
  const results = {
    added: [] as string[],
    removed: [] as string[],
    skipped: [] as string[],
    errors: [] as string[],
  };
  
  for (const entry of entries) {
    const { address } = entry;
    let shouldAllow = entry.allowed;
    
    // If 'allowed' not specified, check Ethos score
    if (shouldAllow === undefined) {
      console.log(`   Checking Ethos score for ${address.slice(0, 10)}...`);
      const scoreData = await getScoreByAddress(address);
      
      if (scoreData === null) {
        console.log(`   ⚠️  No Ethos profile found, skipping`);
        results.skipped.push(address);
        continue;
      }
      
      shouldAllow = scoreData.score >= MIN_ETHOS_SCORE;
      console.log(`   Score: ${scoreData.score} → ${shouldAllow ? "eligible" : "not eligible"}`);
    }
    
    // Check current on-chain status
    const isCurrentlyAuthorized = await publicClient.readContract({
      address: CONTRACTS.TIP403_REGISTRY,
      abi: TIP403_REGISTRY_ABI,
      functionName: "isAuthorized",
      args: [CONTRACTS.POLICY_ID, address as `0x${string}`],
    });
    
    // Skip if already in desired state
    if (isCurrentlyAuthorized === shouldAllow) {
      console.log(`   ✓ ${address.slice(0, 10)}... already ${shouldAllow ? "whitelisted" : "not whitelisted"}`);
      results.skipped.push(address);
      continue;
    }
    
    // Update on-chain
    try {
      console.log(`   ${shouldAllow ? "Adding" : "Removing"} ${address.slice(0, 10)}...`);
      
      const hash = await walletClient.writeContract({
        address: CONTRACTS.TIP403_REGISTRY,
        abi: TIP403_REGISTRY_ABI,
        functionName: "modifyPolicyWhitelist",
        args: [CONTRACTS.POLICY_ID, address as `0x${string}`, shouldAllow],
      });
      
      await publicClient.waitForTransactionReceipt({ hash });
      
      if (shouldAllow) {
        results.added.push(address);
        console.log(`   ✅ Added to whitelist`);
      } else {
        results.removed.push(address);
        console.log(`   ❌ Removed from whitelist`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      results.errors.push(`${address}: ${msg}`);
      console.log(`   ⚠️  Error: ${msg.slice(0, 50)}...`);
    }
  }
  
  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("📊 Summary\n");
  console.log(`   Total processed: ${entries.length}`);
  console.log(`   Added:           ${results.added.length}`);
  console.log(`   Removed:         ${results.removed.length}`);
  console.log(`   Skipped:         ${results.skipped.length}`);
  console.log(`   Errors:          ${results.errors.length}`);
  
  if (results.added.length > 0) {
    console.log("\n   ✅ Added:");
    results.added.forEach(a => console.log(`      ${a}`));
  }
  
  if (results.removed.length > 0) {
    console.log("\n   ❌ Removed:");
    results.removed.forEach(a => console.log(`      ${a}`));
  }
  
  if (results.errors.length > 0) {
    console.log("\n   ⚠️  Errors:");
    results.errors.forEach(e => console.log(`      ${e}`));
  }
  
  console.log();
}

main().catch((error) => {
  console.error("❌ Error:", error);
  Deno.exit(1);
});

