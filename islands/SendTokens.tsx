import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { encodeFunctionData } from "viem";
import { 
  getConnectedAccount, 
  sendTransaction, 
  getPublicClient,
  watchAccount,
  CONTRACTS, 
  TIP20_ABI, 
  parseAmount, 
  truncateAddress 
} from "../lib/wallet.ts";

// AlphaUSD is the native gas token on Tempo Testnet
const ALPHA_USD_ADDRESS = "0x20c0000000000000000000000000000000000001" as const;
const MIN_FEE_BALANCE = 1000n; // 0.001 USD minimum for a transaction

interface ExternalUser {
  name: string;
  username: string | null;
  avatar: string | null;
  score: number;
  address: string;
  primaryAddress: string;
  profileId: number;
  isAuthorized: boolean;
}

interface SendTokensProps {
  tokenAddress?: string;
  onSuccess?: (txHash: string) => void;
  externalUser?: ExternalUser;
  onUserCleared?: () => void;
}

interface SearchResult {
  userkey: string;
  avatar: string | null;
  name: string;
  username: string | null;
  score: number;
  profileId: number;
  primaryAddress: string;
  whitelistedAddress: string | null;
  isAuthorized: boolean;
}

interface SelectedUser {
  name: string;
  username: string | null;
  avatar: string | null;
  score: number;
  address: string; // This will be the whitelisted address if available
  primaryAddress: string;
  profileId: number;
  isAuthorized: boolean;
}

