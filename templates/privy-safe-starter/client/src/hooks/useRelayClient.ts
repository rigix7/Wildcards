import { useState, useCallback } from "react";
import { useWallet } from "../providers/WalletContext";
import { BuilderConfig } from "@polymarket/builder-signing-sdk";
import { RelayClient } from "@polymarket/builder-relayer-client";

import {
  RELAYER_URL,
  POLYGON_CHAIN_ID,
  REMOTE_SIGNING_URL,
} from "../constants/polymarket";

/**
 * Hook for creating and managing the RelayClient instance.
 * 
 * The RelayClient uses remote signing - it calls your server's /api/polymarket/sign
 * endpoint to get HMAC signatures using your Builder credentials (kept server-side).
 * 
 * This pattern keeps your Builder API key/secret secure on the server.
 */
export default function useRelayClient() {
  const [relayClient, setRelayClient] = useState<RelayClient | null>(null);
  const { eoaAddress, ethersSigner } = useWallet();

  const initializeRelayClient = useCallback(async () => {
    if (!eoaAddress || !ethersSigner) {
      throw new Error("Wallet not connected");
    }

    // Remote signing configuration - points to your server
    const builderConfig = new BuilderConfig({
      remoteBuilderConfig: {
        url: REMOTE_SIGNING_URL(),
      },
    });

    // Create RelayClient for Safe deployment and token approvals
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
