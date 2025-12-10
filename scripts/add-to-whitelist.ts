#!/usr/bin/env -S deno run -A
/**
 * Add addresses to an existing whitelist policy efficiently
 * 
 * Uses proper nonce management to send transactions without waiting for confirmation
 * 
 * Usage: deno run -A scripts/add-to-whitelist.ts <csv-file> [policy-id] [start-index]
 */

import "$std/dotenv/load.ts";
import { CONTRACTS, TIP403_REGISTRY_ABI } from "../lib/contracts.ts";
import { createTempoPublicClient, createTempoWalletClient, getAdminPrivateKey } from "../lib/tempo.ts";

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
  return [...new Set(addresses)];
}

async function main() {
  const csvPath = Deno.args[0];
  const policyIdArg = Deno.args[1];
  const startIndex = parseInt(Deno.args[2] || "0", 10);
  
  if (!csvPath) {
    console.log("Usage: deno run -A scripts/add-to-whitelist.ts <csv-file> [policy-id] [start-index]");
    console.log("\nExamples:");
    console.log("  deno run -A scripts/add-to-whitelist.ts data/whitelist.csv");
    console.log("  deno run -A scripts/add-to-whitelist.ts data/whitelist.csv 145");
    console.log("  deno run -A scripts/add-to-whitelist.ts data/whitelist.csv 145 450  # Skip first 450");
    Deno.exit(1);
  }
  
  const policyId = policyIdArg ? BigInt(policyIdArg) : CONTRACTS.POLICY_ID;
  
  console.log("\n📋 Adding Addresses to Whitelist\n");
  console.log("=".repeat(50));
  
  const allAddresses = await parseCSV(csvPath);
  const addresses = allAddresses.slice(startIndex);
  
  console.log(`\n📄 Total in CSV: ${allAddresses.length}`);
  console.log(`   Starting from: ${startIndex}`);
  console.log(`   To process: ${addresses.length}`);
  console.log(`   Policy ID: ${policyId}`);
  
  const privateKey = getAdminPrivateKey();
  const publicClient = createTempoPublicClient();
  const walletClient = createTempoWalletClient(privateKey);
  const adminAddress = walletClient.account!.address;
  
  console.log(`   Admin: ${adminAddress}`);
  
  // Check which addresses are already authorized
  console.log(`\n🔍 Checking existing whitelist status...`);
  
  const toAdd: string[] = [];
  const checkBatchSize = 100;
  
  for (let i = 0; i < addresses.length; i += checkBatchSize) {
    const batch = addresses.slice(i, i + checkBatchSize);
    const checks = await Promise.all(
      batch.map(async (addr) => {
        try {
          const isAuth = await publicClient.readContract({
            address: CONTRACTS.TIP403_REGISTRY,
            abi: TIP403_REGISTRY_ABI,
            functionName: "isAuthorized",
            args: [policyId, addr as `0x${string}`],
          });
          return { addr, isAuth };
        } catch {
          return { addr, isAuth: false };
        }
      })
    );
    
    for (const { addr, isAuth } of checks) {
      if (!isAuth) toAdd.push(addr);
    }
    
    process.stdout.write(`\r   Checked ${Math.min(i + checkBatchSize, addresses.length)}/${addresses.length}`);
  }
  
  console.log(`\n   Already whitelisted: ${addresses.length - toAdd.length}`);
  console.log(`   Need to add: ${toAdd.length}`);
  
  if (toAdd.length === 0) {
    console.log("\n✅ All addresses already whitelisted!");
    return;
  }
  
  // Add addresses with nonce management
  console.log(`\n🚀 Adding ${toAdd.length} addresses...`);
  console.log(`   (Sending transactions without waiting for confirmation)\n`);
  
  let nonce = await publicClient.getTransactionCount({ address: adminAddress });
  const pendingTxs: { hash: `0x${string}`; addr: string }[] = [];
  const startTime = Date.now();
  let sent = 0;
  let errors = 0;
  
  // Send all transactions
  for (const addr of toAdd) {
    try {
      const hash = await walletClient.writeContract({
        address: CONTRACTS.TIP403_REGISTRY,
        abi: TIP403_REGISTRY_ABI,
        functionName: "modifyPolicyWhitelist",
        args: [policyId, addr as `0x${string}`, true],
        nonce: nonce,
      });
      
      pendingTxs.push({ hash, addr });
      nonce++;
      sent++;
      
      if (sent % 50 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = (sent / elapsed).toFixed(1);
        console.log(`   Sent ${sent}/${toAdd.length} | ${rate} tx/s`);
      }
    } catch (error) {
      errors++;
      console.log(`   ❌ Failed to send for ${addr.slice(0, 10)}...`);
    }
  }
  
  console.log(`\n   ✅ Sent ${sent} transactions`);
  console.log(`   ⏳ Waiting for confirmations...\n`);
  
  // Wait for confirmations in batches
  let confirmed = 0;
  const confirmBatchSize = 50;
  
  for (let i = 0; i < pendingTxs.length; i += confirmBatchSize) {
    const batch = pendingTxs.slice(i, i + confirmBatchSize);
    
    await Promise.all(
      batch.map(async ({ hash }) => {
        try {
          await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
          confirmed++;
        } catch {
          // Transaction might have failed
        }
      })
    );
    
    console.log(`   Confirmed: ${confirmed}/${sent}`);
  }
  
  // Summary
  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  
  console.log("\n" + "=".repeat(50));
  console.log("✨ Complete!\n");
  console.log(`   Sent:      ${sent}`);
  console.log(`   Confirmed: ${confirmed}`);
  console.log(`   Errors:    ${errors}`);
  console.log(`   Time:      ${totalTime} minutes`);
  console.log();
}

main().catch((error) => {
  console.error("❌ Error:", error.message || error);
  Deno.exit(1);
});

