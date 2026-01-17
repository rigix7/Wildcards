import { apiRequest } from "./queryClient";

export interface PolymarketOrderParams {
  tokenId: string;
  side: "BUY" | "SELL";
  price: number;
  size: number;
  walletAddress: string;
  marketQuestion?: string;
  outcomeLabel?: string;
}

export interface PolymarketOrderResponse {
  success: boolean;
  orderID?: string;
  status?: string;
  error?: string;
  errorMsg?: string;
  details?: unknown;
}

export async function submitPolymarketOrder(params: PolymarketOrderParams): Promise<PolymarketOrderResponse> {
  const { tokenId, side, price, size, walletAddress, marketQuestion, outcomeLabel } = params;
  
  if (!tokenId) {
    return { success: false, error: "Missing token ID - cannot place order" };
  }
  
  if (!walletAddress) {
    return { success: false, error: "Wallet not connected" };
  }
  
  const order = {
    tokenID: tokenId,
    price: price,
    size: size,
    side: side,
    orderType: "GTC",
  };
  
  console.log("[Order] Submitting to Polymarket:", order);
  
  try {
    const response = await apiRequest<PolymarketOrderResponse>("POST", "/api/polymarket/orders", {
      order,
      walletAddress,
      marketQuestion,
      outcomeLabel,
    });
    
    return response;
  } catch (error) {
    console.error("[Order] Submission failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Order submission failed",
    };
  }
}

export function calculateOrderSize(stakeUSDC: number, price: number): number {
  if (price <= 0 || price >= 1) {
    return stakeUSDC;
  }
  return stakeUSDC / price;
}

export function calculatePotentialPayout(size: number, price: number): number {
  return size;
}

export interface PolymarketPosition {
  tokenId: string;
  conditionId?: string;
  marketQuestion?: string;
  outcomeLabel?: string;
  side: string;
  size: number;
  avgPrice: number;
  currentPrice?: number;
  unrealizedPnl?: number;
  status: string;
}

export async function fetchPositions(walletAddress: string): Promise<PolymarketPosition[]> {
  if (!walletAddress) return [];
  
  try {
    const response = await fetch(`/api/polymarket/positions/${walletAddress}`);
    if (!response.ok) {
      console.error("[Positions] Failed to fetch:", response.status);
      return [];
    }
    return response.json();
  } catch (error) {
    console.error("[Positions] Error:", error);
    return [];
  }
}

export async function redeemPosition(walletAddress: string, conditionId: string, outcomeSlot?: number): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await apiRequest<{ success: boolean; error?: string }>("POST", "/api/polymarket/redeem", {
      walletAddress,
      conditionId,
      outcomeSlot,
    });
    return response;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Redeem failed",
    };
  }
}

export async function withdrawUSDC(walletAddress: string, amount: number, toAddress: string): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    const response = await apiRequest<{ success: boolean; txHash?: string; error?: string }>("POST", "/api/polymarket/withdraw", {
      walletAddress,
      amount,
      toAddress,
    });
    return response;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Withdrawal failed",
    };
  }
}

export interface PolymarketActivity {
  type: "TRADE" | "REDEEM" | "SPLIT" | "MERGE" | "REWARD" | "CONVERSION";
  timestamp: number;
  conditionId: string;
  transactionHash: string;
  title: string;
  slug: string;
  icon?: string;
  outcome: string;
  side?: "BUY" | "SELL";
  size: number;
  usdcSize: number;
  price?: number;
}

export async function fetchActivity(walletAddress: string): Promise<PolymarketActivity[]> {
  if (!walletAddress) return [];
  
  try {
    const url = `https://data-api.polymarket.com/activity?user=${walletAddress}&type=TRADE,REDEEM&sortBy=TIMESTAMP&sortDirection=DESC`;
    console.log("[Activity] Fetching from:", url);
    
    const response = await fetch(url);
    if (!response.ok) {
      console.error("[Activity] Failed to fetch:", response.status);
      return [];
    }
    
    const data = await response.json();
    console.log("[Activity] Found", data.length, "records");
    return data;
  } catch (error) {
    console.error("[Activity] Error:", error);
    return [];
  }
}
