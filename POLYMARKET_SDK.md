# Polymarket SDK - Integration Guide for AI Agents

This SDK provides a battle-tested wrapper for Polymarket's CLOB (Central Limit Order Book) and Builder Relayer APIs. It has been debugged extensively and handles the complexity of gasless betting on Polygon.

---

## Installation & Setup

### Step 1: Copy SDK Files

Copy the entire `client/src/sdk/` folder to your new project. The folder contains:

```
sdk/
├── index.ts           # Main exports
├── PolymarketSDK.ts   # SDK class with all methods
├── types.ts           # TypeScript interfaces
├── constants.ts       # Contract addresses, chain config
└── abis.ts            # Contract ABIs
```

### Step 2: Install Required Dependencies

Run the following in your project:

```bash
npm install @polymarket/clob-client @polymarket/builder-relayer-client @polymarket/builder-signing-sdk viem ethers@^5.7.0
```

**Package breakdown:**
- `@polymarket/clob-client` - CLOB order placement
- `@polymarket/builder-relayer-client` - Gasless transaction relaying
- `@polymarket/builder-signing-sdk` - Server-side signature generation
- `viem` - Modern Ethereum client library
- `ethers@^5.7.0` - Ethers v5 (required for ClobClient compatibility)

### Step 3: Configure Import Paths

Update the SDK imports to match your project structure. If your SDK folder is at `src/sdk/`:

```typescript
// In your code:
import { PolymarketSDK, type SDKConfig, type WalletAdapter } from "./sdk";
// or
import { PolymarketSDK, type SDKConfig, type WalletAdapter } from "@/sdk"; // if you have @ alias
```

### Step 4: Set Environment Variables

**Server-side secrets (never expose to client):**
```bash
POLYMARKET_BUILDER_API_KEY=your_builder_key
POLYMARKET_BUILDER_SECRET=your_builder_secret
POLYMARKET_BUILDER_PASSPHRASE=your_builder_passphrase
```

**Client-side (optional fee config):**
```bash
VITE_INTEGRATOR_FEE_ADDRESS=0xYourFeeWallet
VITE_INTEGRATOR_FEE_BPS=50
```

### Step 5: Add Server Signing Endpoint

Create a POST endpoint at `/api/polymarket/sign` (see "Server-Side Signing Endpoint" section below).

### Step 6: Set Up Wallet Provider

You need a wallet solution (Privy, RainbowKit, ConnectKit, etc.) that provides:
- User's EOA address
- Message signing capability
- Ethers v5 Signer
- Viem WalletClient

---

## Quick Start

```typescript
import { PolymarketSDK, type SDKConfig, type WalletAdapter } from "@/sdk";

// 1. Configure the SDK
const config: SDKConfig = {
  builderApiKey: process.env.POLYMARKET_BUILDER_API_KEY!,
  builderSecret: process.env.POLYMARKET_BUILDER_SECRET!,
  builderPassphrase: process.env.POLYMARKET_BUILDER_PASSPHRASE!,
  signingEndpoint: `${window.location.origin}/api/polymarket/sign`,
  // Optional: Enable fee collection
  feeAddress: "0xYourFeeWallet",
  feeBps: 50, // 0.5% fee
};

// 2. Create wallet adapter (example with Privy)
const walletAdapter: WalletAdapter = {
  getAddress: async () => privyWallet.address,
  signMessage: async (msg) => privyWallet.sign(msg),
  getEthersSigner: () => ethersSigner, // ethers v5 Signer
  getViemWalletClient: () => viemWalletClient,
};

// 3. Initialize and use
const sdk = new PolymarketSDK(config);
await sdk.initialize(walletAdapter);

// Place a $10 bet on YES
const result = await sdk.placeOrder({
  tokenId: "123456789...",
  side: "BUY",
  amount: 10, // $10 USDC
  negRisk: false, // or true for winner-take-all markets
});
```

## Architecture Overview

### Key Concepts

1. **Safe Wallet**: Users don't bet directly from their EOA (Externally Owned Account). Instead, we derive a Safe proxy wallet for each user. USDC is deposited to this Safe, and all bets execute from it gaslessly.

2. **Two Market Types**:
   - **CTF Markets (negRisk=false)**: Standard binary markets backed by USDC
   - **NegRisk Markets (negRisk=true)**: Winner-take-all markets (soccer 3-way moneylines, elections) backed by WrappedCollateral

