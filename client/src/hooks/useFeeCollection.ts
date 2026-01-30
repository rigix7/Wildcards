import { useState, useCallback, useEffect } from "react";
import { RelayClient } from "@polymarket/builder-relayer-client";
import { USDC_E_DECIMALS, USDC_E_CONTRACT_ADDRESS } from "@/constants/tokens";
import { encodeFunctionData } from "viem";

const ERC20_TRANSFER_ABI = [
  {
    name: "transfer",
    type: "function",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

export type FeeCollectionResult = {
  success: boolean;
  feeAmount: bigint;
  txHash?: string;
  skipped?: boolean; // Fee was skipped (disabled or zero amount)
};

interface FeeConfig {
  feeAddress: string;
  feeBps: number;
  enabled: boolean;
}

export default function useFeeCollection() {
  const [isCollectingFee, setIsCollectingFee] = useState(false);
  const [feeError, setFeeError] = useState<Error | null>(null);
  const [feeConfig, setFeeConfig] = useState<FeeConfig>({
    feeAddress: "",
    feeBps: 0,
    enabled: false,
  });
  const [configLoaded, setConfigLoaded] = useState(false);

  useEffect(() => {
    async function loadFeeConfig() {
      try {
        const response = await fetch("/api/config/fees");
        if (response.ok) {
          const config = await response.json();
          console.log("[FeeCollection] Loaded fee config from API:", config);
          setFeeConfig({
            feeAddress: config.feeAddress || "",
            feeBps: config.feeBps || 0,
            enabled: config.enabled || false,
          });
        } else {
          console.warn("[FeeCollection] Failed to load fee config from API, using defaults");
        }
      } catch (err) {
        console.warn("[FeeCollection] Error loading fee config:", err);
      } finally {
        setConfigLoaded(true);
      }
    }
    loadFeeConfig();
  }, []);

  const calculateFeeAmount = useCallback(
    (orderValueUsdc: number): bigint => {
      if (!feeConfig.enabled || orderValueUsdc <= 0) {
        return BigInt(0);
      }

      const feeDecimal = orderValueUsdc * (feeConfig.feeBps / 10000);
      const feeAmount = BigInt(
        Math.floor(feeDecimal * Math.pow(10, USDC_E_DECIMALS))
      );
      return feeAmount;
    },
    [feeConfig.enabled, feeConfig.feeBps]
  );

  const collectFee = useCallback(
    async (
      relayClient: RelayClient,
      orderValueUsdc: number
    ): Promise<FeeCollectionResult> => {
      console.log("[FeeCollection] collectFee called with:", {
        orderValueUsdc,
        feeEnabled: feeConfig.enabled,
        feeAddress: feeConfig.feeAddress,
        feeBps: feeConfig.feeBps,
        configLoaded,
      });
      
      if (!feeConfig.enabled) {
        console.log("[FeeCollection] Skipped - fee collection not enabled");
        return { success: true, feeAmount: BigInt(0), skipped: true };
      }

      if (!feeConfig.feeAddress) {
        console.log("[FeeCollection] Skipped - no fee address configured");
        return { success: true, feeAmount: BigInt(0), skipped: true };
      }

      const feeAmount = calculateFeeAmount(orderValueUsdc);
      console.log("[FeeCollection] Calculated fee amount:", feeAmount.toString(), "wei (", (Number(feeAmount) / Math.pow(10, USDC_E_DECIMALS)).toFixed(6), "USDC)");

      if (feeAmount <= BigInt(0)) {
        console.log("[FeeCollection] Skipped - fee amount is zero or negative");
        return { success: true, feeAmount: BigInt(0), skipped: true };
      }

      setIsCollectingFee(true);
      setFeeError(null);

      try {
        console.log("[FeeCollection] Building transfer transaction to:", feeConfig.feeAddress);
        const transferData = encodeFunctionData({
          abi: ERC20_TRANSFER_ABI,
          functionName: "transfer",
          args: [feeConfig.feeAddress as `0x${string}`, feeAmount],
        });

        const feeTransferTx = {
          to: USDC_E_CONTRACT_ADDRESS,
          value: "0",
          data: transferData,
        };

        console.log("[FeeCollection] Executing relay transaction...");
        const response = await relayClient.execute(
          [feeTransferTx],
          `Collect integrator fee: ${(Number(feeAmount) / Math.pow(10, USDC_E_DECIMALS)).toFixed(2)} USDC`
        );
        console.log("[FeeCollection] Relay response received, waiting for confirmation...");
        const result = await response.wait();
        console.log("[FeeCollection] Transaction confirmed:", result?.transactionHash);

        return {
          success: true,
          feeAmount,
          txHash: result?.transactionHash,
        };
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error("Failed to collect fee");
        setFeeError(error);
        console.error("[FeeCollection] Fee collection error:", error);

        return { success: false, feeAmount };
      } finally {
        setIsCollectingFee(false);
      }
    },
    [feeConfig.enabled, feeConfig.feeAddress, feeConfig.feeBps, configLoaded, calculateFeeAmount]
  );

  return {
    collectFee,
    calculateFeeAmount,
    isCollectingFee,
    feeError,
    isFeeCollectionEnabled: feeConfig.enabled,
    feeAddressConfigured: !!feeConfig.feeAddress,
    feeBps: feeConfig.feeBps,
    configLoaded,
  };
}
