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

// Map chainId to the address type returned by Bridge API deposit endpoint
// The API returns: { evm: "0x...", svm: "...", btc: "..." }
// Only chains that map to these types are supported for deposits
type AddressType = "evm" | "svm" | "btc";

const CHAIN_ADDRESS_TYPE_MAP: Record<string, AddressType> = {
  // EVM-compatible chains use evm address (0x format)
  "ethereum": "evm",
  "eth": "evm",
  "arbitrum": "evm",
  "arb": "evm",
  "base": "evm",
  "polygon": "evm",
  "optimism": "evm",
  "op": "evm",
  "avalanche": "evm",
  "avax": "evm",
  "bnb": "evm",
  "bsc": "evm",
  // Solana uses svm address (base58 format)
  "solana": "svm",
  "sol": "svm",
  // Bitcoin uses btc address (bech32/legacy format)
  "bitcoin": "btc",
  "btc": "btc",
};

// Get the address type for a chain. Returns null if chain is not supported.
export function getAddressTypeForChain(chainId: string): AddressType | null {
  const normalizedChainId = chainId.toLowerCase().trim();
  
  // Direct match
  if (CHAIN_ADDRESS_TYPE_MAP[normalizedChainId]) {
    return CHAIN_ADDRESS_TYPE_MAP[normalizedChainId];
  }
  
  // Partial match for variations like "ethereum-mainnet", "arbitrum-one", etc.
  for (const [key, addressType] of Object.entries(CHAIN_ADDRESS_TYPE_MAP)) {
    if (normalizedChainId.includes(key)) {
      return addressType;
    }
  }
  
  return null;
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

  // Get chain options, filtering out chains that don't have valid address support
  const getChainOptions = useCallback(() => {
    const chainMap = new Map<string, { chainId: string; chainName: string; addressType: AddressType; tokens: SupportedAsset[] }>();
    
    for (const asset of supportedAssets) {
      // Only include chains that have a valid address type mapping
      const addressType = getAddressTypeForChain(asset.chainId);
      if (!addressType) {
        // Skip chains we can't map to an address type (e.g., Tron)
        continue;
      }
      
      if (!chainMap.has(asset.chainId)) {
        chainMap.set(asset.chainId, {
          chainId: asset.chainId,
          chainName: asset.chainName,
          addressType,
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
    getAddressTypeForChain,
  };
}
