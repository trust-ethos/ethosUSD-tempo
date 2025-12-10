import { useSignal, useComputed } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { getConnectedAccount, watchAccount, onDisconnect, signMessage, getClaimMessage } from "../lib/wallet.ts";

interface ClaimStatus {
  canClaim: boolean;
  amount: string;
  amountFormatted: string;
  xp: number;
  score?: number;
  alreadyClaimed: boolean;
  claimRecord?: {
    txHash: string;
    timestamp: number;
    amount: string;
  };
  error?: string;
}

export default function ClaimReward() {
  const address = useSignal<string | null>(null);
  const claimStatus = useSignal<ClaimStatus | null>(null);
  const isLoading = useSignal(false);
  const isClaiming = useSignal(false);
  const claimResult = useSignal<{
    success: boolean;
    txHash?: string;
    amountFormatted?: string;
    error?: string;
  } | null>(null);

  const formatNumber = (num: number) => {
    return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
  };

  const fetchClaimStatus = async (addr: string) => {
    isLoading.value = true;
    try {
      const response = await fetch(`/api/claim-status?address=${addr}`);
      const data = await response.json();
      claimStatus.value = data;
    } catch (error) {
      console.error("Error fetching claim status:", error);
      claimStatus.value = null;
    } finally {
      isLoading.value = false;
    }
  };

  const handleClaim = async () => {
    if (!address.value || !claimStatus.value?.canClaim) return;

    isClaiming.value = true;
    claimResult.value = null;

    try {
      // Generate timestamp and message for signing
      const timestamp = Date.now();
      const message = getClaimMessage(address.value, timestamp);

      // Request signature from wallet
      let signature: string;
      try {
        signature = await signMessage(message, address.value as `0x${string}`);
      } catch (signError) {
        const errorMessage = signError instanceof Error ? signError.message : String(signError);
        if (errorMessage.includes("User rejected") || errorMessage.includes("user rejected") || errorMessage.includes("denied")) {
          claimResult.value = {
            success: false,
            error: "Signature request was cancelled",
          };
        } else {
          claimResult.value = {
            success: false,
            error: "Failed to sign message. Please try again.",
          };
        }
        isClaiming.value = false;
        return;
      }

      // Send claim request with signature
      const response = await fetch("/api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          address: address.value,
          signature,
          timestamp,
        }),
      });

      const data = await response.json();

      if (data.success) {
        claimResult.value = {
          success: true,
          txHash: data.txHash,
          amountFormatted: data.amountFormatted,
        };
        // Refresh claim status
        fetchClaimStatus(address.value);
      } else {
        claimResult.value = {
          success: false,
          error: data.error,
        };
      }
    } catch (error) {
      claimResult.value = {
        success: false,
        error: "Failed to process claim. Please try again.",
      };
    } finally {
      isClaiming.value = false;
    }
  };

  useEffect(() => {
    getConnectedAccount().then((account) => {
      if (account) {
        address.value = account;
        fetchClaimStatus(account);
      }
    });

    const unwatchAccount = watchAccount((account) => {
      address.value = account;
      if (account) {
        fetchClaimStatus(account);
      } else {
        claimStatus.value = null;
        claimResult.value = null;
      }
    });

    const unwatchDisconnect = onDisconnect(() => {
      address.value = null;
      claimStatus.value = null;
      claimResult.value = null;
    });

    return () => {
      unwatchAccount();
      unwatchDisconnect();
    };
  }, []);

  // Don't show if not connected or already claimed
  if (!address.value || claimStatus.value?.alreadyClaimed) {
    return null;
  }

  return (
    <div class="card overflow-hidden">
      <div class="p-6 border-b border-ethos-border/50 bg-gradient-to-r from-ethos-primary/10 to-ethos-secondary/10">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-ethos-primary/20 flex items-center justify-center">
            <svg class="w-5 h-5 text-ethos-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h2 class="text-xl font-semibold text-white">Claim Your $ethosUSD</h2>
            <p class="text-sm text-gray-400">1 Contributor XP = 1 $ethosUSD</p>
          </div>
        </div>
      </div>

      <div class="p-6">
        {isLoading.value ? (
          <div class="flex items-center justify-center py-8">
            <svg class="animate-spin h-8 w-8 text-ethos-primary" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : claimStatus.value?.alreadyClaimed ? (
          // Already claimed state
          <div class="text-center py-4">
            <div class="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
              <svg class="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 class="text-lg font-semibold text-white mb-2">Already Claimed!</h3>
            <p class="text-gray-400 mb-4">
              You claimed <span class="text-white font-semibold">{(Number(claimStatus.value.claimRecord?.amount) / 1_000_000).toFixed(0)} $ethosUSD</span>
            </p>
            {claimStatus.value.claimRecord?.txHash && (
              <a
                href={`https://explore.tempo.xyz/receipt/${claimStatus.value.claimRecord.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                class="text-ethos-accent hover:underline text-sm"
              >
                View transaction →
              </a>
            )}
          </div>
        ) : claimStatus.value?.canClaim ? (
          // Can claim state
          <div>
            <div class="text-center mb-6">
              <div class="text-4xl font-bold text-gradient mb-2">
                {formatNumber(claimStatus.value.xp)} $ethosUSD
              </div>
              <p class="text-gray-400">
                Based on your <span class="text-ethos-accent">{formatNumber(claimStatus.value.xp)} Contributor XP</span>
              </p>
            </div>

            {claimResult.value?.success ? (
              <div class="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 text-center">
                <div class="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-3">
                  <svg class="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 class="text-lg font-semibold text-white mb-2">Claim Successful!</h3>
                <p class="text-gray-400 mb-3">
                  You received <span class="text-white font-semibold">{claimResult.value.amountFormatted} $ethosUSD</span>
                </p>
                <a
                  href={`https://explore.tempo.xyz/receipt/${claimResult.value.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-ethos-accent hover:underline text-sm"
                >
                  View transaction →
                </a>
              </div>
            ) : claimResult.value?.error ? (
              <div class="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                {claimResult.value.error}
              </div>
            ) : null}

            {!claimResult.value?.success && (
              <button
                onClick={handleClaim}
                disabled={isClaiming.value}
                class="w-full btn-primary py-3 text-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isClaiming.value ? (
                  <span class="flex items-center justify-center gap-2">
                    <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Claiming...
                  </span>
                ) : (
                  `Claim ${formatNumber(claimStatus.value.xp)} $ethosUSD`
                )}
              </button>
            )}
          </div>
        ) : claimStatus.value?.error ? (
          // Error state (not eligible)
          <div class="text-center py-4">
            <div class="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center mx-auto mb-4">
              <svg class="w-8 h-8 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 class="text-lg font-semibold text-white mb-2">No XP to Claim</h3>
            {claimStatus.value.score !== undefined && (
              <p class="text-gray-500 text-sm mb-2">
                Your Ethos Score: <span class="text-white font-medium">{claimStatus.value.score}</span>
              </p>
            )}
            <p class="text-gray-400 mb-4">{claimStatus.value.error}</p>
            <a
              href="https://ethos.network"
              target="_blank"
              rel="noopener noreferrer"
              class="text-ethos-accent hover:underline text-sm"
            >
              Earn Contributor XP on Ethos →
            </a>
          </div>
        ) : (
          // Loading failed state
          <div class="text-center py-4">
            <p class="text-gray-400">Unable to check claim status</p>
          </div>
        )}
      </div>
    </div>
  );
}