export default function SendTokens({ 
  tokenAddress = CONTRACTS.ETHOS_USD_TOKEN, 
  onSuccess,
  externalUser,
  onUserCleared
}: SendTokensProps) {
  const searchQuery = useSignal("");
  const searchResults = useSignal<SearchResult[]>([]);
  const selectedUser = useSignal<SelectedUser | null>(null);
  const isSearching = useSignal(false);
  const showDropdown = useSignal(false);
  const amount = useSignal("");
  const isLoading = useSignal(false);
  const error = useSignal<string | null>(null);
  const success = useSignal<string | null>(null);
  const connectedAddress = useSignal<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const feeTokenBalance = useSignal<bigint | null>(null);
  const hasSufficientFees = useSignal(true);

  // Set selectedUser when externalUser is provided (from Quick Send)
  useEffect(() => {
    if (externalUser) {
      selectedUser.value = {
        name: externalUser.name,
        username: externalUser.username,
        avatar: externalUser.avatar,
        score: externalUser.score,
        address: externalUser.address,
        primaryAddress: externalUser.primaryAddress,
        profileId: externalUser.profileId,
        isAuthorized: externalUser.isAuthorized,
      };
    }
  }, [externalUser]);

  // Check if user has enough AlphaUSD for gas
  const checkFeeTokenBalance = async (address: string) => {
    try {
      const client = getPublicClient();
      
      // Check AlphaUSD balance (the guaranteed gas token on Tempo)
      const alphaBalance = await client.readContract({
        address: ALPHA_USD_ADDRESS,
        abi: TIP20_ABI,
        functionName: "balanceOf",
        args: [address as `0x${string}`],
      }) as bigint;
      
      feeTokenBalance.value = alphaBalance;
      hasSufficientFees.value = alphaBalance >= MIN_FEE_BALANCE;
    } catch (err) {
      console.error("Error checking fee token balance:", err);
      hasSufficientFees.value = true; // Don't block if we can't check
    }
  };

  // Check connected account and fee token balance on mount
  useEffect(() => {
    getConnectedAccount().then((account) => {
      connectedAddress.value = account;
      if (account) {
        checkFeeTokenBalance(account);
      }
    });

    // Watch for account changes
    const unwatch = watchAccount((account) => {
      connectedAddress.value = account;
      if (account) {
        checkFeeTokenBalance(account);
      } else {
        feeTokenBalance.value = null;
        hasSufficientFees.value = true;
      }
    });

    return () => unwatch();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        showDropdown.value = false;
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced search
  useEffect(() => {
    const query = searchQuery.value.trim();
    if (query.length < 2) {
      searchResults.value = [];
      return;
    }

    isSearching.value = true;
    const timeout = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search-users?query=${encodeURIComponent(query)}`);
        const data = await response.json();
        searchResults.value = data.results || [];
        showDropdown.value = true;
      } catch {
        searchResults.value = [];
      } finally {
        isSearching.value = false;
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [searchQuery.value]);

  const handleSelectUser = (user: SearchResult) => {
    // Use whitelisted address if available, otherwise fall back to primary
    const sendToAddress = user.whitelistedAddress || user.primaryAddress;
    
    selectedUser.value = {
      name: user.name,
      username: user.username,
      avatar: user.avatar,
      score: user.score,
      address: sendToAddress,
      primaryAddress: user.primaryAddress,
      profileId: user.profileId,
      isAuthorized: user.isAuthorized,
    };
    searchQuery.value = "";
    searchResults.value = [];
    showDropdown.value = false;
  };

  const handleClearUser = () => {
    selectedUser.value = null;
    searchQuery.value = "";
    onUserCleared?.();
  };

  const handleSend = async () => {
    const account = await getConnectedAccount();
    if (!account) {
      error.value = "Please connect your wallet first";
      return;
    }

    if (!selectedUser.value) {
      error.value = "Please select a recipient";
      return;
    }

    const amountValue = amount.value.trim();
    if (!amountValue || isNaN(parseFloat(amountValue)) || parseFloat(amountValue) <= 0) {
      error.value = "Please enter a valid amount";
      return;
    }

    isLoading.value = true;
    error.value = null;
    success.value = null;

    try {
      // Ensure we're on the correct chain (0xa5bd = 42429)
      const currentChainId = await window.ethereum?.request({ method: "eth_chainId" }) as string;
      const tempoChainId = "0xa5bd";
      
      if (currentChainId?.toLowerCase() !== tempoChainId) {
        try {
          await window.ethereum?.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: tempoChainId }],
          });
        } catch (switchError: unknown) {
          const errCode = (switchError as { code?: number })?.code;
          if (errCode === 4902 || errCode === -32603) {
            try {
              await window.ethereum?.request({
                method: "wallet_addEthereumChain",
                params: [{
                  chainId: tempoChainId,
                  chainName: "Tempo Testnet",
                  nativeCurrency: {
                    name: "USD",
                    symbol: "USD",
                    decimals: 6,
                  },
                  rpcUrls: ["https://rpc.testnet.tempo.xyz"],
                  blockExplorerUrls: ["https://explore.tempo.xyz"],
                }],
              });
            } catch (addError) {
              console.error("Failed to add chain:", addError);
              error.value = "Please add Tempo Testnet to your wallet manually";
              isLoading.value = false;
              return;
            }
          } else if (errCode === 4001) {
            error.value = "Please switch to Tempo Testnet to send tokens";
            isLoading.value = false;
            return;
          } else {
            console.error("Chain switch error:", switchError);
            error.value = "Failed to switch network. Please switch to Tempo Testnet manually.";
            isLoading.value = false;
            return;
          }
        }
        
        const newChainId = await window.ethereum?.request({ method: "eth_chainId" }) as string;
        if (newChainId?.toLowerCase() !== tempoChainId) {
          error.value = "Please switch to Tempo Testnet in your wallet, then try again";
          isLoading.value = false;
          return;
        }
      }

      const amountBigInt = parseAmount(amountValue);
      const recipientAddress = selectedUser.value.address;

      // Encode the transfer function call
      const data = encodeFunctionData({
        abi: TIP20_ABI,
        functionName: "transfer",
        args: [recipientAddress as `0x${string}`, amountBigInt],
      });

      // Send transaction via wallet
      const hash = await sendTransaction({
        to: tokenAddress as `0x${string}`,
        data,
        from: account,
      });

      console.log("Transaction submitted:", hash);
      
      // Wait for confirmation on Tempo to ensure transaction went to the right chain
      const client = getPublicClient();
      
      try {
        const receipt = await client.waitForTransactionReceipt({ 
          hash, 
          timeout: 30_000,
          confirmations: 1,
        });

        if (receipt.status === "reverted") {
          throw new Error("Transaction reverted on chain");
        }

        console.log("Transaction confirmed in block", receipt.blockNumber);
        
        // Now show success
        success.value = hash;
        selectedUser.value = null;
        amount.value = "";
        onUserCleared?.();
        onSuccess?.(hash);
      } catch (receiptError) {
        console.error("Receipt error:", receiptError);
        const receiptMessage = receiptError instanceof Error ? receiptError.message : String(receiptError);
        
        if (receiptMessage.includes("timeout") || receiptMessage.includes("Timeout")) {
          // Transaction might have been sent to wrong chain
          error.value = "Transaction not found on Tempo. If using a hardware wallet, make sure Tempo Testnet is selected in MetaMask before signing.";
        } else if (receiptMessage.includes("reverted")) {
          error.value = "Transaction reverted. Check that both you and the recipient are whitelisted.";
        } else {
          error.value = `Transaction may have failed: ${receiptMessage.slice(0, 100)}`;
        }
        return;
      }
    } catch (err) {
      console.error("Send transaction error:", err);
      const message = err instanceof Error ? err.message : String(err);
      const shortMessage = message.slice(0, 200);
      
      if (message.includes("User rejected") || message.includes("user rejected") || message.includes("denied")) {
        error.value = "Transaction was cancelled";
      } else if (message.includes("insufficient") || message.includes("Insufficient")) {
        error.value = "Insufficient balance to complete this transfer";
      } else if (message.includes("not authorized") || message.includes("Unauthorized") || message.includes("0x82b42900")) {
        error.value = "Transfer not authorized. You or the recipient may not be whitelisted.";
      } else if (message.includes("revert") || message.includes("execution reverted")) {
        if (message.includes("PolicyUnauthorized") || message.includes("0x")) {
          error.value = "Transfer blocked by policy. Both sender and recipient must be whitelisted.";
        } else {
          error.value = "Transaction reverted. Check that both you and the recipient are whitelisted.";
        }
      } else if (message.includes("network") || message.includes("RPC") || message.includes("fetch")) {
        error.value = "Network error. Please check your connection and try again.";
      } else if (message.includes("gas") || message.includes("Gas")) {
        error.value = "Gas estimation failed. The transaction may not be allowed.";
      } else {
        error.value = `Transaction failed: ${shortMessage}`;
      }
    } finally {
      isLoading.value = false;
    }
  };

  const getScoreClass = (score: number) => {
    if (score >= 1600) return "ethos-score-high";
    if (score >= 1200) return "ethos-score-medium";
    return "ethos-score-low";
  };

  return (
    <div class="card p-6" style={showDropdown.value ? "position: relative; z-index: 100;" : ""}>
      <h2 class="text-xl font-semibold text-white mb-6">Send $ethosUSD</h2>

      <div class="space-y-4">
        {/* Recipient Search */}
        <div>
          <label class="label">Recipient</label>
          
          {selectedUser.value ? (
            // Selected user display - compact version
            <div class="bg-dark-card border border-dark-border rounded-lg p-3">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  {selectedUser.value.avatar ? (
                    <img 
                      src={selectedUser.value.avatar} 
                      alt="" 
                      class="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div class="w-10 h-10 rounded-full bg-ethos-primary/20 flex items-center justify-center">
                      <span class="text-ethos-primary font-semibold">
                        {selectedUser.value.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div>
                    <div class="flex items-center gap-2">
                      <span class="text-white font-medium">{selectedUser.value.name}</span>
                      <span class={`text-sm ${getScoreClass(selectedUser.value.score)}`}>
                        {selectedUser.value.score}
                      </span>
                      {selectedUser.value.isAuthorized ? (
                        <svg class="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" title="Whitelisted">
                          <path d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg class="w-4 h-4 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" title="Not whitelisted">
                          <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      )}
                    </div>
                    <div class="text-xs text-gray-500 font-mono">
                      {truncateAddress(selectedUser.value.address)}
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleClearUser}
                  class="p-1 text-gray-400 hover:text-white transition-colors"
                  title="Clear selection"
                >
                  <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ) : (
            // Search input
            <div class="relative" ref={dropdownRef}>
              <div class="relative">
                <input
                  type="text"
                  value={searchQuery.value}
                  onInput={(e) => searchQuery.value = (e.target as HTMLInputElement).value}
                  onFocus={() => searchResults.value.length > 0 && (showDropdown.value = true)}
                  placeholder="Search by name, username, or address..."
                  class="input pl-10"
                  disabled={isLoading.value}
                />
                <svg 
                  class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  stroke-width="2"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
                {isSearching.value && (
                  <svg class="absolute right-3 top-1/2 -translate-y-1/2 animate-spin h-5 w-5 text-gray-500" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
              </div>

              {/* Search Results Dropdown */}
              {showDropdown.value && searchResults.value.length > 0 && (
                <div class="absolute mt-2 bg-[#1a1f2e] border border-dark-border rounded-lg shadow-2xl max-h-96 overflow-y-auto" style="left: -24px; right: -24px; z-index: 9999;">
                  {searchResults.value.map((user) => (
                    <button
                      key={user.userkey}
                      onClick={() => handleSelectUser(user)}
                      class="w-full px-5 py-4 flex items-center gap-4 hover:bg-white/10 transition-colors text-left border-b border-dark-border/50 last:border-b-0"
                    >
                      {user.avatar ? (
                        <img 
                          src={user.avatar} 
                          alt="" 
                          class="w-12 h-12 rounded-full object-cover flex-shrink-0"
                        />
                      ) : (
                        <div class="w-12 h-12 rounded-full bg-ethos-primary/20 flex items-center justify-center flex-shrink-0">
                          <span class="text-ethos-primary font-semibold text-lg">
                            {user.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2">
                          <span class="text-white font-medium text-base">{user.name}</span>
                          <span class={`text-sm flex-shrink-0 ${getScoreClass(user.score)}`}>
                            {user.score}
                          </span>
                          {user.isAuthorized ? (
                            <span class="flex items-center gap-1 text-xs text-emerald-400" title="Whitelisted">
                              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M5 13l4 4L19 7" />
                              </svg>
                            </span>
                          ) : (
                            <span class="flex items-center gap-1 text-xs text-amber-400" title="Not yet whitelisted">
                              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </span>
                          )}
                        </div>
                        {user.username && (
                          <div class="text-sm text-gray-400">@{user.username}</div>
                        )}
                        <div class="text-xs text-gray-500 font-mono mt-0.5">
                          {user.isAuthorized && user.whitelistedAddress 
                            ? `→ ${truncateAddress(user.whitelistedAddress)}`
                            : truncateAddress(user.primaryAddress)}
                        </div>
                      </div>
                      <svg class="w-5 h-5 text-gray-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </button>
                  ))}
                </div>
              )}

              {/* No results message */}
              {showDropdown.value && searchQuery.value.length >= 2 && !isSearching.value && searchResults.value.length === 0 && (
                <div class="absolute mt-2 bg-[#1a1f2e] border border-dark-border rounded-lg shadow-2xl p-5 text-center" style="left: -24px; right: -24px; z-index: 9999;">
                  <p class="text-gray-400 text-sm">No eligible users found</p>
                  <p class="text-gray-500 text-xs mt-1">Only users with score ≥ 1400 can receive $ethosUSD</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Amount Input */}
        <div>
          <label class="label">Amount</label>
          <div class="relative">
            <input
              type="text"
              value={amount.value}
              onInput={(e) => amount.value = (e.target as HTMLInputElement).value}
              placeholder="0.00"
              class="input pr-24 font-mono"
              disabled={isLoading.value}
            />
            <span class="absolute right-4 top-1/2 -translate-y-1/2 text-ethos-accent font-semibold">
              $ethosUSD
            </span>
          </div>
        </div>

        {/* Warning if user doesn't have fee tokens */}
        {!hasSufficientFees.value && (
          <div class="p-3 bg-orange-500/20 border border-orange-500/30 rounded-lg text-orange-400 text-sm">
            <div class="flex items-start gap-2">
              <svg class="w-5 h-5 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <strong>No gas tokens:</strong> You need AlphaUSD to pay transaction fees.
                <div class="mt-1">
                  <a 
                    href="https://docs.tempo.xyz/quickstart/faucet" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    class="text-ethos-accent hover:underline font-medium"
                  >
                    Get free tokens from the faucet →
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {error.value && (
          <div class="p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {error.value}
          </div>
        )}

        {success.value && (
          <div class="p-3 bg-emerald-500/20 border border-emerald-500/30 rounded-lg text-emerald-400 text-sm">
            <div class="font-medium">Transaction submitted!</div>
            <a 
              href={`https://explore.tempo.xyz/receipt/${success.value}`}
              target="_blank"
              rel="noopener noreferrer"
              class="text-ethos-accent hover:underline break-all"
            >
              View on Explorer →
            </a>
          </div>
        )}

        <button
          onClick={handleSend}
          disabled={isLoading.value || !selectedUser.value || !amount.value}
          class="w-full btn-primary"
        >
          {isLoading.value ? (
            <span class="flex items-center justify-center gap-2">
              <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Sending...
            </span>
          ) : (
            "Send"
          )}
        </button>
      </div>

      <p class="mt-4 text-sm text-gray-500 text-center">
        Only users with Ethos score ≥ 1400 can receive $ethosUSD
      </p>
    </div>
  );
}
