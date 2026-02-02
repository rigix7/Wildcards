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

## Key Architecture

1. **Privy creates an EOA wallet** (embedded or external)
2. **Safe address is derived** from that EOA using Polymarket's SDK
3. **Safe is deployed via RelayClient** (gasless, sponsored by Polymarket Builder Program)
4. **API credentials are derived** for CLOB trading

---

## Step 1: Privy Configuration

```tsx
// PrivyProvider config - MUST use Polygon mainnet
import { polygon } from "viem/chains";

<PrivyProviderBase
  appId={appId}
  config={{
    defaultChain: polygon,
    supportedChains: [polygon],
    loginMethods: ['email', 'wallet', 'google', 'apple', 'twitter'],
    embeddedWallets: {
      ethereum: {
        createOnLogin: "users-without-wallets",
      },
    },
  }}
>
```

---

## Step 2: Get Ethers v5 Signer from Privy

```tsx
// In your WalletContext/Provider
import { ethers } from "ethers";

const wallet = wallets.find(w => w.address === user?.wallet?.address);

// Get ethers v5 provider and signer
const getEthersSigner = async () => {
  if (!wallet) return null;
  const ethereumProvider = await wallet.getEthereumProvider();
  const ethersProvider = new ethers.providers.Web3Provider(ethereumProvider);
  return ethersProvider.getSigner();
};
```

---

## Step 3: Derive Safe Address (BEFORE deploying)

```tsx
import { deriveSafe } from "@polymarket/builder-relayer-client/dist/builder/derive";
import { getContractConfig } from "@polymarket/builder-relayer-client/dist/config";

const POLYGON_CHAIN_ID = 137;

function deriveSafeAddress(eoaAddress: string): string {
  const config = getContractConfig(POLYGON_CHAIN_ID);
  return deriveSafe(eoaAddress, config.SafeContracts.SafeFactory);
}
```

---

## Step 4: Initialize RelayClient with Remote Signing

```tsx
import { BuilderConfig } from "@polymarket/builder-signing-sdk";
import { RelayClient } from "@polymarket/builder-relayer-client";

const RELAYER_URL = "https://relayer-v2.polymarket.com/";
const POLYGON_CHAIN_ID = 137;

// Your server endpoint that signs with Builder credentials
const REMOTE_SIGNING_URL = "/api/polymarket/sign";

async function createRelayClient(ethersSigner) {
  const builderConfig = new BuilderConfig({
    remoteBuilderConfig: {
      url: REMOTE_SIGNING_URL,
    },
  });

  return new RelayClient(
    RELAYER_URL,
    POLYGON_CHAIN_ID,
    ethersSigner,  // ethers v5 signer!
    builderConfig
  );
}
```

---

## Step 5: Deploy Safe

```tsx
import { RelayerTransactionState } from "@polymarket/builder-relayer-client";

async function deploySafe(relayClient: RelayClient, derivedAddress: string): Promise<string> {
  try {
    const response = await relayClient.deploy();

    const result = await relayClient.pollUntilState(
      response.transactionID,
      [
        RelayerTransactionState.STATE_MINED,
        RelayerTransactionState.STATE_CONFIRMED,
        RelayerTransactionState.STATE_FAILED,
      ],
      "60",  // timeout seconds
      3000   // poll interval ms
    );

    if (!result) {
      throw new Error("Safe deployment failed");
    }

    return result.proxyAddress;
  } catch (err) {
    // Handle "already deployed" gracefully
    if (err.message?.toLowerCase().includes("already deployed")) {
      console.log("Safe already deployed");
      return derivedAddress;
    }
    throw err;
  }
}
```

---

## Step 6: Check if Safe is Already Deployed

```tsx
async function isSafeDeployed(relayClient: RelayClient, safeAddr: string): Promise<boolean> {
  try {
    return await relayClient.getDeployed(safeAddr);
  } catch (err) {
    // Fallback: check via RPC
    const code = await publicClient.getCode({ address: safeAddr });
    return !!code && code !== "0x";
  }
}
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

---

## Server-Side Remote Signing Endpoint

You need a `/api/polymarket/sign` endpoint that uses your Builder credentials:

```ts
// server/routes.ts
import { buildSignature } from "@polymarket/builder-signing-sdk";

