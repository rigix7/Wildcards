import { useCallback, useMemo } from "react";
import {
  RelayClient,
  RelayerTransactionState,
} from "@polymarket/builder-relayer-client";
import {
  getCreate2Address,
  keccak256,
  encodeAbiParameters,
  type Address,
} from "viem";
import { useWallet } from "@/providers/WalletContext";
import { POLYGON_CHAIN_ID } from "@/constants/polymarket";

// Safe factory address on Polygon (from Polymarket SDK)
const SAFE_FACTORY_ADDRESS = "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67";
// Safe init code hash for CREATE2 address derivation (from Polymarket SDK)
const SAFE_INIT_CODE_HASH = "0x2bce2127ff07fb632d16c8347c4ebf501f4841168bed00d9e6ef715ddb6fcecf" as `0x${string}`;

// Derive Safe wallet address from EOA using CREATE2 (same as Polymarket SDK)
function deriveSafeAddress(eoaAddress: string, safeFactory: string): string {
  return getCreate2Address({
    bytecodeHash: SAFE_INIT_CODE_HASH,
    from: safeFactory as Address,
    salt: keccak256(encodeAbiParameters([{ name: 'address', type: 'address' }], [eoaAddress as Address])),
  });
}

// This hook is responsible for deploying the Safe wallet and offers two additional helper functions
// to check if the Safe is already deployed and what the deterministic address is for the Safe

export default function useSafeDeployment(eoaAddress?: string) {
  const { publicClient } = useWallet();

  // This function derives the Safe address from the EOA address
  const derivedSafeAddressFromEoa = useMemo(() => {
    if (!eoaAddress || !POLYGON_CHAIN_ID) return undefined;

    try {
      return deriveSafeAddress(eoaAddress, SAFE_FACTORY_ADDRESS);
    } catch (err) {
      console.error("Error deriving Safe address:", err);
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
        // Prompts signer for a signature
        const response = await relayClient.deploy();

        // const result = await response.wait(); polls for a minute before timing out
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
        // Handle "safe already deployed" error - this is actually success
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
