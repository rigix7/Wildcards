import { useState, useEffect, useRef, useCallback } from "react";
import { WSSubscriptionManager, type WebSocketHandlers } from "@nevuamarkets/poly-websockets";
import type { PriceChangeEvent } from "@nevuamarkets/poly-websockets";

export interface LivePrice {
  tokenId: string;
  bestAsk: number;
  bestBid: number;
  timestamp: number;
}

export interface UseLivePricesResult {
  prices: Map<string, LivePrice>;
  isConnected: boolean;
  subscribe: (tokenIds: string[]) => void;
  unsubscribe: (tokenIds: string[]) => void;
}

export function useLivePrices(): UseLivePricesResult {
  const [prices, setPrices] = useState<Map<string, LivePrice>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const managerRef = useRef<WSSubscriptionManager | null>(null);

  useEffect(() => {
    const handlers: WebSocketHandlers = {
      onPriceChange: async (events: PriceChangeEvent[]) => {
        console.log("[LivePrices] Received price updates:", events.length, "events");
        setPrices((prev) => {
          const next = new Map(prev);
          for (const event of events) {
            for (const change of event.price_changes) {
              next.set(change.asset_id, {
                tokenId: change.asset_id,
                bestAsk: parseFloat(change.best_ask),
                bestBid: parseFloat(change.best_bid),
                timestamp: parseInt(event.timestamp, 10),
              });
            }
          }
          return next;
        });
      },
      onWSOpen: async (managerId: string) => {
        console.log("[LivePrices] WebSocket connected:", managerId);
        setIsConnected(true);
      },
      onWSClose: async (managerId: string, code: number, reason: string) => {
        console.log("[LivePrices] WebSocket disconnected:", managerId, code, reason);
        setIsConnected(false);
      },
      onError: async (error: Error) => {
        console.error("[LivePrices] WebSocket error:", error);
      },
    };

    const manager = new WSSubscriptionManager(handlers);
    managerRef.current = manager;

    return () => {
      console.log("[LivePrices] Cleaning up WebSocket");
      manager.clearState();
    };
  }, []);

  const subscribe = useCallback((tokenIds: string[]) => {
    if (!managerRef.current || tokenIds.length === 0) return;
    console.log("[LivePrices] Subscribing to", tokenIds.length, "tokens");
    managerRef.current.addSubscriptions(tokenIds);
  }, []);

  const unsubscribe = useCallback((tokenIds: string[]) => {
    if (!managerRef.current || tokenIds.length === 0) return;
    console.log("[LivePrices] Unsubscribing from", tokenIds.length, "tokens");
    managerRef.current.removeSubscriptions(tokenIds);
  }, []);

  return { prices, isConnected, subscribe, unsubscribe };
}