3. **Builder Relayer**: Signs transactions server-side and submits them via Polymarket's relayer for gasless execution.

4. **FOK Orders**: We use Fill-or-Kill orders for instant execution - either the order fills completely or is rejected.

## Core Methods

### `initialize(wallet: WalletAdapter)`

Must be called before any other method. Sets up:
- Safe wallet derivation
- API credential derivation
- RelayClient for gasless transactions
- ClobClient for order placement

### `getPositions(): Promise<Position[]>`

Fetches all current positions for the user's Safe wallet from Polymarket Data API.

```typescript
const positions = await sdk.getPositions();
for (const pos of positions) {
  console.log(`${pos.question}: ${pos.size} shares at $${pos.avgPrice}`);
}
```

### `placeOrder(params: PlaceOrderParams): Promise<OrderResult>`

Places a Fill-or-Kill market order.

```typescript
interface PlaceOrderParams {
  tokenId: string;      // Polymarket token ID for the outcome
  side: "BUY" | "SELL"; // BUY = bet on outcome, SELL = exit position
  amount: number;       // For BUY: USDC to spend. For SELL: shares to sell
  tickSize?: TickSize;  // Price precision (default: "0.01")
  negRisk?: boolean;    // true for winner-take-all markets
}
```

**Important**: The `negRisk` flag comes from the Polymarket API (`market.negRisk`). Don't compute it yourself.

### `batchRedeemPositions(positions: RedeemablePosition[])`

Redeems multiple winning positions in a single transaction (one signature).

```typescript
interface RedeemablePosition {
  conditionId: string;   // From Polymarket API
  tokenId: string;       // From Polymarket API
  outcomeLabel?: string; // "Yes" or "No" - from Polymarket API
  negRisk?: boolean;     // From Polymarket API
}
```

**Critical**: Use the `outcomeLabel` directly from Polymarket's API. The SDK uses it to build the correct redemption parameters for NegRisk markets.

### `redeemWinnings(positions: RedeemablePosition[])`

Alias for `batchRedeemPositions` - redeems winning positions after market resolution.

### `getOrderBook(tokenId: string): Promise<OrderBookData | null>`

Fetches real-time order book. No authentication required.

Returns liquidity analysis:
- `bestBid` / `bestAsk`: Current prices
- `spread` / `spreadPercent`: Market spread
- `isLowLiquidity`: Warning flag if < $100 at best ask
- `isWideSpread`: Warning flag if spread > 5%

### `deploySafe() / approveUSDC() / withdrawUSDC(amount, toAddress)`

Wallet setup and fund management operations.

## Server-Side Signing Endpoint

The SDK requires a server endpoint for Builder signature generation. This keeps your Builder API credentials secure.

```typescript
// server/routes.ts
import { buildHmacSignature, type BuilderApiKeyCreds } from "@polymarket/builder-signing-sdk";

const BUILDER_CREDENTIALS: BuilderApiKeyCreds = {
  key: process.env.POLYMARKET_BUILDER_API_KEY || "",
  secret: process.env.POLYMARKET_BUILDER_SECRET || "",
  passphrase: process.env.POLYMARKET_BUILDER_PASSPHRASE || "",
};

app.post("/api/polymarket/sign", async (req, res) => {
  try {
    const { method, requestPath, body, timestamp } = req.body;
    
    if (!BUILDER_CREDENTIALS.key || !BUILDER_CREDENTIALS.secret) {
      return res.status(503).json({ error: "Builder credentials not configured" });
    }

    const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
    const signature = buildHmacSignature(
      BUILDER_CREDENTIALS.secret,
      timestamp,
      method,
      requestPath,
      bodyStr
    );

    res.json({
      signature,
      key: BUILDER_CREDENTIALS.key,
      passphrase: BUILDER_CREDENTIALS.passphrase,
      timestamp,
    });
  } catch (error) {
    res.status(500).json({ error: "Signing failed" });
  }
});
```

## Integrator Fee Collection

The SDK supports collecting integrator fees on successful BUY orders. This is part of Polymarket's Builder Program and allows you to monetize your integration.

### Configuration

Set these environment variables (client-side, prefixed with `VITE_`):

```bash
# Your wallet address to receive fees
VITE_INTEGRATOR_FEE_ADDRESS=0xYourFeeWallet

# Fee in basis points (100 bps = 1%)
VITE_INTEGRATOR_FEE_BPS=50
```

**Important**: Since these are Vite environment variables, you must **fully rebuild** your app (not just restart) when changing them.

