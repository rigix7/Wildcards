import { useQuery } from "@tanstack/react-query";
import { ClobClient } from "@polymarket/clob-client";
import { useState, useMemo, useEffect, useRef } from "react";

export interface OrderBookData {
  bestBid: number;
  bestAsk: number;
  spread: number;
  spreadPercent: number;
  isLowLiquidity: boolean;
  isWideSpread: boolean;
  lastUpdated: number;
}

export type OrderBookCache = Map<string, OrderBookData>;

const CLOB_HOST = "https://clob.polymarket.com";
const CHAIN_ID = 137;
const REFRESH_INTERVAL = 5000; // 5 seconds

async function fetchOrderBook(tokenId: string): Promise<OrderBookData | null> {
  try {
    const client = new ClobClient(CLOB_HOST, CHAIN_ID);
    const book = await client.getOrderBook(tokenId);
    
    const bids = (book.bids || []).map((b: any) => ({
      price: parseFloat(b.price || "0"),
      size: parseFloat(b.size || "0"),
    }));
    const asks = (book.asks || []).map((a: any) => ({
      price: parseFloat(a.price || "0"),
      size: parseFloat(a.size || "0"),
    }));
    
    const bestBid = bids[0]?.price || 0;
    const bestAsk = asks[0]?.price || 0;
    const spread = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0;
    const spreadPercent = bestAsk > 0 && bestBid > 0 ? (spread / bestBid) * 100 : 0;
    
    return {
      bestBid,
      bestAsk,
      spread,
      spreadPercent,
      isLowLiquidity: bestAsk === 0 || bestBid === 0,
      isWideSpread: spreadPercent > 10,
      lastUpdated: Date.now(),
    };
  } catch (error) {
    console.error(`[OrderBooks] Failed to fetch for ${tokenId.slice(0, 20)}...`, error);
    return null;
  }
}

async function fetchMultipleOrderBooks(tokenIds: string[]): Promise<OrderBookCache> {
  const cache = new Map<string, OrderBookData>();
  
  // Batch requests with concurrency limit to avoid overwhelming the API
  const BATCH_SIZE = 10;
  const batches: string[][] = [];
  
  for (let i = 0; i < tokenIds.length; i += BATCH_SIZE) {
    batches.push(tokenIds.slice(i, i + BATCH_SIZE));
  }
  
  for (const batch of batches) {
    const results = await Promise.all(
      batch.map(async (tokenId) => {
        const data = await fetchOrderBook(tokenId);
        return { tokenId, data };
      })
    );
    
    for (const { tokenId, data } of results) {
      if (data) {
        cache.set(tokenId, data);
      }
    }
  }
  
  return cache;
}

export function useOrderBooks(tokenIds: string[]) {
  const stableTokenIds = useMemo(
    () => Array.from(new Set(tokenIds.filter(Boolean))).sort(),
    [tokenIds.join(",")]
  );
  
  const { data: orderBookCache, isLoading, error, refetch } = useQuery({
    queryKey: ["orderBooks", stableTokenIds],
    queryFn: () => fetchMultipleOrderBooks(stableTokenIds),
    enabled: stableTokenIds.length > 0,
    refetchInterval: REFRESH_INTERVAL,
    staleTime: REFRESH_INTERVAL - 1000,
    gcTime: 60000,
  });
  
  const getOrderBookData = useMemo(() => {
    return (tokenId: string): OrderBookData | null => {
      if (!orderBookCache) return null;
      return orderBookCache.get(tokenId) || null;
    };
  }, [orderBookCache]);
  
  const getBestAsk = useMemo(() => {
    return (tokenId: string): number | null => {
      const data = getOrderBookData(tokenId);
      return data?.bestAsk && data.bestAsk > 0 && data.bestAsk < 0.99 
        ? data.bestAsk 
        : null;
    };
  }, [getOrderBookData]);
  
  return {
    orderBookCache: orderBookCache || new Map(),
    getOrderBookData,
    getBestAsk,
    isLoading,
    error,
    refetch,
  };
}

export function useOrderBook(tokenId: string | undefined) {
  const tokenIds = useMemo(
    () => tokenId ? [tokenId] : [],
    [tokenId]
  );
  
  const { getOrderBookData, getBestAsk, isLoading, error, refetch } = useOrderBooks(tokenIds);
  
  const orderBook = tokenId ? getOrderBookData(tokenId) : null;
  const bestAsk = tokenId ? getBestAsk(tokenId) : null;
  
  return {
    orderBook,
    bestAsk,
    isLoading,
    error,
    refetch,
  };
}
