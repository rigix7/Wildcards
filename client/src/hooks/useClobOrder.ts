import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Side, OrderType } from "@polymarket/clob-client";
import type { ClobClient, UserOrder, UserMarketOrder } from "@polymarket/clob-client";
import { categorizeError, type CategorizedError } from "@/lib/polymarketErrors";

export type OrderParams = {
  tokenId: string;
  size: number;
  price?: number;
  side: "BUY" | "SELL";
  negRisk?: boolean;
  isMarketOrder?: boolean;
  marketContext?: {
    marketTitle?: string;
    marketType?: string;
    isLive?: boolean;
    eventSlug?: string;
  };
};

export interface OrderResult {
  success: boolean;
  orderId?: string;
  error?: string;
  errorCategory?: CategorizedError;
}

export default function useClobOrder(
  clobClient: ClobClient | null,
  walletAddress: string | undefined
) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastError, setLastError] = useState<CategorizedError | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const submitOrder = useCallback(
    async (params: OrderParams): Promise<OrderResult> => {
      const logContext = {
        tokenId: params.tokenId?.slice(0, 20) + "...",
        size: params.size,
        side: params.side,
        isMarketOrder: params.isMarketOrder,
        ...params.marketContext,
      };
      
      console.log("[Order] Starting order submission", logContext);
      
      if (!walletAddress) {
        const err = new Error("Wallet not connected");
        const categorized = categorizeError(err);
        console.error("[Order] Failed: No wallet address", categorized);
        setLastError(categorized);
        return { success: false, error: categorized.userMessage, errorCategory: categorized };
      }
      
      if (!clobClient) {
        const err = new Error("CLOB client not initialized");
        const categorized = categorizeError(err);
        console.error("[Order] Failed: No CLOB client", categorized);
        setLastError(categorized);
        return { success: false, error: categorized.userMessage, errorCategory: categorized };
      }

      if (!params.tokenId) {
        const err = new Error("Token ID is missing");
        const categorized = categorizeError(err);
        console.error("[Order] Failed: No token ID", categorized);
        setLastError(categorized);
        return { success: false, error: categorized.userMessage, errorCategory: categorized };
      }

      setIsSubmitting(true);
      setError(null);
      setLastError(null);
      setOrderId(null);

      try {
        console.log("[Order] Wallet address:", walletAddress);
        console.log("[Order] CLOB client signatureType:", (clobClient as any).orderBuilder?.signatureType);
        console.log("[Order] CLOB client funder:", (clobClient as any).orderBuilder?.funderAddress);
        console.log("[Order] Token ID:", params.tokenId);
        
        const side = params.side === "BUY" ? Side.BUY : Side.SELL;
        let response;

        if (params.isMarketOrder) {
          console.log("[Order] Preparing FOK market order");
          
          let marketAmount: number;

          if (side === Side.BUY) {
            console.log("[Order] Fetching current ask price for BUY order");
            
            try {
              const priceResponse = await clobClient.getPrice(
                params.tokenId,
                Side.SELL
              );
              const askPrice = parseFloat(priceResponse.price);
              console.log("[Order] Ask price response:", priceResponse, "parsed:", askPrice);

              if (isNaN(askPrice) || askPrice <= 0 || askPrice >= 1) {
                const err = new Error("Unable to get valid market price - no liquidity available");
                const categorized = categorizeError(err);
                console.error("[Order] Failed: Invalid ask price", { askPrice, categorized });
                setLastError(categorized);
                setError(err);
                return { success: false, error: categorized.userMessage, errorCategory: categorized };
              }

              marketAmount = params.size;
              console.log(`[Order] Market BUY: spending $${marketAmount} USDC at ~${(askPrice * 100).toFixed(0)}¢`);
            } catch (priceErr) {
              console.error("[Order] Failed to fetch price:", priceErr);
              const categorized = categorizeError(priceErr);
              setLastError(categorized);
              return { success: false, error: categorized.userMessage, errorCategory: categorized };
            }
          } else {
            marketAmount = params.size;
            console.log(`[Order] Market SELL: selling ${marketAmount} shares`);
          }

          const marketOrder: UserMarketOrder = {
            tokenID: params.tokenId,
            amount: marketAmount,
            side,
            feeRateBps: 0,
          };

          console.log("[Order] Submitting FOK order:", marketOrder);
          
          try {
            response = await clobClient.createAndPostMarketOrder(
              marketOrder,
              { negRisk: params.negRisk },
              OrderType.FOK
            );
            console.log("[Order] FOK order response:", response);
          } catch (submitErr) {
            console.error("[Order] FOK order submission failed:", submitErr);
            throw submitErr;
          }
        } else {
          console.log("[Order] Preparing GTC limit order");
          
          if (!params.price) {
            const err = new Error("Price required for limit orders");
            const categorized = categorizeError(err);
            console.error("[Order] Failed: No price for limit order", categorized);
            setLastError(categorized);
            return { success: false, error: categorized.userMessage, errorCategory: categorized };
          }

          const limitOrder: UserOrder = {
            tokenID: params.tokenId,
            price: params.price,
            size: params.size,
            side,
            feeRateBps: 0,
            expiration: 0,
            taker: "0x0000000000000000000000000000000000000000",
          };

          console.log("[Order] Submitting GTC order:", limitOrder);
          
          try {
            response = await clobClient.createAndPostOrder(
              limitOrder,
              { negRisk: params.negRisk },
              OrderType.GTC
            );
            console.log("[Order] GTC order response:", response);
          } catch (submitErr) {
            console.error("[Order] GTC order submission failed:", submitErr);
            throw submitErr;
          }
        }

        console.log("[Order] Full response:", JSON.stringify(response, null, 2));
        console.log("[Order] Response fields - success:", response.success, "errorMsg:", response.errorMsg, "orderID:", response.orderID, "status:", response.status);

        // Check the success field first - this is the primary indicator from Polymarket
        // For FOK orders, an orderID might exist even when the order wasn't filled
        if (response.success === true && (!response.errorMsg || response.errorMsg === "")) {
          console.log("[Order] Success! Order ID:", response.orderID);
          console.log("[Order] Status:", response.status, "takingAmount:", response.takingAmount, "makingAmount:", response.makingAmount);
          setOrderId(response.orderID);
          queryClient.invalidateQueries({ queryKey: ["active-orders"] });
          queryClient.invalidateQueries({ queryKey: ["polymarket-positions"] });
          return { success: true, orderId: response.orderID };
        } else if (response.errorMsg) {
          console.error("[Order] Order failed with errorMsg:", response.errorMsg);
          console.error("[Order] Response status:", response.status);
          const categorized = categorizeError(response.errorMsg);
          setLastError(categorized);
          setError(new Error(response.errorMsg));
          return { success: false, error: categorized.userMessage, errorCategory: categorized };
        } else if (response.success === false) {
          console.error("[Order] Order failed - success=false, status:", response.status);
          const err = new Error(response.status || "Order was not filled");
          const categorized = categorizeError(err);
          setLastError(categorized);
          setError(err);
          return { success: false, error: categorized.userMessage, errorCategory: categorized };
        } else {
          console.error("[Order] Order failed - unexpected response:", response);
          const err = new Error("Order submission failed - no confirmation received");
          const categorized = categorizeError(err);
          setLastError(categorized);
          setError(err);
          return { success: false, error: categorized.userMessage, errorCategory: categorized };
        }
      } catch (err: unknown) {
        console.error("[Order] Exception during order submission:");
        console.error("[Order] Error type:", typeof err);
        console.error("[Order] Error:", err);
        
        if (err && typeof err === "object") {
          const errObj = err as Record<string, unknown>;
          console.error("[Order] Error keys:", Object.keys(errObj));
          console.error("[Order] Error message:", errObj.message);
          console.error("[Order] Error code:", errObj.code);
          console.error("[Order] Error status:", errObj.status || errObj.statusCode);
          
          try {
            console.error("[Order] Error JSON:", JSON.stringify(err, null, 2));
          } catch {
            console.error("[Order] Could not stringify error");
          }
        }
        
        const categorized = categorizeError(err);
        console.error("[Order] Categorized error:", categorized);
        
        setLastError(categorized);
        setError(err instanceof Error ? err : new Error(categorized.technicalDetails));
        
        return { 
          success: false, 
          error: categorized.userMessage, 
          errorCategory: categorized 
        };
      } finally {
        setIsSubmitting(false);
      }
    },
    [clobClient, walletAddress, queryClient]
  );

  const cancelOrder = useCallback(
    async (orderId: string) => {
      if (!clobClient) {
        throw new Error("CLOB client not initialized");
      }

      setIsSubmitting(true);
      setError(null);

      try {
        await clobClient.cancelOrder({ orderID: orderId });
        queryClient.invalidateQueries({ queryKey: ["active-orders"] });
        return { success: true };
      } catch (err: unknown) {
        const error =
          err instanceof Error ? err : new Error("Failed to cancel order");
        setError(error);
        throw error;
      } finally {
        setIsSubmitting(false);
      }
    },
    [clobClient, queryClient]
  );

  return {
    submitOrder,
    cancelOrder,
    isSubmitting,
    error,
    lastError,
    orderId,
  };
}
