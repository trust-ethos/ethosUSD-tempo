#!/usr/bin/env -S deno run -A
/**
 * Sync the TIP-403 whitelist with current Ethos scores
 * 
 * Usage: deno task sync:whitelist
 * 
 * This script will:
 * 1. Load seed addresses from CSV or environment
 * 2. Fetch Ethos scores for all addresses
 * 3. Add/remove addresses from the whitelist based on scores
 */

import "$std/dotenv/load.ts";
import { syncWhitelist } from "../lib/whitelist.ts";
import { MIN_ETHOS_SCORE } from "../lib/ethos.ts";
import { CONTRACTS } from "../lib/contracts.ts";

async function main() {
  console.log("\n🔄 Syncing $ethosUSD whitelist\n");
  console.log("=".repeat(50));
  console.log(`   Minimum Ethos Score: ${MIN_ETHOS_SCORE}`);
  console.log(`   Policy ID: ${CONTRACTS.POLICY_ID}`);
  console.log(`   Token: ${CONTRACTS.ETHOS_USD_TOKEN || "(not set)"}`);
  console.log("=".repeat(50));

  if (CONTRACTS.POLICY_ID === 0n) {
    console.error("\n❌ Error: ETHOS_POLICY_ID not configured");
    console.error("   Run 'deno task deploy:token' first");
    Deno.exit(1);
  }

  console.log("\n📊 Fetching Ethos scores and syncing whitelist...\n");

  const result = await syncWhitelist();

  console.log(`   Addresses checked: ${result.checked}`);
  console.log(`   Addresses added:   ${result.added.length}`);
  console.log(`   Addresses removed: ${result.removed.length}`);

  if (result.added.length > 0) {
    console.log("\n   ✅ Added to whitelist:");
    for (const addr of result.added) {
      const score = result.scores.get(addr);
      console.log(`      ${addr} (score: ${score})`);
    }
  }

  if (result.removed.length > 0) {
    console.log("\n   ❌ Removed from whitelist:");
    for (const addr of result.removed) {
      const score = result.scores.get(addr);
      console.log(`      ${addr} (score: ${score ?? "unknown"})`);
    }
  }

  if (result.errors.length > 0) {
    console.log("\n   ⚠️  Errors:");
    for (const error of result.errors) {
      console.log(`      ${error}`);
    }
  }

  console.log("\n✨ Sync complete!\n");
}

main().catch((error) => {
  console.error("❌ Sync failed:", error);
  Deno.exit(1);
});

