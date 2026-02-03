# Privy + Safe Wallet Starter for Polymarket

A minimal, portable template for integrating Privy authentication with Polymarket's Safe wallet system. This enables gasless trading on Polymarket using the Builder Relayer pattern.

## How It Works

1. **Privy creates an EOA wallet** (embedded or external wallet)
2. **Safe address is derived** deterministically from the EOA using CREATE2
3. **Safe is deployed** via Polymarket's RelayClient (gasless, sponsored by Builder Program)
4. **API credentials are created** for CLOB trading
5. **Token approvals are set** for USDC and CTF tokens

## Quick Start

### 1. Install Dependencies

```bash
npm install @polymarket/builder-relayer-client@^0.0.8 \
  @polymarket/builder-signing-sdk@^0.0.8 \
  @polymarket/clob-client@^4.22.8 \
  @privy-io/react-auth@^3.8.1 \
  ethers@^5.8.0 \
  viem@^2.43.5
```

**CRITICAL:** Use ethers v5, NOT v6. The Polymarket SDKs require ethers v5 signers.

### 2. Set Environment Variables

```bash
# Client-side (prefix with VITE_ for Vite projects)
VITE_PRIVY_APP_ID=your-privy-app-id
VITE_POLYGON_RPC_URL=https://polygon-rpc.com  # Optional, uses public RPC by default

# Server-side (get from https://polymarket.com/settings?tab=builder)
POLYMARKET_BUILDER_API_KEY=your-builder-api-key
POLYMARKET_BUILDER_SECRET=your-builder-secret
POLYMARKET_BUILDER_PASSPHRASE=your-builder-passphrase
```

### 3. Copy Files to Your Project

Copy these folders to your project:
- `client/src/hooks/` → Your hooks folder
- `client/src/providers/` → Your providers folder  
- `client/src/utils/` → Your utils folder
- `client/src/constants/` → Your constants folder
- `server/sign-route.ts` → Your server routes

### 4. Add the Server Signing Endpoint

In your Express server:

```ts
import { registerSigningRoute } from "./sign-route";

const app = express();
app.use(express.json());

registerSigningRoute(app);
```

### 5. Wrap Your App with WalletProvider

```tsx
import WalletProvider from "./providers/WalletProvider";

function App() {
  return (
    <WalletProvider appId={import.meta.env.VITE_PRIVY_APP_ID}>
      <YourApp />
    </WalletProvider>
  );
}
```

### 6. Use the Trading Session Hook

```tsx
import useTradingSession from "./hooks/useTradingSession";
import { useWallet } from "./providers/WalletContext";

function TradingComponent() {
  const { login, logout, authenticated } = useWallet();
  const { 
    tradingSession,
    currentStep,
    sessionError,
    isTradingSessionComplete,
    initializeTradingSession,
    derivedSafeAddress,
  } = useTradingSession();

  if (!authenticated) {
    return <button onClick={login}>Connect Wallet</button>;
  }

  if (!isTradingSessionComplete) {
    return (
      <div>
        <p>Safe Address: {derivedSafeAddress}</p>
        <p>Status: {currentStep}</p>
        {sessionError && <p>Error: {sessionError.message}</p>}
        <button 
          onClick={initializeTradingSession}
          disabled={currentStep !== "idle"}
        >
          Activate Trading
        </button>
      </div>
    );
  }

  return (
    <div>
      <p>Trading Ready!</p>
      <p>EOA: {tradingSession?.eoaAddress}</p>
      <p>Safe: {tradingSession?.safeAddress}</p>
    </div>
  );
}
```

## File Structure

```
client/src/
├── constants/
│   ├── polymarket.ts    # API URLs, chain config
│   └── tokens.ts        # Contract addresses
├── hooks/
│   ├── useRelayClient.ts       # RelayClient with remote signing
│   ├── useSafeDeployment.ts    # Safe derivation & deployment
│   ├── useTokenApprovals.ts    # Token approval management
│   ├── useTradingSession.ts    # Main coordination hook
│   └── useUserApiCredentials.ts # CLOB API credentials
├── providers/
│   ├── WalletContext.tsx  # Wallet context type
│   └── WalletProvider.tsx # Privy + viem + ethers setup
└── utils/
    ├── approvals.ts  # Approval transaction builders
    └── session.ts    # Session storage helpers

server/
└── sign-route.ts    # Builder signing endpoint
```

## Contract Addresses (Polygon Mainnet)

| Contract | Address |
|----------|---------|
| USDC.e | `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` |
| CTF (ERC1155) | `0x4d97dcd97ec945f40cf65f87097ace5ea0476045` |
| CTF Exchange | `0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E` |
| Neg Risk Exchange | `0xC5d563A36AE78145C45a50134d48A1215220f80a` |
| Neg Risk Adapter | `0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296` |
| Safe Factory | `0xaacFeEa03eb1561C4e67d661e40682Bd20E3541b` |
| MultiSend | `0xA238CBeb142c10Ef7Ad8442C6D1f9E89e07e7761` |

## Getting Builder Credentials

1. Go to https://polymarket.com/settings?tab=builder
2. Create a new Builder API key
3. Save the key, secret, and passphrase to your server environment variables

## Architecture Notes

### Remote Signing Pattern
The RelayClient uses "remote signing" - it calls your server's `/api/polymarket/sign` endpoint to get HMAC signatures. This keeps your Builder credentials secure on the server while allowing the client to make authenticated requests.

### EOA vs Safe
- **EOA** (Externally Owned Account): The wallet Privy creates/manages
- **Safe**: A smart contract wallet derived from the EOA, used for trading on Polymarket

The Safe address is deterministically derived from the EOA using CREATE2, so the same EOA always produces the same Safe address.

### Session Persistence
The trading session (Safe address, credentials, approval status) is stored in localStorage. When users return, they don't need to re-derive credentials or re-set approvals.

## Troubleshooting

### "Builder credentials not configured"
Make sure your server has the environment variables set:
- `POLYMARKET_BUILDER_API_KEY`
- `POLYMARKET_BUILDER_SECRET`
- `POLYMARKET_BUILDER_PASSPHRASE`

### "Failed to derive Safe address"
The wallet must be connected and on Polygon network. Check that:
- User is authenticated via Privy
- Wallet is switched to Polygon (chain ID 137)

### "Could not derive api key!"
This is normal for new users. The code will automatically create new credentials instead.

### ethers v6 errors
You must use ethers v5. If you see errors about signer incompatibility, check your package.json:
```json
"ethers": "^5.8.0"  // NOT "^6.x"
```

## License

MIT
