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
// When a safeAddress is provided, credentials are derived for the Safe proxy
// using signatureType=2 (EOA signing on behalf of Safe)

export default function useUserApiCredentials() {
  const { eoaAddress, ethersSigner } = useWallet();

  // Creates temporary clobClient with ethers signer
  // If safeAddress is provided, uses signatureType=2 to derive credentials for the Safe
  const createOrDeriveUserApiCredentials = useCallback(
    async (safeAddress?: string): Promise<UserApiCredentials> => {
      if (!eoaAddress || !ethersSigner) throw new Error("Wallet not connected");

      // When safeAddress is provided, create client with signatureType=2
      // This derives credentials for the Safe proxy address (not the EOA)
      const tempClient = safeAddress
        ? new ClobClient(
            CLOB_API_URL,
            POLYGON_CHAIN_ID,
            ethersSigner,
            undefined, // no credentials yet
            2, // signatureType = 2 for EOA signing on behalf of Safe proxy
            safeAddress // the Safe proxy address that will "own" these credentials
          )
        : new ClobClient(CLOB_API_URL, POLYGON_CHAIN_ID, ethersSigner);

      try {
        // Try to derive existing credentials first
        const derivedCreds = await tempClient.deriveApiKey().catch(() => null);

        if (
          derivedCreds?.key &&
          derivedCreds?.secret &&
          derivedCreds?.passphrase
        ) {
          console.log(
            `Successfully derived existing User API Credentials for ${safeAddress || eoaAddress}`
          );
          return derivedCreds;
        }

        // Derive failed or returned invalid data - create new credentials
        console.log(
          `Creating new User API Credentials for ${safeAddress || eoaAddress}...`
        );
        const newCreds = await tempClient.createApiKey();
        console.log(
          `Successfully created new User API Credentials for ${safeAddress || eoaAddress}`
        );
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
