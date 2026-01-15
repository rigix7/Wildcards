import { createContext, useContext, useMemo } from "react";
import { useOrderBooks, OrderBookData } from "@/hooks/useOrderBooks";
import type { DisplayEvent } from "@/lib/polymarket";

interface OrderBookContextValue {
  getBestAsk: (tokenId: string) => number | null;
  getOrderBookData: (tokenId: string) => OrderBookData | null;
  isLoading: boolean;
}

const OrderBookContext = createContext<OrderBookContextValue>({
  getBestAsk: () => null,
  getOrderBookData: () => null,
  isLoading: false,
});

export function useOrderBookContext() {
  return useContext(OrderBookContext);
}

function extractTokenIds(events: DisplayEvent[]): string[] {
  const tokenIds: string[] = [];
  
  for (const event of events) {
    for (const group of event.marketGroups) {
      for (const market of group.markets) {
        for (const outcome of market.outcomes) {
          if (outcome.tokenId) {
            tokenIds.push(outcome.tokenId);
          }
        }
      }
    }
  }
  
  return tokenIds;
}

interface OrderBookProviderProps {
  events: DisplayEvent[];
  children: React.ReactNode;
}

export function OrderBookProvider({ events, children }: OrderBookProviderProps) {
  const tokenIds = useMemo(() => extractTokenIds(events), [events]);
  
  const { getBestAsk, getOrderBookData, isLoading } = useOrderBooks(tokenIds);
  
  const contextValue = useMemo(() => ({
    getBestAsk,
    getOrderBookData,
    isLoading,
  }), [getBestAsk, getOrderBookData, isLoading]);
  
  return (
    <OrderBookContext.Provider value={contextValue}>
      {children}
    </OrderBookContext.Provider>
  );
}
