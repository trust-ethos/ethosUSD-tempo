import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { getConnectedAccount, watchAccount, onDisconnect } from "../lib/wallet.ts";

interface EthosScoreData {
  address: string;
  score: number | null;
  level: string | null;
  isEligible: boolean;
  isAuthorized: boolean;
  isOnChainAuthorized?: boolean;
  minScore: number;
}

export default function EthosStatus() {
  const address = useSignal<string | null>(null);
  const scoreData = useSignal<EthosScoreData | null>(null);
  const isLoading = useSignal(false);

  const fetchScore = async (userAddress: string) => {
    isLoading.value = true;
    try {
      const response = await fetch(`/api/ethos-score?address=${userAddress}`);
      const data = await response.json();
      scoreData.value = data;
    } catch (err) {
      console.error("Error fetching Ethos score:", err);
      scoreData.value = null;
    } finally {
      isLoading.value = false;
    }
  };

  useEffect(() => {
    // Check initial account
    getConnectedAccount().then((account) => {
      if (account) {
        address.value = account;
        fetchScore(account);
      }
    });

    // Watch for account changes
    const unwatchAccount = watchAccount((account) => {
      if (account) {
        address.value = account;
        fetchScore(account);
      } else {
        address.value = null;
        scoreData.value = null;
      }
    });

    // Watch for manual disconnect
    const unwatchDisconnect = onDisconnect(() => {
      address.value = null;
      scoreData.value = null;
    });

    return () => {
      unwatchAccount();
      unwatchDisconnect();
    };
  }, []);

  if (!address.value) {
    return (
      <div class="card p-6">
        <h3 class="font-semibold text-white mb-2">Ethos Status</h3>
        <p class="text-sm text-gray-500">Connect wallet to view your status</p>
      </div>
    );
  }

  if (isLoading.value) {
    return (
      <div class="card p-6">
        <h3 class="font-semibold text-white mb-4">Ethos Status</h3>
        <div class="flex items-center justify-center py-4">
          <svg class="animate-spin h-6 w-6 text-ethos-primary" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      </div>
    );
  }

  const data = scoreData.value;

  return (
    <div class="card p-6">
      <h3 class="font-semibold text-white mb-4">Ethos Status</h3>

      {data?.score === null ? (
        <div class="space-y-4">
          <div class="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <div class="flex items-start gap-3">
              <svg class="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p class="text-amber-400 font-medium">No Ethos Profile</p>
                <p class="text-sm text-gray-400 mt-1">
                  Create an Ethos profile to build your reputation
                </p>
              </div>
            </div>
          </div>
          <a
            href="https://app.ethos.network"
            target="_blank"
            rel="noopener noreferrer"
            class="btn-secondary w-full text-center block"
          >
            Create Ethos Profile
          </a>
        </div>
      ) : (
        <div class="space-y-4">
          {/* Score Display */}
          <div class="flex items-center justify-between">
            <span class="text-gray-400">Your Score</span>
            <span class={`${data.score! >= 1600 ? "ethos-score-high" : data.score! >= 1200 ? "ethos-score-medium" : "ethos-score-low"}`}>
              {data.score}
            </span>
          </div>

          {/* Level */}
          <div class="flex items-center justify-between">
            <span class="text-gray-400">Level</span>
            <span class="text-white capitalize">{data.level}</span>
          </div>

          {/* Authorization Status */}
          <div class="flex items-center justify-between">
            <span class="text-gray-400">Transfer Status</span>
            {data.isAuthorized ? (
              <span class="flex items-center gap-1 text-emerald-400 text-sm">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M5 13l4 4L19 7" />
                </svg>
                Authorized
              </span>
            ) : (
              <span class="flex items-center gap-1 text-amber-400 text-sm">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
                Not Authorized
              </span>
            )}
          </div>

          {/* Status Message */}
          {!data.isAuthorized && !data.isEligible && (
            <div class="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-sm">
              <p class="text-amber-400">
                Your score needs to be at least <strong>{data.minScore}</strong> to send/receive $ethosUSD.
                {data.score! < data.minScore && (
                  <span> You need <strong>{data.minScore - data.score!}</strong> more points.</span>
                )}
              </p>
            </div>
          )}

          {!data.isAuthorized && data.isEligible && !data.isOnChainAuthorized && (
            <div class="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-sm">
              <p class="text-blue-400">
                Your score qualifies! Request whitelist access to start using $ethosUSD.
              </p>
            </div>
          )}

          {/* View Profile Link */}
          <a
            href={`https://app.ethos.network/profile/${address.value}`}
            target="_blank"
            rel="noopener noreferrer"
            class="btn-secondary w-full text-center block"
          >
            View Ethos Profile
          </a>
        </div>
      )}
    </div>
  );
}
