# Privy + Safe Wallet Deployment Guide for Polymarket

This guide documents the working configuration for integrating Privy authentication with Polymarket's Safe wallet system for gasless betting.

## Working Package Versions (Tested & Confirmed)

```json
{
  "@polymarket/builder-relayer-client": "^0.0.8",
  "@polymarket/builder-signing-sdk": "^0.0.8",
  "@polymarket/clob-client": "^4.22.8",
  "@privy-io/react-auth": "^3.8.1",
  "ethers": "^5.8.0",
  "viem": "^2.43.5"
}
```

**Critical:** Use ethers v5, NOT v6. The Polymarket SDKs require ethers v5 signers.

---

## Polygon Mainnet Contract Addresses

```ts
// Core Token Contracts
export const USDC_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";  // USDC.e
export const USDC_DECIMALS = 6;

// Polymarket CTF (Conditional Token Framework)
export const CTF_ADDRESS = "0x4d97dcd97ec945f40cf65f87097ace5ea0476045";
export const CTF_EXCHANGE_ADDRESS = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E";

// Neg Risk Markets (Multi-outcome markets like "Who will win the election?")
export const NEG_RISK_CTF_EXCHANGE_ADDRESS = "0xC5d563A36AE78145C45a50134d48A1215220f80a";
export const NEG_RISK_ADAPTER_ADDRESS = "0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296";

// Collateral
export const WRAPPED_COLLATERAL_ADDRESS = "0x3A3BD7bb9528E159577F7C2e685CC81A765002E2";

// Safe Wallet Infrastructure (VERIFIED - from actual deployment logs)
export const SAFE_FACTORY_ADDRESS = "0xaacFeEa03eb1561C4e67d661e40682Bd20E3541b";  // Deploys new Safe proxies
export const SAFE_MULTISEND_ADDRESS = "0xA238CBeb142c10Ef7Ad8442C6D1f9E89e07e7761";  // Batches token approvals

// Safe Derivation (for CREATE2 address computation)
export const SAFE_INIT_CODE_HASH = "0x2bce2127ff07fb632d16c8347c4ebf501f4841168bed00d9e6ef715ddb6fcecf";
// Safe Factory can also be retrieved dynamically: getContractConfig(137).SafeContracts.SafeFactory
```

---

## API Endpoints

```ts
export const POLYGON_CHAIN_ID = 137;

export const CLOB_API_URL = "https://clob.polymarket.com";
export const RELAYER_URL = "https://relayer-v2.polymarket.com/";
export const GAMMA_API_URL = "https://gamma-api.polymarket.com";
export const DATA_API_URL = "https://data-api.polymarket.com";

// Your server endpoint for remote Builder signing
export const REMOTE_SIGNING_URL = "/api/polymarket/sign";
```

---

## Key Architecture

1. **Privy creates an EOA wallet** (embedded or external)
2. **Safe address is derived** from that EOA using Polymarket's SDK
3. **Safe is deployed via RelayClient** (gasless, sponsored by Polymarket Builder Program)
4. **API credentials are derived** for CLOB trading

---

## Complete Implementation

### Step 1: Privy Configuration

```tsx
// PrivyProvider config - MUST use Polygon mainnet
import { polygon } from "viem/chains";

<PrivyProvider
  appId={appId}
  config={{
    defaultChain: polygon,
    supportedChains: [polygon],
    loginMethods: ['email', 'wallet', 'google', 'apple', 'twitter'],
    appearance: {
      theme: "dark",
      accentColor: "#f43f5e",
    },
    embeddedWallets: {
      ethereum: {
        createOnLogin: "users-without-wallets",
      },
    },
  }}
>
```

---

### Step 2: Wallet Provider (Get Ethers v5 Signer from Privy)