### How Fee Collection Works

1. User places a BUY order for $100
2. Order fills successfully on Polymarket
3. Your app transfers the fee (e.g., $0.50 for 50 bps) from user's Safe to your fee wallet
4. Fee failure does NOT break the order - user's bet still succeeds

**Note**: Fees only apply to BUY orders because the `amount` parameter directly represents USDC spent. SELL orders would require fill price data for accurate calculation.

### Implementation Pattern

Fee collection happens **after** a successful order, not during it. Here's the recommended hook-based implementation:

#### Step 1: Create the Fee Collection Hook

```typescript
// hooks/useFeeCollection.ts
import { useState, useCallback } from "react";
import { RelayClient } from "@polymarket/builder-relayer-client";
import { encodeFunctionData } from "viem";

const USDC_E_CONTRACT_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const USDC_E_DECIMALS = 6;

// Get from environment
const INTEGRATOR_FEE_ADDRESS = import.meta.env.VITE_INTEGRATOR_FEE_ADDRESS || "";
const INTEGRATOR_FEE_BPS = parseInt(import.meta.env.VITE_INTEGRATOR_FEE_BPS || "0", 10);

const ERC20_TRANSFER_ABI = [
  {
    name: "transfer",
    type: "function",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

export type FeeCollectionResult = {
  success: boolean;
  feeAmount: bigint;
  txHash?: string;
};

export default function useFeeCollection() {
  const [isCollectingFee, setIsCollectingFee] = useState(false);
  const [feeError, setFeeError] = useState<Error | null>(null);

  const isFeeCollectionEnabled = !!INTEGRATOR_FEE_ADDRESS && INTEGRATOR_FEE_BPS > 0;

  const calculateFeeAmount = useCallback(
    (orderValueUsdc: number): bigint => {
      if (!isFeeCollectionEnabled || orderValueUsdc <= 0) {
        return BigInt(0);
      }
      const feeDecimal = orderValueUsdc * (INTEGRATOR_FEE_BPS / 10000);
      const feeAmount = BigInt(Math.floor(feeDecimal * Math.pow(10, USDC_E_DECIMALS)));
      return feeAmount;
    },
    [isFeeCollectionEnabled]
  );

  const collectFee = useCallback(
    async (
      relayClient: RelayClient,
      orderValueUsdc: number
    ): Promise<FeeCollectionResult> => {
      if (!isFeeCollectionEnabled || !INTEGRATOR_FEE_ADDRESS) {
        return { success: true, feeAmount: BigInt(0) };
      }

      const feeAmount = calculateFeeAmount(orderValueUsdc);
      if (feeAmount <= BigInt(0)) {
        return { success: true, feeAmount: BigInt(0) };
      }

      setIsCollectingFee(true);
      setFeeError(null);

      try {
        // Build USDC transfer transaction
        const transferData = encodeFunctionData({
          abi: ERC20_TRANSFER_ABI,
          functionName: "transfer",
          args: [INTEGRATOR_FEE_ADDRESS as `0x${string}`, feeAmount],
        });

        const feeTransferTx = {
          to: USDC_E_CONTRACT_ADDRESS,
          value: "0",
          data: transferData,
        };

        // Execute via RelayClient (gasless)
        const response = await relayClient.execute(
          [feeTransferTx],
          `Collect integrator fee: ${(Number(feeAmount) / Math.pow(10, USDC_E_DECIMALS)).toFixed(2)} USDC`
        );
        const result = await response.wait();

        return {
          success: true,
          feeAmount,
          txHash: result?.transactionHash,
        };
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Failed to collect fee");
        setFeeError(error);
        console.error("[FeeCollection] Error:", error);
        return { success: false, feeAmount };
      } finally {
        setIsCollectingFee(false);
      }
    },
    [isFeeCollectionEnabled, calculateFeeAmount]
  );

  return {
    collectFee,
    calculateFeeAmount,
    isCollectingFee,
    feeError,
    isFeeCollectionEnabled,
    feeBps: INTEGRATOR_FEE_BPS,
  };
}
```

#### Step 2: Collect Fee After Successful Order

