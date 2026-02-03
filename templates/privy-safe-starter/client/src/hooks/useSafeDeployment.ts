import { useCallback, useMemo } from "react";
import {
  RelayClient,
  RelayerTransactionState,
} from "@polymarket/builder-relayer-client";
import { deriveSafe } from "@polymarket/builder-relayer-client/dist/builder/derive";
import { getContractConfig } from "@polymarket/builder-relayer-client/dist/config";
import { useWallet } from "../providers/WalletContext";
import { POLYGON_CHAIN_ID } from "../constants/polymarket";

/**
 * Hook for Safe wallet deployment.
 * 
 * Uses Polymarket's official SDK to:
 * 1. Derive the Safe address deterministically from EOA (CREATE2)
 * 2. Check if Safe is already deployed
 * 3. Deploy Safe via RelayClient (gasless, sponsored by Builder Program)
 */
export default function useSafeDeployment(eoaAddress?: string) {
  const { publicClient } = useWallet();

  // Derive Safe address synchronously using SDK's deriveSafe function
  const derivedSafeAddressFromEoa = useMemo(() => {
    if (!eoaAddress || !POLYGON_CHAIN_ID) return undefined;
    
    try {
      const config = getContractConfig(POLYGON_CHAIN_ID);
      const safeAddress = deriveSafe(eoaAddress, config.SafeContracts.SafeFactory);
      console.log("[SafeDeployment] Derived Safe address using SDK deriveSafe:", safeAddress);
      return safeAddress;
    } catch (err) {
      console.error("Error deriving Safe address:", err);
      return undefined;
    }
  }, [eoaAddress]);

  // Check if Safe is deployed
  const isSafeDeployed = useCallback(
    async (relayClient: RelayClient, safeAddr: string): Promise<boolean> => {
      try {
        // Try relayClient API first
        const deployed = await (relayClient as any).getDeployed(safeAddr);
        return deployed;
      } catch (err) {
        console.warn("API check failed, falling back to RPC", err);

        // Fallback to RPC bytecode check
        const code = await publicClient?.getCode({
          address: safeAddr as `0x${string}`,
        });
        return !!code && code !== "0x";
      }
    },
    [publicClient]
  );

  // Deploy Safe via RelayClient
  const deploySafe = useCallback(
    async (relayClient: RelayClient): Promise<string> => {
      try {
        console.log("Deploying safe", derivedSafeAddressFromEoa + "...");
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
        
        throw err instanceof Error ? err : new Error("Failed to deploy Safe");
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