```tsx
// WalletProvider.tsx
import { useState, useEffect, type ReactNode } from "react";
import { createWalletClient, createPublicClient, custom, http, type WalletClient } from "viem";
import { providers } from "ethers";
import { PrivyProvider, useWallets, usePrivy } from "@privy-io/react-auth";
import { polygon } from "viem/chains";

const POLYGON_RPC_URL = "https://polygon-rpc.com";

const publicClient = createPublicClient({
  chain: polygon,
  transport: http(POLYGON_RPC_URL),
});

function WalletContextProvider({ children }: { children: ReactNode }) {
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null);
  const [ethersSigner, setEthersSigner] = useState<providers.JsonRpcSigner | null>(null);

  const { wallets, ready } = useWallets();
  const { authenticated, user, login, logout } = usePrivy();

  const wallet = wallets.find(w => w.address === user?.wallet?.address);
  const eoaAddress = authenticated && wallet 
    ? (wallet.address as `0x${string}`) 
    : undefined;

  useEffect(() => {
    async function init() {
      if (!wallet || !ready) {
        setWalletClient(null);
        setEthersSigner(null);
        return;
      }

      try {
        const provider = await wallet.getEthereumProvider();

        const client = createWalletClient({
          account: eoaAddress!,
          chain: polygon,
          transport: custom(provider),
        });

        setWalletClient(client);

        // CRITICAL: Use ethers v5 Web3Provider
        const ethersProvider = new providers.Web3Provider(provider);
        setEthersSigner(ethersProvider.getSigner());
      } catch (err) {
        console.error("Failed to initialize wallet client:", err);
        setWalletClient(null);
        setEthersSigner(null);
      }
    }

    init();
  }, [wallet, ready, eoaAddress]);

  // Force switch to Polygon if on wrong chain
  useEffect(() => {
    async function ensurePolygonChain() {
      if (!wallet || !ready || !authenticated) return;
      
      try {
        const chainId = wallet.chainId;
        if (chainId !== `eip155:${polygon.id}`) {
          await wallet.switchChain(polygon.id);
        }
      } catch (err) {
        console.error("Failed to switch chain:", err);
      }
    }
    ensurePolygonChain();
  }, [wallet, ready, authenticated]);

  return (
    <WalletContext.Provider
      value={{
        eoaAddress,
        walletClient,
        publicClient,
        ethersSigner,
        isReady: ready && authenticated && !!walletClient,
        authenticated,
        login,
        logout,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}
```

---

### Step 3: useRelayClient Hook (Remote Signing)

```tsx
// useRelayClient.ts
import { useState, useCallback } from "react";
import { useWallet } from "@/providers/WalletContext";
import { BuilderConfig } from "@polymarket/builder-signing-sdk";
import { RelayClient } from "@polymarket/builder-relayer-client";

const RELAYER_URL = "https://relayer-v2.polymarket.com/";
const POLYGON_CHAIN_ID = 137;

// Dynamic URL for remote signing endpoint
const REMOTE_SIGNING_URL = () =>
  typeof window !== "undefined"
    ? `${window.location.origin}/api/polymarket/sign`
    : "/api/polymarket/sign";

export default function useRelayClient() {
  const [relayClient, setRelayClient] = useState<RelayClient | null>(null);
  const { eoaAddress, ethersSigner } = useWallet();

  const initializeRelayClient = useCallback(async () => {
    if (!eoaAddress || !ethersSigner) {
      throw new Error("Wallet not connected");
    }

    // BuilderConfig with remote signing - keeps Builder credentials secure on server
    const builderConfig = new BuilderConfig({
      remoteBuilderConfig: {
        url: REMOTE_SIGNING_URL(),
      },
    });

    // RelayClient handles Safe deployment, token approvals, and CTF operations
    const client = new RelayClient(
      RELAYER_URL,
      POLYGON_CHAIN_ID,
      ethersSigner,
      builderConfig
    );

    setRelayClient(client);
    return client;
  }, [eoaAddress, ethersSigner]);

  const clearRelayClient = useCallback(() => {
    setRelayClient(null);
  }, []);

  return {
    relayClient,
    initializeRelayClient,
    clearRelayClient,
  };
}
```

---

### Step 4: useSafeDeployment Hook (Derive & Deploy Safe)

