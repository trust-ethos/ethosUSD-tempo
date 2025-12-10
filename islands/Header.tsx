import { useSignal, useComputed } from "@preact/signals";
import { useEffect } from "preact/hooks";
import ConnectWallet from "./ConnectWallet.tsx";
import { 
  getConnectedAccount, 
  watchAccount,
  onDisconnect,
  getPublicClient, 
  CONTRACTS, 
  TIP20_ABI,
  formatAmount 
} from "../lib/wallet.ts";

// AlphaUSD is the native gas token on Tempo
const ALPHA_USD_ADDRESS = "0x20c0000000000000000000000000000000000001" as const;
const MIN_GAS_BALANCE = 1000n; // 0.001 USD minimum for transactions

interface HeaderProps {
  currentPath?: string;
}

export default function Header({ currentPath = "/" }: HeaderProps) {
  const address = useSignal<string | null>(null);
  const balance = useSignal<bigint | null>(null);
  const hasGas = useSignal<boolean | null>(null);
  
  const formattedBalance = useComputed(() => {
    if (balance.value === null) return null;
    return formatAmount(balance.value);
  });

  const fetchBalances = async (addr: string) => {
    try {
      const client = getPublicClient();
      
      // Fetch both ethosUSD balance and AlphaUSD (gas token) balance
      const [ethosBalance, alphaBalance] = await Promise.all([
        client.readContract({
          address: CONTRACTS.ETHOS_USD_TOKEN,
          abi: TIP20_ABI,
          functionName: "balanceOf",
          args: [addr as `0x${string}`],
        }) as Promise<bigint>,
        client.readContract({
          address: ALPHA_USD_ADDRESS,
          abi: TIP20_ABI,
          functionName: "balanceOf",
          args: [addr as `0x${string}`],
        }) as Promise<bigint>,
      ]);
      
      balance.value = ethosBalance;
      // AlphaUSD is the guaranteed gas token - warn if they don't have any
      hasGas.value = alphaBalance >= MIN_GAS_BALANCE;
    } catch (err) {
      console.error("Error fetching balances:", err);
      balance.value = 0n;
      hasGas.value = null; // Unknown, don't show warning
    }
  };

  useEffect(() => {
    // Check initial connection
    getConnectedAccount().then((account) => {
      if (account) {
        address.value = account;
        fetchBalances(account);
      }
    });

    // Watch for account changes from wallet
    const unwatchAccount = watchAccount((account) => {
      address.value = account;
      if (account) {
        fetchBalances(account);
      } else {
        balance.value = null;
        hasGas.value = null;
      }
    });

    // Watch for manual disconnect
    const unwatchDisconnect = onDisconnect(() => {
      address.value = null;
      balance.value = null;
      hasGas.value = null;
    });

    // Refresh balance periodically
    const interval = setInterval(() => {
      if (address.value) {
        fetchBalances(address.value);
      }
    }, 15000);

    return () => {
      unwatchAccount();
      unwatchDisconnect();
      clearInterval(interval);
    };
  }, []);

  return (
    <header class="border-b border-ethos-border/50 backdrop-blur-sm bg-ethos-darker/80 sticky top-0 z-50">
      <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-16">
          <a href="/" class="flex items-center gap-3 group">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-ethos-primary to-ethos-secondary flex items-center justify-center shadow-lg shadow-ethos-primary/30 group-hover:shadow-ethos-primary/50 transition-shadow">
              <span class="text-white font-bold text-lg">$</span>
            </div>
            <div>
              <h1 class="text-xl font-bold text-gradient">$ethosUSD</h1>
              <p class="text-xs text-gray-500">The stablecoin built on credibility</p>
            </div>
          </a>
          
          {/* Only show nav links when NOT connected */}
          {!address.value && (
            <nav class="hidden sm:flex items-center gap-6">
              <a 
                href="https://ethos.network" 
                target="_blank"
                rel="noopener noreferrer"
                class="text-gray-400 hover:text-white transition-colors"
              >
                Ethos Network
              </a>
              <a 
                href="https://docs.tempo.xyz" 
                target="_blank"
                rel="noopener noreferrer"
                class="text-gray-400 hover:text-white transition-colors"
              >
                Tempo Docs
              </a>
            </nav>
          )}

          <div class="flex items-center gap-4">
            {/* Show balance when connected */}
            {address.value && formattedBalance.value !== null && (
              <div class="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-ethos-card border border-ethos-border rounded-lg">
                <span class="font-mono font-semibold text-white">{formattedBalance.value}</span>
                <span class="text-ethos-accent text-sm font-medium">$ethosUSD</span>
              </div>
            )}
            
            <ConnectWallet 
              onConnect={(addr) => {
                address.value = addr;
                fetchBalances(addr);
              }}
              onDisconnect={() => {
                address.value = null;
                balance.value = null;
                hasGas.value = null;
              }}
            />
          </div>
        </div>
      </div>

      {/* Gas warning banner */}
      {address.value && hasGas.value === false && (
        <div class="bg-orange-500/20 border-b border-orange-500/30">
          <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
            <div class="flex items-center justify-center gap-3 text-sm">
              <svg class="w-5 h-5 text-orange-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span class="text-orange-300">
                <strong>No gas tokens!</strong> You need AlphaUSD to send transactions.
              </span>
              <a 
                href="https://docs.tempo.xyz/quickstart/faucet" 
                target="_blank" 
                rel="noopener noreferrer"
                class="px-3 py-1 bg-orange-500/30 hover:bg-orange-500/50 text-orange-200 rounded-md font-medium transition-colors"
              >
                Get free gas →
              </a>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
