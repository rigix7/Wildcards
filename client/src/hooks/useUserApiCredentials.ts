import { useCallback } from "react";
import { ClobClient } from "@polymarket/clob-client";
import { useWallet } from "@/providers/WalletContext";
import { CLOB_API_URL, POLYGON_CHAIN_ID } from "@/constants/polymarket";

export interface UserApiCredentials {
  key: string;
  secret: string;
  passphrase: string;
}

// This hook's sole purpose is to derive or create
// the User API Credentials with a temporary ClobClient
// Per official Polymarket example: use basic EOA-only client for credential derivation
// The trading client handles Safe association via signatureType=2

export default function useUserApiCredentials() {
  const { eoaAddress, ethersSigner } = useWallet();

  // Creates temporary clobClient with ethers signer (basic EOA-only)
  // safeAddress parameter is kept for logging but not used in client config
  const createOrDeriveUserApiCredentials = useCallback(
    async (_safeAddress?: string): Promise<UserApiCredentials> => {
      if (!eoaAddress || !ethersSigner) throw new Error("Wallet not connected");

      // Per official Polymarket example: use basic EOA-only client for credentials
      // The trading client (ClobClient with signatureType=2) handles Safe association
      const tempClient = new ClobClient(CLOB_API_URL, POLYGON_CHAIN_ID, ethersSigner);

      try {
        // Try to derive existing credentials first (matching official example)
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
    },
    [eoaAddress, ethersSigner]
  );

  return { createOrDeriveUserApiCredentials };
}
