import { useCallback, useMemo, useState } from "react";
import { useWallets } from "@privy-io/react-auth";
import { createWalletClient, custom, type Hash } from "viem";
import { polygon } from "viem/chains";

export interface OrderParams {
  tokenId: string;
  side: "BUY" | "SELL";
  price: number;
  size: number;
}

export interface OrderResult {
  success: boolean;
  orderID?: string;
  error?: string;
}

interface BuilderHeaders {
  POLY_BUILDER_SIGNATURE: string;
  POLY_BUILDER_TIMESTAMP: string;
  POLY_BUILDER_API_KEY: string;
  POLY_BUILDER_PASSPHRASE: string;
}

async function getBuilderHeaders(method: string, path: string, body: string): Promise<BuilderHeaders> {
  const response = await fetch("/api/polymarket/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method, path, body }),
  });
  
  if (!response.ok) {
    throw new Error("Failed to get Builder signature");
  }
  
  return response.json();
}

export function usePolymarketRelayer() {
  const { wallets } = useWallets();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const embeddedWallet = useMemo(() => {
    return wallets.find(w => w.walletClientType === "privy");
  }, [wallets]);

  const submitOrder = useCallback(async (params: OrderParams): Promise<OrderResult> => {
    if (!embeddedWallet) {
      return { success: false, error: "No wallet connected" };
    }

    setIsSubmitting(true);
    
    try {
      // Get Ethereum provider from Privy wallet
      const provider = await embeddedWallet.getEthereumProvider();
      
      // Create viem wallet client
      const walletClient = createWalletClient({
        chain: polygon,
        transport: custom(provider),
      });
      
      const [address] = await walletClient.getAddresses();
      
      if (!address) {
        return { success: false, error: "Could not get wallet address" };
      }

      // For now, use the simpler approach of submitting order via our API
      // The server will handle the CLOB submission with Builder credentials
      // In production, this would use RelayClient with remote signing
      
      const orderData = {
        tokenID: params.tokenId,
        price: params.price,
        size: params.size,
        side: params.side,
        orderType: "GTC",
      };

      console.log("[Relayer] Submitting order via server proxy:", orderData);
      
      // Submit order through our server (which has Builder credentials)
      const response = await fetch("/api/polymarket/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order: orderData,
          walletAddress: address,
        }),
      });

      const result = await response.json();
      
      if (!response.ok || !result.success) {
        return {
          success: false,
          error: result.error || result.errorMsg || "Order submission failed",
        };
      }

      return {
        success: true,
        orderID: result.orderID,
      };
    } catch (error) {
      console.error("[Relayer] Order submission error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    } finally {
      setIsSubmitting(false);
    }
  }, [embeddedWallet]);

  const getSafeAddress = useCallback(async (): Promise<string | null> => {
    if (!embeddedWallet) {
      return null;
    }
    
    try {
      const provider = await embeddedWallet.getEthereumProvider();
      const walletClient = createWalletClient({
        chain: polygon,
        transport: custom(provider),
      });
      
      const [address] = await walletClient.getAddresses();
      return address || null;
    } catch {
      return null;
    }
  }, [embeddedWallet]);

  return {
    submitOrder,
    getSafeAddress,
    isSubmitting,
    hasWallet: !!embeddedWallet,
  };
}