```tsx
// useSafeDeployment.ts
import { useCallback, useMemo } from "react";
import {
  RelayClient,
  RelayerTransactionState,
} from "@polymarket/builder-relayer-client";
import { deriveSafe } from "@polymarket/builder-relayer-client/dist/builder/derive";
import { getContractConfig } from "@polymarket/builder-relayer-client/dist/config";
import { useWallet } from "@/providers/WalletContext";

const POLYGON_CHAIN_ID = 137;

export default function useSafeDeployment(eoaAddress?: string) {
  const { publicClient } = useWallet();

  // Derive Safe address synchronously using the SDK's deriveSafe function
  // This uses CREATE2 to deterministically compute the Safe address from EOA
  const derivedSafeAddressFromEoa = useMemo(() => {
    if (!eoaAddress || !POLYGON_CHAIN_ID) return undefined;
    
    try {
      const config = getContractConfig(POLYGON_CHAIN_ID);
      const safeAddress = deriveSafe(eoaAddress, config.SafeContracts.SafeFactory);
      console.log("[SafeDeployment] Derived Safe address:", safeAddress);
      return safeAddress;
    } catch (err) {
      console.error("Error deriving Safe address:", err);
      return undefined;
    }
  }, [eoaAddress]);

  // Check if Safe is already deployed
  const isSafeDeployed = useCallback(
    async (relayClient: RelayClient, safeAddr: string): Promise<boolean> => {
      try {
        // Try relayClient API first
        const deployed = await (relayClient as any).getDeployed(safeAddr);
        return deployed;
      } catch (err) {
        console.warn("API check failed, falling back to RPC", err);

        // Fallback: check bytecode via RPC
        const code = await publicClient?.getCode({
          address: safeAddr as `0x${string}`,
        });
        return !!code && code !== "0x";
      }
    },
    [publicClient]
  );

  // Deploy Safe wallet for new users
  const deploySafe = useCallback(
    async (relayClient: RelayClient): Promise<string> => {
      try {
        const response = await relayClient.deploy();

        // Poll until transaction is confirmed
        const result = await relayClient.pollUntilState(
          response.transactionID,
          [
            RelayerTransactionState.STATE_MINED,
            RelayerTransactionState.STATE_CONFIRMED,
            RelayerTransactionState.STATE_FAILED,
          ],
          "60",   // timeout in seconds
          3000    // poll interval in ms
        );

        if (!result) {
          throw new Error("Safe deployment failed");
        }

        return result.proxyAddress;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        
        // Handle "already deployed" gracefully
        if (errorMessage.toLowerCase().includes("already deployed")) {
          console.log("Safe already deployed, continuing...");
          return derivedSafeAddressFromEoa || "";
        }
        
        throw err;
      }
    },
    [derivedSafeAddressFromEoa]
  );

  return {
    derivedSafeAddressFromEoa,
    isSafeDeployed,
    deploySafe,
  };
}
```

---

### Step 5: Server-Side Remote Signing Endpoint

```ts
// server/routes.ts
import crypto from "crypto";

// Builder credentials from polymarket.com/settings?tab=builder
const BUILDER_CREDENTIALS = {
  key: process.env.BUILDER_API_KEY || "",
  secret: process.env.BUILDER_API_SECRET || "",
  passphrase: process.env.BUILDER_PASSPHRASE || "",
};

// HMAC signature for Builder authentication
function buildHmacSignature(
  secret: string,
  timestamp: number,
  method: string,
  path: string,
  body: string
): string {
  const message = timestamp + method + path + body;
  return crypto
    .createHmac("sha256", Buffer.from(secret, "base64"))
    .update(message)
    .digest("base64");
}

// Remote signing endpoint - returns HMAC headers for builder authentication
app.post("/api/polymarket/sign", async (req, res) => {
  try {
    const { method, path, body } = req.body;

    if (!BUILDER_CREDENTIALS.key || !BUILDER_CREDENTIALS.secret || !BUILDER_CREDENTIALS.passphrase) {
      return res.status(500).json({ error: "Builder credentials not configured" });
    }

    if (!method || !path) {
      return res.status(400).json({ error: "Missing required parameters: method, path" });
    }

    const sigTimestamp = Date.now().toString();
    const bodyString = typeof body === "string" ? body : (body ? JSON.stringify(body) : "");

    const signature = buildHmacSignature(
      BUILDER_CREDENTIALS.secret,
      parseInt(sigTimestamp),
      method,
      path,
      bodyString
    );

    res.json({
      POLY_BUILDER_SIGNATURE: signature,
      POLY_BUILDER_TIMESTAMP: sigTimestamp,
      POLY_BUILDER_API_KEY: BUILDER_CREDENTIALS.key,
      POLY_BUILDER_PASSPHRASE: BUILDER_CREDENTIALS.passphrase,
    });
  } catch (error) {
    console.error("Signing error:", error);
    res.status(500).json({ error: "Failed to sign message" });
  }
});
```

