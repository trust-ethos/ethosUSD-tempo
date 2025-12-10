import { useSignal, useComputed } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { 
  connectWallet, 
  disconnectWallet,
  getConnectedAccount, 
  watchAccount,
  onDisconnect,
  truncateAddress,
  isWalletAvailable 
} from "../lib/wallet.ts";

interface ConnectWalletProps {
  onConnect?: (address: string) => void;
  onDisconnect?: () => void;
}

interface UserProfile {
  avatar: string | null;
  name: string | null;
  username: string | null;
}

export default function ConnectWallet({ onConnect, onDisconnect }: ConnectWalletProps) {
  const address = useSignal<string | null>(null);
  const userProfile = useSignal<UserProfile | null>(null);
  const isConnecting = useSignal(false);
  const error = useSignal<string | null>(null);
  const hasWallet = useSignal(false);
  
  const displayAddress = useComputed(() => 
    address.value ? truncateAddress(address.value) : null
  );

  const fetchUserProfile = async (addr: string) => {
    try {
      const response = await fetch(`/api/ethos-users?addresses=${addr}`);
      if (response.ok) {
        const data = await response.json();
        const user = data.users?.[addr.toLowerCase()];
        if (user) {
          userProfile.value = {
            avatar: user.avatar,
            name: user.name,
            username: user.username,
          };
        }
      }
    } catch (err) {
      console.error("Error fetching user profile:", err);
    }
  };

  useEffect(() => {
    // Check if wallet is available
    hasWallet.value = isWalletAvailable();
    
    // Check initial connection state
    getConnectedAccount().then((account) => {
      if (account) {
        address.value = account;
        fetchUserProfile(account);
        onConnect?.(account);
      }
    });

    // Watch for account changes from wallet
    const unwatchAccount = watchAccount((account) => {
      if (account) {
        address.value = account;
        userProfile.value = null;
        fetchUserProfile(account);
        onConnect?.(account);
      } else {
        address.value = null;
        userProfile.value = null;
        onDisconnect?.();
      }
    });

    // Watch for manual disconnect
    const unwatchDisconnect = onDisconnect(() => {
      address.value = null;
      userProfile.value = null;
      onDisconnect?.();
    });

    return () => {
      unwatchAccount();
      unwatchDisconnect();
    };
  }, []);

  const handleConnect = async () => {
    isConnecting.value = true;
    error.value = null;
    
    try {
      const account = await connectWallet();
      address.value = account;
      onConnect?.(account);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection failed";
      if (message.includes("User rejected") || message.includes("user rejected")) {
        error.value = "Connection cancelled";
      } else {
        error.value = message;
      }
    } finally {
      isConnecting.value = false;
    }
  };

  const handleDisconnect = () => {
    // Call the disconnect function which sets the manual disconnect flag
    disconnectWallet();
    address.value = null;
    onDisconnect?.();
  };

  if (address.value) {
    return (
      <div class="flex items-center gap-3">
        <a 
          href={`https://app.ethos.network/profile/${address.value}`}
          target="_blank"
          rel="noopener noreferrer"
          class="flex items-center gap-2 px-3 py-1.5 bg-ethos-card border border-ethos-border rounded-lg hover:border-ethos-primary/50 transition-colors"
        >
          {userProfile.value?.avatar ? (
            <img 
              src={userProfile.value.avatar} 
              alt="" 
              class="w-6 h-6 rounded-full object-cover"
            />
          ) : (
            <div class="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <div class="w-2 h-2 rounded-full bg-emerald-400" />
            </div>
          )}
          <span class="font-mono text-sm text-gray-200">{displayAddress.value}</span>
        </a>
        <button
          onClick={handleDisconnect}
          class="px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-ethos-card rounded-lg transition-colors"
        >
          Disconnect
        </button>
      </div>
    );
  }

  if (!hasWallet.value) {
    return (
      <a
        href="https://metamask.io/download/"
        target="_blank"
        rel="noopener noreferrer"
        class="btn-primary flex items-center gap-2"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M21.4 7.7l-9.1-5.3c-.3-.2-.6-.2-.9 0L2.6 7.7c-.3.2-.5.5-.5.9v8.8c0 .4.2.7.5.9l9.1 5.3c.1.1.3.1.4.1.1 0 .3 0 .4-.1l9.1-5.3c.3-.2.5-.5.5-.9V8.6c0-.4-.2-.7-.5-.9z"/>
        </svg>
        Install MetaMask
      </a>
    );
  }

  return (
    <div class="flex flex-col items-end gap-2">
      <button
        onClick={handleConnect}
        class="btn-primary flex items-center gap-2"
        disabled={isConnecting.value}
      >
        {isConnecting.value ? (
          <>
            <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Connecting...
          </>
        ) : (
          <>
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/>
              <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>
            </svg>
            Connect Wallet
          </>
        )}
      </button>
      {error.value && (
        <p class="text-sm text-red-400">{error.value}</p>
      )}
    </div>
  );
}
