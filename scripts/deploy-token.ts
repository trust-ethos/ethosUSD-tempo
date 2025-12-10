#!/usr/bin/env -S deno run -A
/**
 * Deploy the $ethosUSD token and TIP-403 whitelist policy using tempo.ts SDK
 * 
 * Usage: deno task deploy:token
 * 
 * Required environment variables:
 * - ADMIN_PRIVATE_KEY: Private key for the admin account
 * 
 * This script will:
 * 1. Create a TIP-403 whitelist policy
 * 2. Create the $ethosUSD TIP-20 token using tempo.ts SDK
 * 3. Mint initial supply to the admin
 * 4. Set the token's transfer policy to our whitelist (AFTER minting)
 */

import "$std/dotenv/load.ts";
import { createClient, http, publicActions, walletActions } from "npm:viem@2.41.2";
import { privateKeyToAccount } from "npm:viem@2.41.2/accounts";
import { tempo } from "npm:tempo.ts@0.10.5/chains";
import { tempoActions } from "npm:tempo.ts@0.10.5/viem";
import {
  CONTRACTS,
  ALPHA_USD,
  TIP20_ABI,
  TIP403_REGISTRY_ABI,
  POLICY_TYPE,
} from "../lib/contracts.ts";
import { formatTokenAmount } from "../lib/tempo.ts";

const TOKEN_NAME = "Ethos USD";
const TOKEN_SYMBOL = "ethosUSD";
const INITIAL_MINT_AMOUNT = BigInt(1_000_000) * BigInt(10 ** 6); // 1,000,000 tokens

function getAdminPrivateKey(): `0x${string}` {
  const key = Deno.env.get("ADMIN_PRIVATE_KEY");
  if (!key) {
    throw new Error("ADMIN_PRIVATE_KEY environment variable is required");
  }
  if (!key.startsWith("0x")) {
    return `0x${key}`;
  }
  return key as `0x${string}`;
}

async function main() {
  console.log("\n🚀 Deploying $ethosUSD on Tempo Testnet\n");
  console.log("=".repeat(50));

  // Initialize client with tempo.ts SDK
  const privateKey = getAdminPrivateKey();
  const account = privateKeyToAccount(privateKey);
  
  // Create client with Tempo extensions
  const client = createClient({
    account,
    chain: tempo({ feeToken: ALPHA_USD }),
    transport: http("https://rpc.testnet.tempo.xyz"),
  })
    .extend(publicActions)
    .extend(walletActions)
    .extend(tempoActions());

  const adminAddress = account.address;
  console.log(`\n📍 Admin Address: ${adminAddress}`);

  // Step 1: Create TIP-403 Whitelist Policy
  console.log("\n📋 Step 1: Creating TIP-403 whitelist policy...");
  
  const createPolicyHash = await client.writeContract({
    address: CONTRACTS.TIP403_REGISTRY,
    abi: TIP403_REGISTRY_ABI,
    functionName: "createPolicy",
    args: [adminAddress, POLICY_TYPE.WHITELIST],
  });

  console.log(`   Transaction: ${createPolicyHash}`);
  
  await client.waitForTransactionReceipt({
    hash: createPolicyHash,
  });

  // Get the latest policy ID
  const policyIdCounter = await client.readContract({
    address: CONTRACTS.TIP403_REGISTRY,
    abi: TIP403_REGISTRY_ABI,
    functionName: "policyIdCounter",
  });
  const policyId = policyIdCounter - 1n;

  console.log(`   ✅ Policy created with ID: ${policyId}`);

  // Step 2: Add admin to whitelist
  console.log("\n📝 Step 2: Adding admin to whitelist...");
  
  const addAdminHash = await client.writeContract({
    address: CONTRACTS.TIP403_REGISTRY,
    abi: TIP403_REGISTRY_ABI,
    functionName: "modifyPolicyWhitelist",
    args: [policyId, adminAddress, true],
  });

  await client.waitForTransactionReceipt({ hash: addAdminHash });
  console.log(`   ✅ Admin added to whitelist`);

  // Step 3: Create the $ethosUSD Token using tempo.ts SDK
  console.log("\n🪙 Step 3: Creating the $ethosUSD token...");
  console.log(`   Name: ${TOKEN_NAME}`);
  console.log(`   Symbol: ${TOKEN_SYMBOL}`);
  console.log(`   Currency: USD`);

  // Use the tempo.ts token.create action
  const createResult = await client.token.createSync({
    name: TOKEN_NAME,
    symbol: TOKEN_SYMBOL,
    currency: "USD",
  });

  const tokenAddress = createResult.token;
  console.log(`   ✅ Token created at: ${tokenAddress}`);
  console.log(`   Transaction: ${createResult.receipt.transactionHash}`);

  // Step 4: Grant ISSUER_ROLE to admin and mint
  console.log("\n💰 Step 4: Granting ISSUER_ROLE and minting...");

  // Get ISSUER_ROLE hash
  const issuerRole = await client.readContract({
    address: tokenAddress,
    abi: TIP20_ABI,
    functionName: "ISSUER_ROLE",
  });
  console.log(`   ISSUER_ROLE: ${issuerRole}`);

  // Grant ISSUER_ROLE to admin
  const grantRoleHash = await client.writeContract({
    address: tokenAddress,
    abi: TIP20_ABI,
    functionName: "grantRole",
    args: [issuerRole, adminAddress],
  });
  await client.waitForTransactionReceipt({ hash: grantRoleHash });
  console.log(`   ✅ ISSUER_ROLE granted to admin`);

  // Now mint
  const mintResult = await client.token.mintSync({
    token: tokenAddress,
    to: adminAddress,
    amount: INITIAL_MINT_AMOUNT,
  });

  console.log(`   ✅ Minted ${formatTokenAmount(INITIAL_MINT_AMOUNT)} ${TOKEN_SYMBOL} to admin`);
  console.log(`   Transaction: ${mintResult.receipt.transactionHash}`);

  // Step 5: Set transfer policy on token (AFTER minting)
  console.log("\n🔒 Step 5: Setting transfer policy on token...");

  const setPolicyHash = await client.writeContract({
    address: tokenAddress,
    abi: TIP20_ABI,
    functionName: "changeTransferPolicyId",
    args: [policyId],
  });

  await client.waitForTransactionReceipt({ hash: setPolicyHash });
  console.log(`   ✅ Transfer policy set to ID: ${policyId}`);

  // Verify deployment
  console.log("\n" + "=".repeat(50));
  console.log("✨ Deployment Complete!\n");

  const balance = await client.readContract({
    address: tokenAddress,
    abi: TIP20_ABI,
    functionName: "balanceOf",
    args: [adminAddress],
  });

  const currentPolicyId = await client.readContract({
    address: tokenAddress,
    abi: TIP20_ABI,
    functionName: "transferPolicyId",
  });

  console.log("📊 Deployment Summary:");
  console.log(`   Token Address:   ${tokenAddress}`);
  console.log(`   Token Symbol:    ${TOKEN_SYMBOL}`);
  console.log(`   Policy ID:       ${policyId}`);
  console.log(`   Current Policy:  ${currentPolicyId}`);
  console.log(`   Admin Balance:   ${formatTokenAmount(balance)} ${TOKEN_SYMBOL}`);

  console.log("\n📝 Add these to your .env file:");
  console.log(`   ETHOS_USD_TOKEN=${tokenAddress}`);
  console.log(`   ETHOS_POLICY_ID=${policyId}`);
  console.log();
}

main().catch((error) => {
  console.error("❌ Deployment failed:", error);
  Deno.exit(1);
});