```typescript
// In your betting component
import useFeeCollection from "@/hooks/useFeeCollection";

function BetSlip() {
  const { collectFee, isFeeCollectionEnabled } = useFeeCollection();
  const { relayClient } = useTradingSession(); // Your RelayClient

  const placeBet = async (tokenId: string, amount: number) => {
    // 1. Place the order first
    const orderResult = await submitOrder({
      tokenId,
      side: "BUY",
      size: amount,
      negRisk: market.negRisk,
      isMarketOrder: true,
    });

    if (!orderResult.success) {
      throw new Error(orderResult.error || "Order failed");
    }

    // 2. Collect fee AFTER successful order
    if (isFeeCollectionEnabled && relayClient) {
      try {
        const feeResult = await collectFee(relayClient, amount);
        if (feeResult.success && feeResult.txHash) {
          console.log(`Fee collected: ${feeResult.txHash}`);
        }
      } catch (err) {
        // Log but don't fail - user's bet already succeeded
        console.warn("Fee collection failed:", err);
      }
    }

    return orderResult;
  };
}
```

### Key Design Decisions

1. **Fee after order, not before**: The bet is the primary action. Fee collection is secondary and should never block or fail the user's bet.

2. **Silent failure**: If fee collection fails (network issue, insufficient balance, etc.), the user's bet still succeeds. Log the error for debugging but don't surface it to users.

3. **Use RelayClient**: Fee collection uses the same gasless `relayClient.execute()` pattern as betting. The user pays no gas for the fee transfer.

4. **BUY orders only**: Only collect fees on BUY orders where `amount` directly represents USDC spent. SELL orders don't have a straightforward USDC value.

### Fee Calculation

```typescript
// Example: 50 bps (0.5%) on a $100 bet
const feeBps = 50;
const orderValue = 100; // USDC

const feePercent = feeBps / 10000; // 0.005
const feeUSD = orderValue * feePercent; // $0.50

// Convert to USDC token units (6 decimals)
const feeAmount = BigInt(Math.floor(feeUSD * 1_000_000)); // 500000n
```

### Debugging Fee Collection

The hook logs to console with `[FeeCollection]` prefix:

```typescript
console.log("[FeeCollection] collectFee called with:", {
  orderValueUsdc,
  isFeeCollectionEnabled,
  feeAddress: INTEGRATOR_FEE_ADDRESS,
  feeBps: INTEGRATOR_FEE_BPS,
});
```

Check these logs to verify:
- Fee collection is enabled (address + bps both set)
- Fee amount is calculated correctly
- Transaction is being submitted
- Transaction hash is returned on success

### Common Issues

**Fee not being collected:**
1. Check `VITE_INTEGRATOR_FEE_ADDRESS` is set and valid
2. Check `VITE_INTEGRATOR_FEE_BPS` is > 0
3. Verify you rebuilt the app after changing env vars
4. Confirm `relayClient` is available when `collectFee` is called

**Fee collection failing:**
1. User's Safe may have insufficient USDC balance after bet
2. RelayClient not properly initialized
3. Network issues with Builder Relayer

## Design Principles

### 1. Use API Data Directly

**CRITICAL**: Never compute values that the Polymarket API provides. This has caused expensive bugs.

✅ **DO**: Use `market.negRisk`, `position.outcomeLabel`, `market.conditionId` directly
❌ **DON'T**: Try to derive negRisk status from token IDs or condition IDs

### 2. Query Real Balances

For redemption, we query actual CTF token balances on-chain:
```typescript
const balance = await queryCTFBalance(safeAddress, BigInt(tokenId));
```

### 3. Error Handling

All methods return result objects with `success` boolean:
```typescript
const result = await sdk.placeOrder(params);
if (!result.success) {
  console.error("Order failed:", result.error);
}
```

## Market Types Deep Dive

### Standard CTF Markets (negRisk=false)

- Examples: "Will BTC hit $100k by Dec 2024?"
- Backed by USDC collateral
- Redemption: CTF.redeemPositions(collateral, parentId, conditionId, indexSets)

### NegRisk Markets (negRisk=true)

- Examples: Soccer 3-way moneylines, Elections with many candidates
- Backed by WrappedCollateral (WCOL)
- Multiple outcomes, winner takes all
- Redemption: NegRiskAdapter.redeemPositions(conditionId, amounts)
  - amounts = [yesAmount, noAmount] based on outcomeLabel

## Fetching Market Data

The SDK handles order placement and redemption. For market discovery, use Polymarket's APIs directly:

```typescript
// Gamma API - Market discovery
const markets = await fetch("https://gamma-api.polymarket.com/events?active=true");

// Data API - User positions
const positions = await fetch(`https://data-api.polymarket.com/positions?user=${safeAddress}`);

