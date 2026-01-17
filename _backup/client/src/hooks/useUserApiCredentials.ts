import { useCallback } from "react";
import { ClobClient } from "@polymarket/clob-client";
import { useWallet } from "@/providers/WalletContext";
import { CLOB_API_URL, POLYGON_CHAIN_ID } from "@/constants/polymarket";

export interface UserApiCredentials {
  key: string;
  secret: string;
  passphrase: string;
}

// This hook derives or creates User API Credentials using a temporary ClobClient
// IMPORTANT: Per official Polymarket pattern (privy-safe-builder-example),
// credential derivation uses EOA-only client. signatureType=2 is only used
// in the trading ClobClient for order placement, not for credential derivation.

export default function useUserApiCredentials() {
  const { eoaAddress, ethersSigner } = useWallet();

  // Creates temporary EOA-only clobClient for credential derivation
  // This matches the official Polymarket pattern where credentials are
  // derived with EOA signer, and signatureType=2 is used only for trading
  const createOrDeriveUserApiCredentials =
    useCallback(async (): Promise<UserApiCredentials> => {
      if (!eoaAddress || !ethersSigner) throw new Error("Wallet not connected");

      // EOA-only client for credential derivation (per official Polymarket pattern)
      const tempClient = new ClobClient(
        CLOB_API_URL,
        POLYGON_CHAIN_ID,
        ethersSigner
      );

      try {
        // Try to derive existing credentials first
        const derivedCreds = await tempClient.deriveApiKey().catch(() => null);

        if (
          derivedCreds?.key &&
          derivedCreds?.secret &&
          derivedCreds?.passphrase
        ) {
          console.log("Successfully derived existing User API Credentials");
          return derivedCreds;
        }

        // Derive failed or returned invalid data - create new credentials
        console.log("Creating new User API Credentials...");
        const newCreds = await tempClient.createApiKey();
        console.log("Successfully created new User API Credentials");
        return newCreds;
      } catch (err) {
        console.error("Failed to get credentials:", err);
        throw err;
      }
    }, [eoaAddress, ethersSigner]);

  return { createOrDeriveUserApiCredentials };
}