app.post("/api/polymarket/sign", async (req, res) => {
  const { method, data } = req.body;
  
  const signature = await buildSignature(
    process.env.BUILDER_API_KEY,
    process.env.BUILDER_API_SECRET,
    process.env.BUILDER_PASSPHRASE,
    method,
    data
  );
  
  res.json({ signature });
});
```

---

## Environment Variables Needed

```
VITE_PRIVY_APP_ID=your-privy-app-id
VITE_POLYGON_RPC_URL=https://polygon-rpc.com
BUILDER_API_KEY=from polymarket.com/settings?tab=builder
BUILDER_API_SECRET=from polymarket.com/settings
BUILDER_PASSPHRASE=from polymarket.com/settings
```

---

## Full Hook Examples

### useSafeDeployment.ts

```tsx
import { useCallback, useMemo } from "react";
import {
  RelayClient,
  RelayerTransactionState,
} from "@polymarket/builder-relayer-client";
import { deriveSafe } from "@polymarket/builder-relayer-client/dist/builder/derive";
import { getContractConfig } from "@polymarket/builder-relayer-client/dist/config";

const POLYGON_CHAIN_ID = 137;

export default function useSafeDeployment(eoaAddress?: string, publicClient?: any) {
  // Derive Safe address synchronously using the SDK's deriveSafe function
  const derivedSafeAddressFromEoa = useMemo(() => {
    if (!eoaAddress) return undefined;
    
    try {
      const config = getContractConfig(POLYGON_CHAIN_ID);
      const safeAddress = deriveSafe(eoaAddress, config.SafeContracts.SafeFactory);
      return safeAddress;
    } catch (err) {
      console.error("Error deriving Safe address:", err);
      return undefined;
    }
  }, [eoaAddress]);

  const isSafeDeployed = useCallback(
    async (relayClient: RelayClient, safeAddr: string): Promise<boolean> => {
      try {
        const deployed = await (relayClient as any).getDeployed(safeAddr);
        return deployed;
      } catch (err) {
        // Fallback to RPC
        const code = await publicClient?.getCode({
          address: safeAddr as `0x${string}`,
        });
        return !!code && code !== "0x";
      }
    },
    [publicClient]
  );

  const deploySafe = useCallback(
    async (relayClient: RelayClient): Promise<string> => {
      try {
        const response = await relayClient.deploy();

        const result = await relayClient.pollUntilState(
          response.transactionID,
          [
            RelayerTransactionState.STATE_MINED,
            RelayerTransactionState.STATE_CONFIRMED,
            RelayerTransactionState.STATE_FAILED,
          ],
          "60",
          3000
        );

        if (!result) {
          throw new Error("Safe deployment failed");
        }

        return result.proxyAddress;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        if (errorMessage.toLowerCase().includes("already deployed")) {
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

### useRelayClient.ts

```tsx
import { useState, useCallback } from "react";
import { BuilderConfig } from "@polymarket/builder-signing-sdk";
import { RelayClient } from "@polymarket/builder-relayer-client";

const RELAYER_URL = "https://relayer-v2.polymarket.com/";
const POLYGON_CHAIN_ID = 137;
const REMOTE_SIGNING_URL = "/api/polymarket/sign";

export default function useRelayClient(eoaAddress?: string, ethersSigner?: any) {
  const [relayClient, setRelayClient] = useState<RelayClient | null>(null);

  const initializeRelayClient = useCallback(async () => {
    if (!eoaAddress || !ethersSigner) {
      throw new Error("Wallet not connected");
    }

    const builderConfig = new BuilderConfig({
      remoteBuilderConfig: {
        url: REMOTE_SIGNING_URL,
      },
    });

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

## Debugging Tips

1. **Console log the EOA address** - Make sure it's checksummed correctly
2. **Check Privy ready states** - Both `ready` and `walletsReady` must be true
3. **Verify chain** - Must be Polygon mainnet (chainId 137)
4. **Test remote signing** - Hit your `/api/polymarket/sign` endpoint directly
5. **Check Builder credentials** - Get fresh ones from polymarket.com/settings?tab=builder

---

## Reference

- [Polymarket CLOB Docs](https://docs.polymarket.com/developers/CLOB/)
- [Official Privy+Safe Example](https://github.com/Polymarket/privy-safe-builder-example)
- [SDK Issues](https://github.com/Polymarket/clob-client/issues)