// CLOB API - Order book (or use sdk.getOrderBook())
const book = await fetch(`https://clob.polymarket.com/book?token_id=${tokenId}`);
```

## Environment Variables

```bash
# Server-side (keep secret!)
POLYMARKET_BUILDER_API_KEY=your_builder_key
POLYMARKET_BUILDER_SECRET=your_builder_secret
POLYMARKET_BUILDER_PASSPHRASE=your_builder_passphrase

# Client-side (optional fee config)
VITE_INTEGRATOR_FEE_ADDRESS=0xYourFeeWallet
VITE_INTEGRATOR_FEE_BPS=50
```

## Common Gotchas

1. **Geo-blocking**: Polymarket blocks trading from certain countries. The SDK will receive "no liquidity" errors.

2. **Minimum order size**: Markets have minimum order values (typically $5). Check `market.orderMinSize`.

3. **Safe not deployed**: First-time users need to call `deploySafe()` before betting.

4. **USDC approval**: Call `approveUSDC()` once after Safe deployment.

5. **Token IDs**: Each outcome has its own tokenId. For a Yes/No market, there are 2 tokens.

## Example: AI Betting Agent

```typescript
import { PolymarketSDK } from "@/sdk";

class BettingAgent {
  private sdk: PolymarketSDK;

  async analyzeMomentum(tokenId: string): Promise<"BUY" | "SELL" | "HOLD"> {
    const book = await this.sdk.getOrderBook(tokenId);
    if (!book) return "HOLD";
    
    // Your strategy logic here
    if (book.isLowLiquidity || book.isWideSpread) return "HOLD";
    
    // Example: momentum strategy
    const price = book.bestAsk;
    // ... analyze historical prices, news, etc.
    
    return "BUY";
  }

  async executeTrade(tokenId: string, signal: "BUY" | "SELL", amount: number) {
    if (signal === "HOLD") return;
    
    const result = await this.sdk.placeOrder({
      tokenId,
      side: signal,
      amount,
      negRisk: false, // Get from market data
    });

    if (result.success && result.filled) {
      console.log(`Filled order ${result.orderID}`);
    }
  }
}
```

## Testing

Before going live:
1. Use small amounts ($1-5) to verify order flow
2. Check Safe deployment works
3. Test redemption with a resolved market
4. Verify fee collection (if enabled)

## Troubleshooting

### Module Resolution Errors

If you see errors like "Cannot find module '@polymarket/...'":

```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install @polymarket/clob-client @polymarket/builder-relayer-client @polymarket/builder-signing-sdk viem ethers@^5.7.0
npm install
```

### TypeScript Errors in SDK Files

The SDK uses viem's `readContract`. If you see type errors about missing `authorizationList` or `account`:

1. Check your viem version: `npm list viem`
2. The SDK casts `publicClient` as `any` to handle version differences
3. If issues persist, ensure viem >= 2.0.0

### Ethers v5 vs v6 Conflicts

The Polymarket CLOB client requires ethers v5. If you're using ethers v6 elsewhere:

```bash
# Install both versions with aliases
npm install ethers@^5.7.0 --save-exact
npm install ethers6@npm:ethers@^6 --save
```

Then in your code:
```typescript
// For Polymarket SDK - use ethers v5
import { ethers } from "ethers";

// For other parts of your app - use ethers v6
import { ethers as ethers6 } from "ethers6";
```

### "Safe not deployed" Error

First-time users must deploy their Safe wallet:

```typescript
await sdk.deploySafe();
await sdk.approveUSDC(); // Also required once
```

### "No liquidity" or Empty Order Book

This can mean:
1. The market has low/no liquidity
2. You're geo-blocked (Polymarket restricts certain countries)
3. The tokenId is incorrect

### Builder Credentials Invalid

1. Verify your credentials at https://polymarket.com/profile/settings (Builder API section)
2. Ensure the server endpoint is accessible from the client
3. Check that timestamps are within acceptable range (server clock sync)

---

## Bridge API - Multi-Chain Deposits & Withdrawals

Polymarket provides a Bridge API for cross-chain deposits and withdrawals. Users can deposit from Ethereum, Solana, Arbitrum, Base, or Bitcoin and withdraw to any supported chain.

### Base URL

```
https://bridge.polymarket.com
```

### Endpoints

#### GET /supported-assets
Returns all supported chains and tokens.

```typescript
interface SupportedAsset {
  chainId: string;         // e.g., "1" for Ethereum, "sol" for Solana
  chainName: string;       // e.g., "Ethereum", "Solana"
  token: {
    name: string;
    symbol: string;
    address: string;
    decimals: number;
  };
  minCheckoutUsd: number;  // Minimum withdrawal amount
}
```

#### POST /quote
Get a quote for deposit or withdrawal.

```typescript
// Request
{
  type: "deposit" | "withdraw",
  fromChainId?: string,
  toChainId?: string,
  fromToken?: string,
  toToken?: string,
  amount: string,
  destinationAddress: string
}

