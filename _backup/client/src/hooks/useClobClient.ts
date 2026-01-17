import { useMemo } from "react";
import { ClobClient } from "@polymarket/clob-client";
import { useWallet } from "@/providers/WalletContext";
import { BuilderConfig } from "@polymarket/builder-signing-sdk";

import { TradingSession } from "@/utils/session";
import {
  CLOB_API_URL,
  POLYGON_CHAIN_ID,
  REMOTE_SIGNING_URL,
} from "@/constants/polymarket";

// This hook creates the authenticated clobClient with the User API Credentials
// and the builder config credentials, but only after a trading session is initialized
// NOTE: safeAddress is passed from caller (useTradingSession) to avoid circular dependency
// useSafeDeployment must only be called from useTradingSession, not here

// Validate that an address is a proper Ethereum address format
function isValidEthAddress(address: string | undefined): address is string {
  return !!address && /^0x[a-fA-F0-9]{40}$/.test(address);
}

export default function useClobClient(
  tradingSession: TradingSession | null,
  isTradingSessionComplete: boolean | undefined,
  safeAddress?: string
) {
  const { eoaAddress, ethersSigner } = useWallet();

  const clobClient = useMemo(() => {
    // Strict validation: safeAddress MUST be a valid Ethereum address
    // If not, the OrderBuilder will use API key as owner which causes invalid signature
    if (!isValidEthAddress(safeAddress)) {
      console.log("[ClobClient] Skipping creation: safeAddress invalid or missing:", safeAddress);
      return null;
    }

    if (
      !ethersSigner ||
      !eoaAddress ||
      !isTradingSessionComplete ||
      !tradingSession?.apiCredentials
    ) {
      console.log("[ClobClient] Skipping creation: missing dependencies", {
        hasEthersSigner: !!ethersSigner,
        eoaAddress,
        isTradingSessionComplete,
        hasApiCredentials: !!tradingSession?.apiCredentials,
      });
      return null;
    }

    // Log the critical parameters being passed to ClobClient
    console.log("[ClobClient] Creating client with:", {
      signatureType: 2,
      funder: safeAddress,
      eoaAddress,
      apiKeyPrefix: tradingSession.apiCredentials.key.substring(0, 8) + "...",
    });

    // Builder config with remote server signing for order attribution
    const builderConfig = new BuilderConfig({
      remoteBuilderConfig: {
        url: REMOTE_SIGNING_URL(),
      },
    });

    // This is the persisted clobClient instance for creating and posting
    // orders for the user, with proper builder order attribution
    const client = new ClobClient(
      CLOB_API_URL,
      POLYGON_CHAIN_ID,
      ethersSigner,
      tradingSession.apiCredentials,
      2, // signatureType = 2 for embedded wallet EOA to sign for Safe proxy wallet
      safeAddress,
      undefined, // mandatory placeholder
      false,
      builderConfig // Builder order attribution
    );

    console.log("[ClobClient] Client created successfully");
    return client;
  }, [
    eoaAddress,
    ethersSigner,
    safeAddress,
    isTradingSessionComplete,
    tradingSession?.apiCredentials,
  ]);

  return { clobClient };
}
