# $ethosUSD - The stablecoin built on credibility

A stablecoin on [Tempo](https://tempo.xyz) that can only be transferred between users with an [Ethos](https://ethos.network) reputation score of 1400 or higher.

## Features

- **TIP-20 Token**: $ethosUSD is a native Tempo stablecoin using the TIP-20 standard
- **TIP-403 Transfer Policy**: Whitelist-based transfer restrictions enforced at the protocol level
- **Ethos Integration**: Automatic whitelist sync based on Ethos reputation scores
- **Modern Web App**: Fresh/Deno/TypeScript with wallet connection support

## Tech Stack

- **Runtime**: [Deno](https://deno.land/) 2.x
- **Framework**: [Fresh](https://fresh.deno.dev/) (Preact-based)
- **Blockchain**: [Tempo Testnet](https://docs.tempo.xyz)
- **Styling**: Tailwind CSS
- **Wallet Connection**: wagmi + viem

## Prerequisites

- [Deno](https://deno.land/manual/getting_started/installation) 2.x or later
- A wallet with testnet funds (get from [Tempo Faucet](https://docs.tempo.xyz/quickstart/faucet))

## Setup

1. **Clone and install dependencies**:
   ```bash
   cd ethos-tempo
   deno task check  # Verify setup
   ```

2. **Configure environment**:
   Create a `.env` file with:
   ```env
   # Admin private key for deploying and managing the token
   ADMIN_PRIVATE_KEY=0x...
   
   # These will be set after deployment
   ETHOS_USD_TOKEN=
   ETHOS_POLICY_ID=
   ```

3. **Deploy the token** (one-time):
   ```bash
   deno task deploy:token
   ```
   
   This will:
   - Create a TIP-403 whitelist policy
   - Deploy the $ethosUSD TIP-20 token
   - Set the transfer policy on the token
   - Mint initial supply to the admin
   
   Copy the output values to your `.env` file.

4. **Sync the whitelist**:
   Add addresses to `data/seed-addresses.csv`, then run:
   ```bash
   deno task sync:whitelist
   ```

5. **Start the development server**:
   ```bash
   deno task dev
   ```
   
   Open http://localhost:8000

## Project Structure

```
ethos-tempo/
├── routes/
│   ├── index.tsx          # Home page with transaction log
│   ├── dashboard.tsx      # User dashboard
│   └── api/
│       ├── ethos-score.ts # Ethos score API proxy
│       ├── transfers.ts   # Transaction log API
│       └── sync-whitelist.ts  # Whitelist sync endpoint
├── islands/
│   ├── ConnectWallet.tsx  # Wallet connection UI
│   ├── WalletBalance.tsx  # Balance display
│   ├── SendTokens.tsx     # Transfer form
│   ├── EthosStatus.tsx    # User's Ethos status
│   └── TransactionLog.tsx # Transaction list
├── lib/
│   ├── tempo.ts           # Tempo client config
│   ├── contracts.ts       # Contract ABIs and addresses
│   ├── ethos.ts           # Ethos API client
│   ├── whitelist.ts       # Whitelist sync logic
│   └── wagmi-config.ts    # Client-side wallet config
├── scripts/
│   ├── deploy-token.ts    # Token deployment script
│   └── sync-whitelist.ts  # Whitelist sync script
└── data/
    └── seed-addresses.csv # Addresses to check for whitelisting
```

## How It Works

### Transfer Policy

$ethosUSD uses a TIP-403 whitelist policy. Only addresses on the whitelist can send or receive tokens. The whitelist is managed by syncing with Ethos scores:

1. Addresses with Ethos score ≥ 1400 are eligible
2. The `sync:whitelist` script fetches scores from Ethos API
3. Eligible addresses are added to the on-chain whitelist
4. Ineligible addresses are removed

### API Endpoints

- `GET /api/ethos-score?address=0x...` - Get Ethos score for an address
- `POST /api/ethos-score` - Bulk score lookup
- `GET /api/transfers?token=0x...` - Get recent transfers
- `POST /api/sync-whitelist` - Trigger whitelist sync

## Contract Addresses (Tempo Testnet)

- **TIP20Factory**: `0x20c0000000000000000000000000000000000000`
- **TIP403Registry**: `0x403c000000000000000000000000000000000000`
- **$ethosUSD Token**: Set via `ETHOS_USD_TOKEN` env var

## Development

```bash
# Run development server with hot reload
deno task dev

# Type check and lint
deno task check

# Build for production
deno task build

# Start production server
deno task start
```

## License

MIT

