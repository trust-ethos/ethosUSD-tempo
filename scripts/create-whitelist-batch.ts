#!/usr/bin/env -S deno run -A
/**
 * Create a new whitelist policy with ALL addresses in a single transaction
 * 
 * Usage: deno run -A scripts/create-whitelist-batch.ts <csv-file>
 * 
 * This uses createPolicyWithAccounts() to add all addresses at once,
 * then updates the token to use the new policy.
 */

import "$std/dotenv/load.ts";
import { CONTRACTS, TIP403_REGISTRY_ABI, TIP20_ABI, POLICY_TYPE } from "../lib/contracts.ts";
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
  
  return addresses;
}

async function main() {
  const csvPath = Deno.args[0];
  
  if (!csvPath) {
    console.log("Usage: deno run -A scripts/create-whitelist-batch.ts <csv-file>");
    Deno.exit(1);
  }
  
  console.log("\n🚀 Batch Whitelist Creation (Single Transaction)\n");
  console.log("=".repeat(50));
  
  // Parse CSV
  const addresses = await parseCSV(csvPath);
  console.log(`\n📄 Loaded ${addresses.length} addresses from ${csvPath}`);
  
  // Add admin address if not in list
  const privateKey = getAdminPrivateKey();
  const publicClient = createTempoPublicClient();
  const walletClient = createTempoWalletClient(privateKey);
  const adminAddress = walletClient.account!.address.toLowerCase();
  
  if (!addresses.includes(adminAddress)) {
    addresses.unshift(adminAddress);
    console.log(`   Added admin address to list`);
  }
  
  console.log(`   Total addresses: ${addresses.length}`);
  console.log(`\n📍 Admin: ${adminAddress}`);
  console.log(`   Token: ${CONTRACTS.ETHOS_USD_TOKEN}`);
  
  // Create new policy with all accounts
  console.log(`\n📋 Step 1: Creating whitelist policy with ${addresses.length} addresses...`);
  console.log(`   (This is a single transaction)`);
  
  const createHash = await walletClient.writeContract({
    address: CONTRACTS.TIP403_REGISTRY,
    abi: TIP403_REGISTRY_ABI,
    functionName: "createPolicyWithAccounts",
    args: [
      adminAddress as `0x${string}`,
      POLICY_TYPE.WHITELIST,
      addresses as `0x${string}`[],
    ],
  });
  
  console.log(`   Transaction: ${createHash}`);
  console.log(`   Waiting for confirmation...`);
  
  const receipt = await publicClient.waitForTransactionReceipt({ hash: createHash });
  
  if (receipt.status !== "success") {
    throw new Error("Policy creation failed!");
  }
  
  // Get the new policy ID
  const policyIdCounter = await publicClient.readContract({
    address: CONTRACTS.TIP403_REGISTRY,
    abi: TIP403_REGISTRY_ABI,
    functionName: "policyIdCounter",
  });
  const newPolicyId = policyIdCounter - 1n;
  
  console.log(`   ✅ Policy created with ID: ${newPolicyId}`);
  
  // Update the token to use the new policy
  console.log(`\n🔒 Step 2: Updating token to use new policy...`);
  
  const updateHash = await walletClient.writeContract({
    address: CONTRACTS.ETHOS_USD_TOKEN,
    abi: TIP20_ABI,
    functionName: "changeTransferPolicyId",
    args: [newPolicyId],
  });
  
  console.log(`   Transaction: ${updateHash}`);
  await publicClient.waitForTransactionReceipt({ hash: updateHash });
  console.log(`   ✅ Token now uses policy ID: ${newPolicyId}`);
  
  // Verify
  console.log(`\n🔍 Step 3: Verifying...`);
  
  const currentPolicy = await publicClient.readContract({
    address: CONTRACTS.ETHOS_USD_TOKEN,
    abi: TIP20_ABI,
    functionName: "transferPolicyId",
  });
  
  // Check a few random addresses
  const sampleAddresses = [addresses[0], addresses[Math.floor(addresses.length / 2)], addresses[addresses.length - 1]];
  
  for (const addr of sampleAddresses) {
    const isAuth = await publicClient.readContract({
      address: CONTRACTS.TIP403_REGISTRY,
      abi: TIP403_REGISTRY_ABI,
      functionName: "isAuthorized",
      args: [newPolicyId, addr as `0x${string}`],
    });
    console.log(`   ${addr.slice(0, 10)}... authorized: ${isAuth}`);
  }
  
  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("✨ Complete!\n");
  console.log(`   New Policy ID:     ${newPolicyId}`);
  console.log(`   Addresses added:   ${addresses.length}`);
  console.log(`   Token policy:      ${currentPolicy}`);
  console.log(`\n📝 Update your .env:`);
  console.log(`   ETHOS_POLICY_ID=${newPolicyId}`);
  console.log();
}

main().catch((error) => {
  console.error("❌ Error:", error.message || error);
  Deno.exit(1);
});