// Response
{
  estimatedOutput: string,
  fee: string,
  exchangeRate: string,
  estimatedTime: string
}
```

#### POST /deposit
Create a deposit address for cross-chain deposits.

```typescript
// Request
{
  chainId: string,
  tokenAddress: string,
  destinationAddress: string  // User's Polymarket wallet
}

// Response
{
  depositAddress: string,   // Address to send funds to
  chainId: string,
  expiresAt?: string
}
```

#### POST /withdraw
Initiate a cross-chain withdrawal.

```typescript
// Request
{
  destinationChainId: string,
  destinationTokenAddress: string,
  destinationAddress: string,  // User's external wallet
  amount: string               // In USDC micros (6 decimals)
}

// Response
{
  withdrawalId: string,
  status: string
}
```

#### GET /status/:address
Check the status of pending transactions.

```typescript
// Response
{
  status: "pending" | "processing" | "completed" | "failed",
  txHash?: string,
  amount?: string,
  timestamp?: string
}
```

### React Hook Implementation

```typescript
// client/src/hooks/useBridgeApi.ts
import { useState, useEffect, useCallback } from "react";

export function useBridgeApi() {
  const [supportedAssets, setSupportedAssets] = useState<SupportedAsset[]>([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);
  
  const fetchSupportedAssets = useCallback(async () => {
    const response = await fetch("/api/bridge/supported-assets");
    const data = await response.json();
    setSupportedAssets(data.supportedAssets || []);
    return data.supportedAssets;
  }, []);
  
  const getQuote = useCallback(async (request) => {
    const response = await fetch("/api/bridge/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    return response.json();
  }, []);
  
  const createDeposit = useCallback(async (request) => {
    const response = await fetch("/api/bridge/deposit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    return response.json();
  }, []);
  
  const createWithdrawal = useCallback(async (request) => {
    const response = await fetch("/api/bridge/withdraw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    return response.json();
  }, []);
  
  return {
    supportedAssets,
    isLoadingAssets,
    fetchSupportedAssets,
    getQuote,
    createDeposit,
    createWithdrawal,
  };
}
```

### Server Proxy Setup

Add these proxy endpoints to avoid CORS issues:

```typescript
// server/routes.ts
const BRIDGE_API_BASE = "https://bridge.polymarket.com";

app.get("/api/bridge/supported-assets", async (req, res) => {
  const response = await fetch(`${BRIDGE_API_BASE}/supported-assets`);
  const data = await response.json();
  res.json(data);
});

app.post("/api/bridge/quote", async (req, res) => {
  const response = await fetch(`${BRIDGE_API_BASE}/quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req.body),
  });
  const data = await response.json();
  res.json(data);
});

// ... similar for /deposit, /withdraw, /status/:address
```

### Usage Example

```typescript
// Deposit from Ethereum
const { createDeposit, getQuote, supportedAssets } = useBridgeApi();

// Get deposit address
const depositInfo = await createDeposit({
  chainId: "1",  // Ethereum
  tokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
  destinationAddress: userWalletAddress,
});

console.log("Send funds to:", depositInfo.depositAddress);

// Withdraw to Arbitrum
const quote = await getQuote({
  type: "withdraw",
  toChainId: "42161",  // Arbitrum
  toToken: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // USDC on Arbitrum
  amount: "100000000", // 100 USDC in micros
  destinationAddress: externalWallet,
});

console.log("Fee:", quote.fee, "Output:", quote.estimatedOutput);
```

---

## Support

This SDK was battle-tested through extensive debugging. If you encounter issues:
1. Check the console logs (SDK logs with `[SDK]` prefix)
2. Verify API credentials are correct
3. Confirm the user has USDC in their Safe
4. Check if Polymarket is geo-blocking

---

*Last updated: January 2026*
*Tested with: @polymarket/clob-client, @polymarket/builder-relayer-client*
