import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { getConnectedAccount, watchAccount, onDisconnect } from "../lib/wallet.ts";
import WalletBalance from "./WalletBalance.tsx";
import SendTokens from "./SendTokens.tsx";
import TransactionLog from "./TransactionLog.tsx";
import EthosStatus from "./EthosStatus.tsx";
import ClaimReward from "./ClaimReward.tsx";
import VouchedUsers, { type VouchedUser } from "./VouchedUsers.tsx";

// Convert VouchedUser to the format SendTokens expects
interface SelectedUserData {
  name: string;
  username: string | null;
  avatar: string | null;
  score: number;
  address: string;
  primaryAddress: string;
  profileId: number;
  isAuthorized: boolean;
}

export default function HomePage() {
  const isConnected = useSignal(false);
  const isLoading = useSignal(true);
  const selectedUser = useSignal<SelectedUserData | null>(null);

  useEffect(() => {
    // Check initial connection
    getConnectedAccount().then((account) => {
      isConnected.value = !!account;
      isLoading.value = false;
    });

    // Watch for account changes from wallet
    const unwatchAccount = watchAccount((account) => {
      isConnected.value = !!account;
    });

    // Watch for manual disconnect
    const unwatchDisconnect = onDisconnect(() => {
      isConnected.value = false;
    });

    return () => {
      unwatchAccount();
      unwatchDisconnect();
    };
  }, []);

  // Show loading state briefly
  if (isLoading.value) {
    return (
      <div class="flex items-center justify-center py-20">
        <svg class="animate-spin h-8 w-8 text-ethos-primary" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  // Connected: Show Dashboard
  if (isConnected.value) {
    return (
      <div class="py-8">
        <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Claim Section - Full Width at Top */}
          <div class="mb-6">
            <ClaimReward />
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* Left column - Balance and Ethos Status */}
            <div class="lg:col-span-1 space-y-6">
              <WalletBalance />
              <EthosStatus />
            </div>

            {/* Middle column - Send Tokens */}
            <div class="lg:col-span-1">
              <SendTokens 
                externalUser={selectedUser.value || undefined}
                onUserCleared={() => selectedUser.value = null}
              />
            </div>

            {/* Right column - Vouched Users (Quick Send) */}
            <div class="lg:col-span-1">
              <VouchedUsers 
                onSelectUser={(user: VouchedUser) => {
                  selectedUser.value = {
                    name: user.name,
                    username: user.username,
                    avatar: user.avatar,
                    score: user.score,
                    address: user.whitelistedAddress || user.address,
                    primaryAddress: user.address,
                    profileId: 0, // Not available from vouched users
                    isAuthorized: user.isAuthorized,
                  };
                }}
              />
            </div>
          </div>

          {/* Recent Activity - Full Width at Bottom */}
          <TransactionLog limit={10} />
        </div>
      </div>
    );
  }

  // Not connected: Show Marketing
  return (
    <div class="py-12">
      <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Hero Section */}
        <div class="text-center mb-12">
          <div class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-ethos-card border border-ethos-border mb-6">
            <div class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span class="text-sm text-gray-400">Live on Tempo Testnet</span>
          </div>
          
          <h1 class="text-4xl sm:text-5xl lg:text-6xl font-bold mb-4">
            <span class="text-gradient">$ethosUSD</span>
          </h1>
          
          <p class="text-xl text-gray-400 max-w-2xl mx-auto mb-8">
            The stablecoin for trusted communities. Only users with an{" "}
            <a 
              href="https://ethos.network" 
              target="_blank" 
              rel="noopener noreferrer"
              class="text-ethos-accent hover:underline"
            >
              Ethos score
            </a>{" "}
            of 1400 or higher can send and receive $ethosUSD.
          </p>

          <p class="text-lg text-gray-500 mb-8">
            Connect your wallet to get started →
          </p>
        </div>

        {/* Claim Promo */}
        <div class="card p-8 mb-12 bg-gradient-to-br from-ethos-primary/10 via-ethos-card to-ethos-secondary/10 border-ethos-primary/30">
          <div class="text-center">
            <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-ethos-primary/20 text-ethos-primary text-sm font-medium mb-4">
              🎁 Free Claim
            </div>
            <h2 class="text-2xl font-bold text-white mb-3">Claim Free $ethosUSD</h2>
            <p class="text-gray-400 max-w-lg mx-auto">
              Ethos contributors can claim free $ethosUSD based on their Contributor XP.
              <br />
              <span class="text-ethos-accent font-medium">1 Contributor XP = 1 $ethosUSD</span>
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12">
          <div class="card p-6 text-center">
            <div class="text-3xl font-bold text-white mb-1">1,400+</div>
            <div class="text-gray-500">Minimum Ethos Score</div>
          </div>
          <div class="card p-6 text-center">
            <div class="text-3xl font-bold text-white mb-1">4,736</div>
            <div class="text-gray-500">Whitelisted Addresses</div>
          </div>
          <div class="card p-6 text-center">
            <div class="text-3xl font-bold text-white mb-1">TIP-20</div>
            <div class="text-gray-500">Token Standard</div>
          </div>
        </div>

        {/* How It Works */}
        <div class="card p-8 mb-12">
          <h2 class="text-2xl font-bold text-white mb-6 text-center">How It Works</h2>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div class="text-center">
              <div class="w-12 h-12 rounded-full bg-ethos-primary/20 flex items-center justify-center mx-auto mb-4">
                <span class="text-xl font-bold text-ethos-primary">1</span>
              </div>
              <h3 class="font-semibold text-white mb-2">Build Reputation</h3>
              <p class="text-gray-400 text-sm">
                Grow your{" "}
                <a href="https://ethos.network" target="_blank" class="text-ethos-accent hover:underline">
                  Ethos score
                </a>{" "}
                through reviews, vouches, and on-chain activity
              </p>
            </div>
            <div class="text-center">
              <div class="w-12 h-12 rounded-full bg-ethos-primary/20 flex items-center justify-center mx-auto mb-4">
                <span class="text-xl font-bold text-ethos-primary">2</span>
              </div>
              <h3 class="font-semibold text-white mb-2">Claim Your $ethosUSD</h3>
              <p class="text-gray-400 text-sm">
                Connect your wallet and claim free $ethosUSD based on your Contributor XP
              </p>
            </div>
            <div class="text-center">
              <div class="w-12 h-12 rounded-full bg-ethos-primary/20 flex items-center justify-center mx-auto mb-4">
                <span class="text-xl font-bold text-ethos-primary">3</span>
              </div>
              <h3 class="font-semibold text-white mb-2">Send & Receive</h3>
              <p class="text-gray-400 text-sm">
                Transfer $ethosUSD to other trusted users with instant finality on Tempo
              </p>
            </div>
          </div>
        </div>

        {/* Recent Transactions */}
        <TransactionLog limit={20} />
      </div>
    </div>
  );
}
