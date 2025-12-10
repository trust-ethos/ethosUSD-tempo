/**
 * Add liquidity to the Fee AMM to enable ethosUSD for fee payments
 * 
 * This pairs ethosUSD with AlphaUSD (which is already fee-enabled)
 * so users can pay transaction fees in ethosUSD.
 * 
 * Run: deno task fee:liquidity
 */

import "https://deno.land/std@0.216.0/dotenv/load.ts";
import { createPublicClient, createWalletClient, http, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CONTRACTS, TIP20_ABI, ALPHA_USD } from "../lib/contracts.ts";

// Fee AMM/Manager contract address (predeployed on Tempo)
const FEE_AMM_ADDRESS = "0xfeec000000000000000000000000000000000000" as const;

// Fee AMM ABI (subset for adding liquidity)
const FEE_AMM_ABI = [
  {
    name: "mint",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "userToken", type: "address" },
      { name: "validatorToken", type: "address" },
      { name: "amountUserToken", type: "uint256" },
      { name: "amountValidatorToken", type: "uint256" },
      { name: "to", type: "address" },
    ],
    outputs: [{ name: "liquidity", type: "uint256" }],
  },
  {
    name: "mintWithValidatorToken",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "userToken", type: "address" },
      { name: "validatorToken", type: "address" },
      { name: "amountValidatorToken", type: "uint256" },
      { name: "to", type: "address" },
    ],
    outputs: [{ name: "liquidity", type: "uint256" }],
  },
  {
    name: "getPool",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "userToken", type: "address" },
      { name: "validatorToken", type: "address" },
    ],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "reserveUserToken", type: "uint128" },
          { name: "reserveValidatorToken", type: "uint128" },
        ],
      },
    ],
  },
  {
    name: "totalSupply",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "poolId", type: "bytes32" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

const chain = {
  id: 42429,
  name: "Tempo Testnet",
  nativeCurrency: { name: "USD", symbol: "USD", decimals: 6 },
  rpcUrls: { default: { http: ["https://rpc.testnet.tempo.xyz"] } },
} as const;

async function main() {
  const privateKey = Deno.env.get("ADMIN_PRIVATE_KEY");
  if (!privateKey) {
    throw new Error("ADMIN_PRIVATE_KEY environment variable is required");
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  console.log("Admin address:", account.address);

  const publicClient = createPublicClient({
    chain,
    transport: http(),
  });

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(),
  });

  const ethosUsdAddress = CONTRACTS.ETHOS_USD_TOKEN;
  console.log("\nethosUSD address:", ethosUsdAddress);
  console.log("AlphaUSD address:", ALPHA_USD);

  // Check current pool status
  console.log("\n=== Current Pool Status ===");
  try {
    const pool = await publicClient.readContract({
      address: FEE_AMM_ADDRESS,
      abi: FEE_AMM_ABI,
      functionName: "getPool",
      args: [ethosUsdAddress, ALPHA_USD],
    });
    console.log("Pool reserves:");
    console.log("  ethosUSD:", Number(pool.reserveUserToken) / 1_000_000);
    console.log("  AlphaUSD:", Number(pool.reserveValidatorToken) / 1_000_000);
    
    if (pool.reserveValidatorToken > 0n) {
      console.log("\n✅ Pool already has liquidity! ethosUSD should be fee-enabled.");
      return;
    }
  } catch (error) {
    console.log("No pool exists yet or error reading pool:", error.message);
  }

  // Check admin balances
  console.log("\n=== Admin Balances ===");
  const ethosBalance = await publicClient.readContract({
    address: ethosUsdAddress,
    abi: TIP20_ABI,
    functionName: "balanceOf",
    args: [account.address],
  }) as bigint;
  console.log("ethosUSD balance:", Number(ethosBalance) / 1_000_000);

  const alphaBalance = await publicClient.readContract({
    address: ALPHA_USD,
    abi: TIP20_ABI,
    functionName: "balanceOf",
    args: [account.address],
  }) as bigint;
  console.log("AlphaUSD balance:", Number(alphaBalance) / 1_000_000);

  // Amount of AlphaUSD to add as liquidity (e.g., 10,000)
  const liquidityAmount = parseUnits("10000", 6); // 10,000 AlphaUSD

  if (alphaBalance < liquidityAmount) {
    console.log("\n❌ Insufficient AlphaUSD balance!");
    console.log(`Need ${Number(liquidityAmount) / 1_000_000} AlphaUSD, have ${Number(alphaBalance) / 1_000_000}`);
    console.log("\nGet AlphaUSD from the faucet: https://docs.tempo.xyz/quickstart/faucet");
    return;
  }

  // First, approve the Fee AMM to spend AlphaUSD
  console.log("\n=== Approving AlphaUSD for Fee AMM ===");
  const approveHash = await walletClient.writeContract({
    address: ALPHA_USD,
    abi: [
      {
        name: "approve",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [
          { name: "spender", type: "address" },
          { name: "amount", type: "uint256" },
        ],
        outputs: [{ type: "bool" }],
      },
    ],
    functionName: "approve",
    args: [FEE_AMM_ADDRESS, liquidityAmount],
  });
  console.log("Approval tx:", approveHash);
  await publicClient.waitForTransactionReceipt({ hash: approveHash });
  console.log("✅ Approved");

  // Also approve ethosUSD (the AMM will pull both tokens)
  console.log("\n=== Approving ethosUSD for Fee AMM ===");
  const approveEthosHash = await walletClient.writeContract({
    address: ethosUsdAddress,
    abi: [
      {
        name: "approve",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [
          { name: "spender", type: "address" },
          { name: "amount", type: "uint256" },
        ],
        outputs: [{ type: "bool" }],
      },
    ],
    functionName: "approve",
    args: [FEE_AMM_ADDRESS, liquidityAmount],
  });
  console.log("Approval tx:", approveEthosHash);
  await publicClient.waitForTransactionReceipt({ hash: approveEthosHash });
  console.log("✅ Approved");

  // Add liquidity to the Fee AMM
  console.log("\n=== Adding Liquidity to Fee AMM ===");
  console.log(`Adding ${Number(liquidityAmount) / 1_000_000} AlphaUSD worth of liquidity...`);
  
  try {
    // Use mintWithValidatorToken - it only requires validator token amount
    const mintHash = await walletClient.writeContract({
      address: FEE_AMM_ADDRESS,
      abi: FEE_AMM_ABI,
      functionName: "mintWithValidatorToken",
      args: [
        ethosUsdAddress, // userToken: ethosUSD (the token to enable)
        ALPHA_USD, // validatorToken: AlphaUSD (already enabled)
        liquidityAmount, // amount of validator token
        account.address, // to: receive LP tokens
      ],
    });
    console.log("Mint tx:", mintHash);
    
    const receipt = await publicClient.waitForTransactionReceipt({ hash: mintHash });
    console.log("Receipt status:", receipt.status);
    
    if (receipt.status === "success") {
      console.log("\n✅ Liquidity added successfully!");
      console.log("ethosUSD is now enabled for fee payments!");
      
      // Check new pool status
      const newPool = await publicClient.readContract({
        address: FEE_AMM_ADDRESS,
        abi: FEE_AMM_ABI,
        functionName: "getPool",
        args: [ethosUsdAddress, ALPHA_USD],
      });
      console.log("\nNew pool reserves:");
      console.log("  ethosUSD:", Number(newPool.reserveUserToken) / 1_000_000);
      console.log("  AlphaUSD:", Number(newPool.reserveValidatorToken) / 1_000_000);
    } else {
      console.log("❌ Transaction reverted");
    }
  } catch (error) {
    console.error("Error adding liquidity:", error);
    console.log("\nNote: The Fee AMM contract address or ABI might be different.");
    console.log("Check Tempo docs for the correct predeployed contract address.");
  }
}

main().catch(console.error);

