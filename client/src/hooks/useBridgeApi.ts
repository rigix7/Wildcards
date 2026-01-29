import { useState, useEffect, useCallback } from "react";

export interface SupportedAsset {
  chainId: string;
  chainName: string;
  token: {
    name: string;
    symbol: string;
    address: string;
    decimals: number;
  };
  minCheckoutUsd: number;
}

export interface SupportedAssetsResponse {
  supportedAssets: SupportedAsset[];
}

export interface QuoteRequest {
  type: "deposit" | "withdraw";
  fromChainId?: string;
  toChainId?: string;
  fromToken?: string;
  toToken?: string;
  amount: string;
  destinationAddress: string;
}

export interface QuoteResponse {
  estimatedOutput: string;
  fee: string;
  exchangeRate: string;
  estimatedTime: string;
}

export interface DepositRequest {
  address: string;
}

export interface DepositAddresses {
  evm: string;
  svm: string;
  btc: string;
}

export interface DepositResponse {
  address: DepositAddresses;
  note?: string;
}

export interface WithdrawRequest {
  destinationChainId: string;
  destinationTokenAddress: string;
  destinationAddress: string;
  amount: string;
}

export interface WithdrawResponse {
  withdrawalId: string;
  status: string;
}

export interface TransactionStatus {
  status: "pending" | "processing" | "completed" | "failed";
  txHash?: string;
  amount?: string;
  timestamp?: string;
}

export function useBridgeApi() {
  const [supportedAssets, setSupportedAssets] = useState<SupportedAsset[]>([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);
  const [assetsError, setAssetsError] = useState<string | null>(null);

  const fetchSupportedAssets = useCallback(async () => {
    setIsLoadingAssets(true);
    setAssetsError(null);
    try {
      const response = await fetch("/api/bridge/supported-assets");
      if (!response.ok) {
        throw new Error("Failed to fetch supported assets");
      }
      const data: SupportedAssetsResponse = await response.json();
      setSupportedAssets(data.supportedAssets || []);
      console.log("[BridgeApi] Loaded", data.supportedAssets?.length || 0, "supported assets");
      return data.supportedAssets || [];
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setAssetsError(message);
      console.error("[BridgeApi] Error fetching supported assets:", error);
      return [];
    } finally {
      setIsLoadingAssets(false);
    }
  }, []);

  useEffect(() => {
    fetchSupportedAssets();
  }, [fetchSupportedAssets]);

  const getQuote = useCallback(async (request: QuoteRequest): Promise<QuoteResponse | null> => {
    try {
      const response = await fetch("/api/bridge/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to get quote");
      }
      const data: QuoteResponse = await response.json();
      console.log("[BridgeApi] Quote received:", data);
      return data;
    } catch (error) {
      console.error("[BridgeApi] Error getting quote:", error);
      return null;
    }
  }, []);

  const createDeposit = useCallback(async (request: DepositRequest): Promise<DepositResponse | null> => {
    try {
      const response = await fetch("/api/bridge/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to create deposit");
      }
      const data: DepositResponse = await response.json();
      console.log("[BridgeApi] Deposit address created:", data);
      return data;
    } catch (error) {
      console.error("[BridgeApi] Error creating deposit:", error);
      return null;
    }
  }, []);

  const createWithdrawal = useCallback(async (request: WithdrawRequest): Promise<WithdrawResponse | null> => {
    try {
      const response = await fetch("/api/bridge/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to create withdrawal");
      }
      const data: WithdrawResponse = await response.json();
      console.log("[BridgeApi] Withdrawal created:", data);
      return data;
    } catch (error) {
      console.error("[BridgeApi] Error creating withdrawal:", error);
      return null;
    }
  }, []);

  const getTransactionStatus = useCallback(async (address: string): Promise<TransactionStatus | null> => {
    try {
      const response = await fetch(`/api/bridge/status/${address}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to get status");
      }
      const data: TransactionStatus = await response.json();
      return data;
    } catch (error) {
      console.error("[BridgeApi] Error getting status:", error);
      return null;
    }
  }, []);

  const getChainOptions = useCallback(() => {
    const chainMap = new Map<string, { chainId: string; chainName: string; tokens: SupportedAsset[] }>();
    
    for (const asset of supportedAssets) {
      if (!chainMap.has(asset.chainId)) {
        chainMap.set(asset.chainId, {
          chainId: asset.chainId,
          chainName: asset.chainName,
          tokens: [],
        });
      }
      chainMap.get(asset.chainId)!.tokens.push(asset);
    }
    
    return Array.from(chainMap.values());
  }, [supportedAssets]);

  return {
    supportedAssets,
    isLoadingAssets,
    assetsError,
    fetchSupportedAssets,
    getQuote,
    createDeposit,
    createWithdrawal,
    getTransactionStatus,
    getChainOptions,
  };
}
