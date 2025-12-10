import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { truncateAddress, formatAmount, CONTRACTS } from "../lib/wallet.ts";

interface Transfer {
  from: string;
  to: string;
  value: string;
  transactionHash: string;
  blockNumber: number;
  timestamp?: number;
}

interface EthosUserInfo {
  address: string;
  name: string | null;
  username: string | null;
  avatar: string | null;
  score: number;
}

interface TransactionLogProps {
  tokenAddress?: string;
  limit?: number;
  filterAddress?: string;
  refreshInterval?: number;
}

export default function TransactionLog({ 
  tokenAddress = CONTRACTS.ETHOS_USD_TOKEN, 
  limit = 20, 
  filterAddress,
  refreshInterval = 30000 
}: TransactionLogProps) {
  const transfers = useSignal<Transfer[]>([]);
  const userInfos = useSignal<Record<string, EthosUserInfo>>({});
  const isLoading = useSignal(true);
  const error = useSignal<string | null>(null);

  const fetchTransfers = async () => {
    try {
      const params = new URLSearchParams({
        token: tokenAddress,
        limit: limit.toString(),
      });
      if (filterAddress) {
        params.set("address", filterAddress);
      }

      const response = await fetch(`/api/transfers?${params}`);
      if (!response.ok) throw new Error("Failed to fetch transfers");
      
      const data = await response.json();
      transfers.value = data.transfers || [];

      // Fetch Ethos user info for all addresses
      if (transfers.value.length > 0) {
        const addresses = new Set<string>();
        transfers.value.forEach(tx => {
          if (tx.from !== "0x0000000000000000000000000000000000000000") {
            addresses.add(tx.from.toLowerCase());
          }
          if (tx.to !== "0x0000000000000000000000000000000000000000") {
            addresses.add(tx.to.toLowerCase());
          }
        });

        if (addresses.size > 0) {
          const usersResponse = await fetch(`/api/ethos-users?addresses=${Array.from(addresses).join(",")}`);
          if (usersResponse.ok) {
            const usersData = await usersResponse.json();
            userInfos.value = usersData.users || {};
          }
        }
      }
    } catch (err) {
      console.error("Error fetching transfers:", err);
      error.value = "Unable to load transfers";
    } finally {
      isLoading.value = false;
    }
  };

  useEffect(() => {
    fetchTransfers();
    const interval = setInterval(fetchTransfers, refreshInterval);
    return () => clearInterval(interval);
  }, [tokenAddress, filterAddress]);

  const getUserInfo = (address: string): EthosUserInfo | null => {
    return userInfos.value[address.toLowerCase()] || null;
  };

  const renderAddress = (address: string, direction: "from" | "to") => {
    const isMint = address === "0x0000000000000000000000000000000000000000";
    const user = getUserInfo(address);
    
    if (isMint) {
      return (
        <div class="flex items-center gap-2">
          <div class="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
            <svg class="w-3 h-3 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clip-rule="evenodd" />
            </svg>
          </div>
          <span class="text-emerald-400 text-sm font-medium">Mint</span>
        </div>
      );
    }

    return (
      <a 
        href={`https://app.ethos.network/profile/${address}`}
        target="_blank"
        rel="noopener noreferrer"
        class="flex items-center gap-2 group"
        title={address}
      >
        {/* Avatar */}
        {user?.avatar ? (
          <img 
            src={user.avatar} 
            alt={user.name || ""} 
            class="w-6 h-6 rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <div class="w-6 h-6 rounded-full bg-ethos-primary/20 flex items-center justify-center flex-shrink-0">
            <span class="text-ethos-primary text-xs font-semibold">
              {(user?.name || address).charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        
        {/* Name or address */}
        <span class="text-sm text-gray-300 group-hover:text-white truncate max-w-[100px]">
          {user?.name || user?.username || truncateAddress(address)}
        </span>
        
        {/* Score badge */}
        {user && user.score > 0 && (
          <span class={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${
            user.score >= 1400 
              ? "bg-emerald-500/20 text-emerald-400" 
              : "bg-amber-500/20 text-amber-400"
          }`}>
            {user.score}
          </span>
        )}
      </a>
    );
  };

  if (isLoading.value) {
    return (
      <div class="card">
        <div class="p-6 border-b border-ethos-border/50">
          <h2 class="text-xl font-semibold text-white">Recent Transactions</h2>
        </div>
        <div class="p-8 flex justify-center">
          <svg class="animate-spin h-8 w-8 text-ethos-primary" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      </div>
    );
  }

  if (transfers.value.length === 0) {
    return (
      <div class="card">
        <div class="p-6 border-b border-ethos-border/50">
          <h2 class="text-xl font-semibold text-white">Recent Transactions</h2>
        </div>
        <div class="p-8 text-center text-gray-500">
          {error.value ? (
            <p>{error.value}</p>
          ) : (
            <p>No transactions yet. Be the first to send $ethosUSD!</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div class="card overflow-hidden">
      <div class="p-6 border-b border-ethos-border/50 flex items-center justify-between">
        <h2 class="text-xl font-semibold text-white">Recent Transactions</h2>
        <span class="text-sm text-gray-500">{transfers.value.length} transfers</span>
      </div>

      <div class="divide-y divide-ethos-border/30">
        {transfers.value.map((tx, i) => (
          <a 
            key={tx.transactionHash + i} 
            href={`https://explore.tempo.xyz/receipt/${tx.transactionHash}`}
            target="_blank"
            rel="noopener noreferrer"
            class="tx-row animate-fade-in hover:bg-ethos-card/30 transition-colors block group" 
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div class="flex items-center justify-between gap-4">
              <div class="flex items-center gap-3 min-w-0 flex-1">
                {/* From */}
                {renderAddress(tx.from, "from")}
                
                {/* Arrow */}
                <svg class="w-4 h-4 text-gray-600 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M5 12h14m-7-7l7 7-7 7" />
                </svg>
                
                {/* To */}
                {renderAddress(tx.to, "to")}
              </div>

              {/* Amount */}
              <div class="text-right flex-shrink-0">
                <div class="font-mono font-semibold text-white">
                  {formatAmount(BigInt(tx.value))}
                </div>
                <div class="text-xs text-ethos-accent">$ethosUSD</div>
              </div>

              {/* Open in Explorer icon */}
              <div class="flex-shrink-0 text-gray-500 group-hover:text-ethos-accent transition-colors" title="View on Tempo Explorer">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                  <path d="M15 3h6v6" />
                  <path d="M10 14L21 3" />
                </svg>
              </div>
            </div>
          </a>
        ))}
      </div>

      {transfers.value.length >= limit && (
        <div class="p-4 text-center border-t border-ethos-border/50">
          <a 
            href={`https://explore.tempo.xyz/token/${tokenAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            class="text-sm text-ethos-accent hover:underline"
          >
            View all transactions on Explorer →
          </a>
        </div>
      )}
    </div>
  );
}
