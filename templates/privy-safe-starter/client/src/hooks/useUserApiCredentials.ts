import { useCallback } from "react";
import { ClobClient } from "@polymarket/clob-client";
import { useWallet } from "../providers/WalletContext";
import { CLOB_API_URL, POLYGON_CHAIN_ID } from "../constants/polymarket";

export interface UserApiCredentials {
  key: string;
  secret: string;
  passphrase: string;
}

/**
 * Hook for deriving or creating User API Credentials.
 * 
 * Per official Polymarket example: use basic EOA-only ClobClient for credential derivation.
 * The trading client handles Safe association via signatureType=2.
 * 
 * First tries to derive existing credentials, then creates new ones if none exist.
 */
export default function useUserApiCredentials() {
  const { eoaAddress, ethersSigner } = useWallet();

  const createOrDeriveUserApiCredentials = useCallback(
    async (_safeAddress?: string): Promise<UserApiCredentials> => {
      if (!eoaAddress || !ethersSigner) throw new Error("Wallet not connected");

      // Use basic EOA-only client for credentials (per official example)
      const tempClient = new ClobClient(CLOB_API_URL, POLYGON_CHAIN_ID, ethersSigner);

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

        // No existing credentials - create new ones
        console.log("Creating new User API Credentials...");
        const newCreds = await tempClient.createApiKey();
        console.log("Successfully created new User API Credentials");
        return newCreds;
      } catch (err) {
        console.error("Failed to get credentials:", err);
        throw err;
      }
    },
    [eoaAddress, ethersSigner]
  );

  return { createOrDeriveUserApiCredentials };
}
