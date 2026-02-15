import { useCallback, useMemo } from "react";
import {
  RelayClient,
  RelayerTransactionState,
} from "@polymarket/builder-relayer-client";
import { deriveSafe } from "@polymarket/builder-relayer-client/dist/builder/derive";
import { getContractConfig } from "@polymarket/builder-relayer-client/dist/config";
import { useWallet } from "@/providers/WalletContext";
import { POLYGON_CHAIN_ID } from "@/constants/polymarket";

// This hook is responsible for deploying the Safe wallet and offers helper functions
// to check if the Safe is already deployed and derive the address
// Uses the official SDK deriveSafe function for correct address computation

export default function useSafeDeployment(eoaAddress?: string) {
  const { publicClient } = useWallet();

  // Derive Safe address synchronously using the SDK's deriveSafe function
  // This matches the official Polymarket privy-safe-builder-example exactly
  const derivedSafeAddressFromEoa = useMemo(() => {
    if (!eoaAddress || !POLYGON_CHAIN_ID) return undefined;
    
    try {
      const config = getContractConfig(POLYGON_CHAIN_ID);
      const safeAddress = deriveSafe(eoaAddress, config.SafeContracts.SafeFactory);
      console.log("[SafeDeployment] Derived Safe address using SDK deriveSafe:", safeAddress);
      return safeAddress;
    } catch (err) {
      console.error("[SafeDeployment] CRITICAL: Failed to derive Safe address from EOA:", eoaAddress, "Error:", err);
      return undefined;
    }
  }, [eoaAddress]);

  // This function checks if the Safe is deployed by querying the relay client or RPC
  const isSafeDeployed = useCallback(
    async (relayClient: RelayClient, safeAddr: string): Promise<boolean> => {
      try {
        // Try relayClient first
        const deployed = await (relayClient as any).getDeployed(safeAddr);
        return deployed;
      } catch (err) {
        console.warn("API check failed, falling back to RPC", err);

        // Fallback to RPC
        const code = await publicClient?.getCode({
          address: safeAddr as `0x${string}`,
        });
        return !!code && code !== "0x";
      }
    },
    [publicClient]
  );

  // This function deploys the Safe using the relayClient
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
          console.log("Safe already deployed, continuing...");
          return derivedSafeAddressFromEoa || "";
        }
        
        const error =
          err instanceof Error ? err : new Error("Failed to deploy Safe");
        throw error;
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