---

### Step 6: useTradingSession Hook (Orchestration)

This hook coordinates the full initialization flow:

```tsx
// useTradingSession.ts (simplified)
import { useState, useCallback, useEffect } from "react";
import useRelayClient from "@/hooks/useRelayClient";
import { useWallet } from "@/providers/WalletContext";
import useSafeDeployment from "@/hooks/useSafeDeployment";

export default function useTradingSession() {
  const [currentStep, setCurrentStep] = useState<string>("idle");
  const [sessionError, setSessionError] = useState<Error | null>(null);

  const { eoaAddress } = useWallet();
  const { derivedSafeAddressFromEoa, isSafeDeployed, deploySafe } = useSafeDeployment(eoaAddress);
  const { relayClient, initializeRelayClient, clearRelayClient } = useRelayClient();

  const initializeTradingSession = useCallback(async () => {
    if (!eoaAddress) throw new Error("Wallet not connected");

    setCurrentStep("checking");
    setSessionError(null);

    try {
      // Step 1: Initialize RelayClient with remote signing
      const initializedRelayClient = await initializeRelayClient();

      // Step 2: Get derived Safe address
      if (!derivedSafeAddressFromEoa) {
        throw new Error("Failed to derive Safe address");
      }
      const safeAddress = derivedSafeAddressFromEoa;
      console.log("[TradingSession] Safe address:", safeAddress);

      // Step 3: Check if Safe is already deployed
      let isDeployed = await isSafeDeployed(initializedRelayClient, safeAddress);

      // Step 4: Deploy Safe if not already deployed (NEW USERS)
      if (!isDeployed) {
        setCurrentStep("deploying");
        await deploySafe(initializedRelayClient);
        isDeployed = true;
      }

      // Step 5: Continue with credentials derivation, approvals, etc.
      setCurrentStep("complete");
      
      return { safeAddress, isDeployed };
    } catch (err) {
      console.error("Session initialization error:", err);
      setSessionError(err instanceof Error ? err : new Error("Unknown error"));
      setCurrentStep("idle");
      throw err;
    }
  }, [eoaAddress, derivedSafeAddressFromEoa, isSafeDeployed, deploySafe, initializeRelayClient]);

  return {
    currentStep,
    sessionError,
    initializeTradingSession,
    derivedSafeAddress: derivedSafeAddressFromEoa,
  };
}
```

---

## Environment Variables Needed

```bash
# Frontend (must be prefixed with VITE_)
VITE_PRIVY_APP_ID=your-privy-app-id
VITE_POLYGON_RPC_URL=https://polygon-rpc.com

# Backend (server-side only - NEVER expose to frontend)
BUILDER_API_KEY=from polymarket.com/settings?tab=builder
BUILDER_API_SECRET=from polymarket.com/settings
BUILDER_PASSPHRASE=from polymarket.com/settings
```

---

## Common Issues & Fixes

| Issue | Solution |
|-------|----------|
| "Wallet proxy not initialized" | Wait for `ready && walletsReady` from Privy before using wallet |
| "Invalid signature" on orders | Ensure credentials were derived for current EOA, clear localStorage and re-derive |
| Safe deploy returns nothing | Check that Builder credentials are valid and remote signing endpoint works |
| ethers v6 errors | Downgrade to ethers ^5.8.0 |
| Chain mismatch | Force switch to Polygon: `await wallet.switchChain(137)` |
| Binary garbage in EIP-712 | Ensure you're using the remote signing pattern with BuilderConfig |

---

## Debugging Tips

1. **Console log the EOA address** - Make sure it's checksummed correctly
2. **Check Privy ready states** - Both `ready` and `walletsReady` must be true before using wallet
3. **Verify chain** - Must be Polygon mainnet (chainId 137)
4. **Test remote signing** - Hit your `/api/polymarket/sign` endpoint directly with curl
5. **Check Builder credentials** - Get fresh ones from polymarket.com/settings?tab=builder
6. **Check if Safe exists first** - Call `isSafeDeployed()` before attempting deploy

---

## Reference

- [Polymarket CLOB Docs](https://docs.polymarket.com/developers/CLOB/)
- [Official Privy+Safe Example](https://github.com/Polymarket/privy-safe-builder-example)
- [SDK Issues](https://github.com/Polymarket/clob-client/issues)
