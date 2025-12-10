import { useSignal, useComputed } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { 
  getPublicClient, 
  getConnectedAccount, 
  watchAccount,
  onDisconnect,
  CONTRACTS, 
  TIP20_ABI, 
  formatAmount 
} from "../lib/wallet.ts";

interface WalletBalanceProps {
  tokenAddress?: string;
  refreshInterval?: number;
}

export default function WalletBalance({ 
  tokenAddress = CONTRACTS.ETHOS_USD_TOKEN, 
  refreshInterval = 10000 
}: WalletBalanceProps) {
  const balance = useSignal<bigint | null>(null);
  const isLoading = useSignal(true);
  const address = useSignal<string | null>(null);

  const formattedBalance = useComputed(() => {
    if (balance.value === null) return "—";
    return formatAmount(balance.value);
  });

  const fetchBalance = async (userAddress: string) => {
    try {
      const client = getPublicClient();
      const result = await client.readContract({
        address: tokenAddress as `0x${string}`,
        abi: TIP20_ABI,
        functionName: "balanceOf",
        args: [userAddress as `0x${string}`],
      });
      balance.value = result as bigint;
    } catch (err) {
      console.error("Error fetching balance:", err);
      balance.value = 0n;
    } finally {
      isLoading.value = false;
    }
  };

  useEffect(() => {
    // Check initial account
    getConnectedAccount().then((account) => {
      if (account) {
        address.value = account;
        fetchBalance(account);
      } else {
        isLoading.value = false;
      }
    });

    // Watch for account changes
    const unwatchAccount = watchAccount((account) => {
      if (account) {
        address.value = account;
        isLoading.value = true;
        fetchBalance(account);
      } else {
        address.value = null;
        balance.value = null;
      }
    });

    // Watch for manual disconnect
    const unwatchDisconnect = onDisconnect(() => {
      address.value = null;
      balance.value = null;
    });

    // Set up refresh interval
    const interval = setInterval(() => {
      if (address.value) {
        fetchBalance(address.value);
      }
    }, refreshInterval);

    return () => {
      unwatchAccount();
      unwatchDisconnect();
      clearInterval(interval);
    };
  }, [tokenAddress]);

  if (!address.value) {
    return (
      <div class="card p-6">
        <div class="text-gray-500 text-center">
          Connect wallet to view balance
        </div>
      </div>
    );
  }

  return (
    <div class="card p-6">
      <div class="flex items-center justify-between mb-2">
        <span class="text-sm text-gray-400">Your Balance</span>
        {isLoading.value && (
          <svg class="animate-spin h-4 w-4 text-gray-500" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
      </div>
      <div class="flex items-baseline gap-2">
        <span class="text-3xl font-bold text-white font-mono">
          {formattedBalance.value}
        </span>
        <span class="text-lg text-ethos-accent font-semibold">$ethosUSD</span>
      </div>
      <div class="mt-4 flex items-center gap-2 text-sm text-gray-500">
        <div class="w-2 h-2 rounded-full bg-emerald-400" />
        <span>Tempo Testnet</span>
      </div>
    </div>
  );
}
