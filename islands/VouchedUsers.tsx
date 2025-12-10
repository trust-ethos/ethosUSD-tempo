import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { getConnectedAccount, watchAccount, onDisconnect } from "../lib/wallet.ts";

export interface VouchedUser {
  address: string;
  whitelistedAddress: string | null; // The address that's actually on whitelist
  name: string;
  username: string | null;
  avatar: string | null;
  score: number;
  isEligible: boolean;
  isAuthorized: boolean; // True if they have any whitelisted address
  profileUrl: string;
}

interface VouchedUsersProps {
  onSelectUser?: (user: VouchedUser) => void;
  maxDisplay?: number;
}

export default function VouchedUsers({ onSelectUser, maxDisplay = 5 }: VouchedUsersProps) {
  const address = useSignal<string | null>(null);
  const users = useSignal<VouchedUser[]>([]);
  const isLoading = useSignal(true);
  const error = useSignal<string | null>(null);
  const showAll = useSignal(false);

  const fetchVouchedUsers = async (userAddress: string) => {
    isLoading.value = true;
    error.value = null;
    
    try {
      const response = await fetch(`/api/vouched-users?address=${userAddress}`);
      const data = await response.json();
      
      if (data.error) {
        error.value = data.error;
        users.value = [];
      } else {
        users.value = data.users || [];
      }
    } catch (err) {
      console.error("Error fetching vouched users:", err);
      error.value = "Failed to load vouched users";
      users.value = [];
    } finally {
      isLoading.value = false;
    }
  };

  useEffect(() => {
    getConnectedAccount().then((account) => {
      if (account) {
        address.value = account;
        fetchVouchedUsers(account);
      } else {
        isLoading.value = false;
      }
    });

    const unwatchAccount = watchAccount((account) => {
      address.value = account;
      if (account) {
        fetchVouchedUsers(account);
      } else {
        users.value = [];
        isLoading.value = false;
      }
    });

    const unwatchDisconnect = onDisconnect(() => {
      address.value = null;
      users.value = [];
    });

    return () => {
      unwatchAccount();
      unwatchDisconnect();
    };
  }, []);

  const handleUserClick = (user: VouchedUser) => {
    onSelectUser?.(user);
  };

  if (!address.value) {
    return (
      <div class="card p-6">
        <h3 class="font-semibold text-white mb-2">People You've Vouched For</h3>
        <p class="text-sm text-gray-500">Connect wallet to view</p>
      </div>
    );
  }

  return (
    <div class="card">
      <div class="p-4 border-b border-ethos-border/50">
        <div class="flex items-center justify-between">
          <h3 class="font-semibold text-white">Quick Send</h3>
          <span class="text-xs text-gray-500">
            {users.value.length} vouched
          </span>
        </div>
        <p class="text-xs text-gray-500 mt-1">
          People you've vouched for on Ethos
        </p>
      </div>

      <div class="p-3 max-h-80 overflow-y-auto">
        {isLoading.value ? (
          <div class="flex items-center justify-center py-8">
            <svg class="animate-spin h-6 w-6 text-ethos-primary" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : error.value ? (
          <div class="text-center py-6 text-gray-500 text-sm">
            {error.value}
          </div>
        ) : users.value.length === 0 ? (
          <div class="text-center py-6">
            <p class="text-gray-500 text-sm mb-2">No vouched users yet</p>
            <a
              href="https://app.ethos.network"
              target="_blank"
              rel="noopener noreferrer"
              class="text-ethos-accent text-sm hover:underline"
            >
              Vouch for someone on Ethos →
            </a>
          </div>
        ) : (
          <div class="space-y-1">
            {(showAll.value ? users.value : users.value.slice(0, maxDisplay)).map((user) => (
              <button
                key={user.address}
                onClick={() => handleUserClick(user)}
                class="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-ethos-card/50 transition-colors text-left group"
              >
                {/* Avatar */}
                <div class="relative flex-shrink-0">
                  {user.avatar ? (
                    <img
                      src={user.avatar}
                      alt={user.name}
                      class="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div class="w-10 h-10 rounded-full bg-ethos-primary/20 flex items-center justify-center">
                      <span class="text-ethos-primary font-semibold text-sm">
                        {user.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  {/* Status badge - green check if authorized, yellow caution if not */}
                  {user.isAuthorized ? (
                    <div class="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center" title="Can receive ethosUSD">
                      <svg class="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                      </svg>
                    </div>
                  ) : user.isEligible ? (
                    <div class="absolute -bottom-1 -right-1 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center" title="Eligible but not whitelisted yet">
                      <svg class="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                  ) : (
                    <div class="absolute -bottom-1 -right-1 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center" title={`Score ${user.score} - needs 1400+ to receive`}>
                      <svg class="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                      </svg>
                    </div>
                  )}
                </div>

                {/* User info */}
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="font-medium text-white text-sm truncate">
                      {user.name}
                    </span>
                    <span class="text-xs px-1.5 py-0.5 rounded bg-ethos-card text-gray-400">
                      {user.score}
                    </span>
                  </div>
                  {user.username && (
                    <span class="text-xs text-gray-500 truncate block">
                      @{user.username}
                    </span>
                  )}
                </div>

                {/* Send indicator */}
                <div class="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <svg class="w-4 h-4 text-ethos-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </div>
              </button>
            ))}
            
            {/* Show more/less button */}
            {users.value.length > maxDisplay && (
              <button
                onClick={() => showAll.value = !showAll.value}
                class="w-full mt-2 py-2 text-xs text-gray-400 hover:text-white transition-colors"
              >
                {showAll.value 
                  ? "Show less" 
                  : `Show ${users.value.length - maxDisplay} more`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

