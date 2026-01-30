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
  fromChainId: string;
  toChainId: string;
  fromTokenAddress: string;
  toTokenAddress: string;  // Bridge API requires toTokenAddress, not toToken
  fromAmountBaseUnit: string;  // Amount in base units (smallest denomination)
  recipientAddress: string;  // Bridge API requires this field name
}

export interface QuoteResponse {
  estCheckoutTimeMs: number;
  estFeeBreakdown: {
    appFeeLabel: string;
    appFeePercent: number;
    appFeeUsd: number;
    fillCostPercent: number;
    fillCostUsd: number;
    gasUsd: number;
    maxSlippage: number;
    minReceived: number;
    swapImpact: number;
    swapImpactUsd: number;
    totalImpact: number;
    totalImpactUsd: number;
  };
  estInputUsd: number;
  estOutputUsd: number;
  estToTokenBaseUnit: string;
  quoteId: string;
  // Computed fields for backward compatibility
  estimatedOutput: string;
  fee: string;
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

// POST /withdraw request - creates withdrawal addresses for bridging FROM Polymarket
export interface WithdrawRequest {
  address: string;           // Source Polymarket wallet address on Polygon (Safe address)
  toChainId: string;         // Destination chain ID
  toTokenAddress: string;    // Destination token contract address
  recipientAddr: string;     // Destination wallet address (note: "Addr" not "Address")
}

// POST /withdraw response - returns addresses where user sends USDC.e to initiate withdrawal
// Same structure as DepositResponse
export interface WithdrawResponse {
  address: DepositAddresses;  // { evm, svm, btc } - send USDC.e here to withdraw
  note?: string;
}

// Single transaction in status response
export interface Transaction {
  fromChainId: string;
  fromTokenAddress: string;
  fromAmountBaseUnit: string;
  toChainId: string;
  toTokenAddress: string;
  status: "DEPOSIT_DETECTED" | "PROCESSING" | "COMPLETED";
  txHash?: string;
  createdTimeMs?: number;
}

// GET /status/{address} response
export interface TransactionStatusResponse {
  transactions: Transaction[];
}

// Map chainId to the address type returned by Bridge API deposit endpoint
// The API returns: { evm: "0x...", svm: "...", btc: "..." }
// Only chains that map to these types are supported for deposits
type AddressType = "evm" | "svm" | "btc";

// Numeric chainIds from the Bridge API mapped to address types
// Note: Tron (728126428) is in supported-assets but no Tron address type exists in the deposit response
const CHAIN_ADDRESS_TYPE_MAP: Record<string, AddressType> = {
  // Special case: "polygon" is used as default in the UI
  "polygon": "evm",
  // EVM-compatible chains (use 0x format address)
  "1": "evm",        // Ethereum
  "10": "evm",       // Optimism
  "42161": "evm",    // Arbitrum
  "8453": "evm",     // Base
  "137": "evm",      // Polygon
  "56": "evm",       // BNB Smart Chain
  "143": "evm",      // Monad
  "2741": "evm",     // Abstract
  "3586256": "evm",  // Lighter
  "5064014": "evm",  // Ethereal
  "747474": "evm",   // Katana
  "999": "evm",      // HyperEVM
  // Solana (uses base58 format address)
  "1151111081099710": "svm",  // Solana
  // Bitcoin (uses bech32/legacy format address)
  "8253038": "btc",  // Bitcoin
  // Note: Tron (728126428) is NOT supported - Bridge API doesn't provide Tron address type
};

// Get the address type for a chain. Returns null if chain is not supported.
export function getAddressTypeForChain(chainId: string): AddressType | null {
  return CHAIN_ADDRESS_TYPE_MAP[chainId] || null;
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
      console.log("[BridgeApi] Sending quote request:", JSON.stringify(request, null, 2));
      const response = await fetch("/api/bridge/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const responseText = await response.text();
      console.log("[BridgeApi] Quote response status:", response.status, "body:", responseText);
      if (!response.ok) {
        let errorData;
        try {
          errorData = JSON.parse(responseText);
        } catch {
          errorData = { error: responseText };
        }
        console.error("[BridgeApi] Quote failed - Full error:", errorData);
        throw new Error(errorData.error || errorData.message || "Failed to get quote");
      }
      const rawData = JSON.parse(responseText);
      // Map API response to our QuoteResponse interface with computed fields
      const data: QuoteResponse = {
        ...rawData,
        // Compute backward-compatible fields
        estimatedOutput: `$${rawData.estOutputUsd?.toFixed(2) || '0.00'}`,
        fee: `$${rawData.estFeeBreakdown?.gasUsd?.toFixed(4) || '0.00'}`,
      };
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

  const getTransactionStatus = useCallback(async (address: string): Promise<TransactionStatusResponse | null> => {
    try {
      const response = await fetch(`/api/bridge/status/${address}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to get status");
      }
      const data: TransactionStatusResponse = await response.json();
      return data;
    } catch (error) {
      console.error("[BridgeApi] Error getting status:", error);
      return null;
    }
  }, []);

  // Get aggregated bridge history for a user (queries all their stored bridge addresses)
  const getBridgeHistory = useCallback(async (userAddress: string): Promise<TransactionStatusResponse | null> => {
    try {
      const response = await fetch(`/api/bridge/history/${userAddress}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to get bridge history");
      }
      const data: TransactionStatusResponse = await response.json();
      return data;
    } catch (error) {
      console.error("[BridgeApi] Error getting bridge history:", error);
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
    getBridgeHistory,
    getChainOptions,
    getAddressTypeForChain,
  };
}
