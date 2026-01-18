import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Header } from "@/components/terminal/Header";
import { BottomNav, TabType } from "@/components/terminal/BottomNav";
import { WalletDrawer } from "@/components/terminal/WalletDrawer";
import { BetSlip } from "@/components/terminal/BetSlip";
import { useTerminalToast } from "@/components/terminal/Toast";
import { PredictView } from "@/components/views/PredictView";
import { ScoutView } from "@/components/views/ScoutView";
import { TradeView } from "@/components/views/TradeView";
import { DashboardView } from "@/components/views/DashboardView";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { fetchGammaEvents, gammaEventToMarket, gammaEventToDisplayEvent, type DisplayEvent } from "@/lib/polymarket";
import { fetchPositions, type PolymarketPosition } from "@/lib/polymarketOrder";
import { getUSDCBalance } from "@/lib/polygon";
import { useWallet } from "@/providers/WalletContext";
import useTradingSession from "@/hooks/useTradingSession";
import useClobClient from "@/hooks/useClobClient";
import useClobOrder from "@/hooks/useClobOrder";
import { useLivePrices } from "@/hooks/useLivePrices";
import type { Market, Player, Trade, Bet, Wallet, AdminSettings, WalletRecord, Futures, PolymarketTagRecord, FuturesCategory } from "@shared/schema";

export default function HomePage() {
  const { authenticated: isConnected, eoaAddress: address, login, logout, isReady } = useWallet();
  const { 
    tradingSession, 
    currentStep, 
    isTradingSessionComplete, 
    initializeTradingSession, 
    endTradingSession,
    relayClient,
    derivedSafeAddress 
  } = useTradingSession();
  
  // Use Safe address from trading session (derived from RelayClient config)
  // This ensures we use the same address the relayer is configured with
  const safeAddress = tradingSession?.safeAddress || derivedSafeAddress;
  
  const { clobClient } = useClobClient(tradingSession, isTradingSessionComplete, safeAddress);
  const { submitOrder, isSubmitting: isPolymarketSubmitting, error: polymarketError } = useClobOrder(clobClient, safeAddress);
  
  const walletLoading = !isReady;
  const isSafeDeployed = tradingSession?.isSafeDeployed ?? false;
  const isSafeDeploying = currentStep === "deploying";
  const isInitializing = currentStep !== "idle" && currentStep !== "complete";
  const [activeTab, setActiveTab] = useState<TabType>("predict");
  const [isWalletOpen, setIsWalletOpen] = useState(false);
  const [selectedBet, setSelectedBet] = useState<{ 
    marketId: string; 
    outcomeId: string; 
    odds: number; 
    marketTitle: string; 
    outcomeLabel: string; 
    marketType?: string;
    direction?: "yes" | "no";
    yesTokenId?: string;
    noTokenId?: string;
    outcomeLabels?: [string, string];
    yesPrice?: number;
    noPrice?: number;
    orderMinSize?: number;
    question?: string;
    isSoccer3Way?: boolean;
  } | undefined>();
  const [showBetSlip, setShowBetSlip] = useState(false);
  const [liveMarkets, setLiveMarkets] = useState<Market[]>([]);
  const [liveMarketsLoading, setLiveMarketsLoading] = useState(false);
  const [displayEvents, setDisplayEvents] = useState<DisplayEvent[]>([]);
  const [usdcBalance, setUsdcBalance] = useState(0);
  const [isRefreshingBalance, setIsRefreshingBalance] = useState(false);
  const [userPositions, setUserPositions] = useState<PolymarketPosition[]>([]);
  const { showToast, ToastContainer } = useTerminalToast();
  
  // Live prices from WebSocket
  const livePrices = useLivePrices();

  const { data: demoMarkets = [], isLoading: demoMarketsLoading } = useQuery<Market[]>({
    queryKey: ["/api/markets"],
  });

  const { data: adminSettings } = useQuery<AdminSettings>({
    queryKey: ["/api/admin/settings"],
  });

  const { data: enabledTags = [] } = useQuery<PolymarketTagRecord[]>({
    queryKey: ["/api/admin/tags/enabled"],
  });

  const { data: futuresCategories = [] } = useQuery<FuturesCategory[]>({
    queryKey: ["/api/futures-categories"],
  });

  const { data: walletRecord } = useQuery<WalletRecord>({
    queryKey: ["/api/wallet", address],
    enabled: !!address,
  });

  const { data: players = [], isLoading: playersLoading } = useQuery<Player[]>({
    queryKey: ["/api/players"],
  });

  const { data: trades = [], isLoading: tradesLoading } = useQuery<Trade[]>({
    queryKey: ["/api/trades"],
  });

  const { data: bets = [], isLoading: betsLoading } = useQuery<Bet[]>({
    queryKey: ["/api/bets"],
  });

  const { data: futures = [], isLoading: futuresLoading } = useQuery<Futures[]>({
    queryKey: ["/api/futures"],
  });

  // Track previous balance for deposit detection
  const prevBalanceRef = useRef<number>(0);
  const isFirstFetchRef = useRef<boolean>(true);
  const lastFetchTimeRef = useRef<number>(0);
  const BALANCE_POLL_INTERVAL = 60000; // 60 seconds instead of 10
  const BALANCE_THROTTLE_MS = 5000; // Minimum 5 seconds between fetches
  
  // Fetch balance function with throttling
  const fetchBalance = useCallback(async (isManual = false) => {
    const walletAddr = safeAddress || address;
    if (!walletAddr || walletAddr.startsWith("0xDemo")) {
      setUsdcBalance(0);
      prevBalanceRef.current = 0;
      isFirstFetchRef.current = true;
      return;
    }
    
    // Throttle non-manual fetches to prevent RPC spam
    const now = Date.now();
    if (!isManual && now - lastFetchTimeRef.current < BALANCE_THROTTLE_MS) {
      return;
    }
    
    if (isManual) setIsRefreshingBalance(true);
    lastFetchTimeRef.current = now;
    
    try {
      const balance = await getUSDCBalance(walletAddr);
      
      // Check for deposit (balance increased) - skip first fetch
      if (!isFirstFetchRef.current && balance > prevBalanceRef.current) {
        const deposited = (balance - prevBalanceRef.current).toFixed(2);
        showToast(`Deposit received! +${deposited} USDC`, "success");
      }
      
      prevBalanceRef.current = balance;
      isFirstFetchRef.current = false;
      setUsdcBalance(balance);
    } finally {
      if (isManual) setIsRefreshingBalance(false);
    }
  }, [safeAddress, address, showToast]);

  // Fetch USDC balance with polling every 60 seconds, pausing when tab is hidden
  useEffect(() => {
    // Reset on wallet change
    isFirstFetchRef.current = true;
    prevBalanceRef.current = 0;
    
    const walletAddr = safeAddress || address;
    if (!walletAddr || walletAddr.startsWith("0xDemo")) {
      setUsdcBalance(0);
      return;
    }
    
    // Initial fetch
    fetchBalance();
    
    // Set up polling interval
    let intervalId: NodeJS.Timeout | null = setInterval(fetchBalance, BALANCE_POLL_INTERVAL);
    
    // Pause polling when tab is hidden to save RPC calls
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      } else {
        // Resume polling and fetch immediately when tab becomes visible
        if (!intervalId) {
          fetchBalance();
          intervalId = setInterval(fetchBalance, BALANCE_POLL_INTERVAL);
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchBalance, safeAddress, address]);

  // Fetch user positions when wallet is connected
  useEffect(() => {
    const walletAddr = safeAddress || address;
    if (walletAddr && !walletAddr.startsWith("0xDemo")) {
      fetchPositions(walletAddr).then(setUserPositions);
    } else {
      setUserPositions([]);
    }
  }, [safeAddress, address]);

  // Use admin settings activeTagIds to fetch Match Day events
  const activeTagIds = useMemo(() => 
    (adminSettings?.activeTagIds || []).sort().join(','), 
    [adminSettings?.activeTagIds]
  );
  
  useEffect(() => {
    const loadLiveMarkets = async () => {
      const tagIds = activeTagIds ? activeTagIds.split(',').filter(Boolean) : [];
      
      // Don't fetch if no leagues are selected in Match Day settings
      if (tagIds.length === 0) {
        setDisplayEvents([]);
        setLiveMarkets([]);
        setLiveMarketsLoading(false);
        return;
      }
      
      setLiveMarketsLoading(true);
      try {
        // Fetch events based on Match Day settings (series IDs)
        const events = await fetchGammaEvents(tagIds);
        
        // Convert to DisplayEvents for new event-based UI
        const displayEvts = events
          .map(gammaEventToDisplayEvent)
          .filter((e): e is DisplayEvent => e !== null);
        setDisplayEvents(displayEvts);
        
        // Keep legacy Market[] for backward compatibility
        const markets: Market[] = events
          .map(gammaEventToMarket)
          .filter((m) => m !== null)
          .map(m => ({
            id: m!.id,
            title: m!.title,
            description: m!.description || "",
            category: m!.category,
            sport: m!.sport,
            league: m!.league,
            startTime: m!.startTime,
            endTime: null,
            status: m!.status,
            outcomes: m!.outcomes,
            volume: m!.volume,
            liquidity: m!.liquidity,
            imageUrl: null,
          }));
        setLiveMarkets(markets);
      } catch (error) {
        console.error("Failed to load live markets:", error);
      } finally {
        setLiveMarketsLoading(false);
      }
    };

    loadLiveMarkets();
  }, [activeTagIds]);

  // Always use live markets from Polymarket (filtered by enabled tags or all if none enabled)
  const markets = liveMarkets;
  const marketsLoading = liveMarketsLoading;

  // Build wallet object from real data
  const wildBalance = walletRecord?.wildPoints || 0;
  const wallet: Wallet = useMemo(() => ({
    address: address || "",
    usdcBalance: usdcBalance,
    wildBalance: wildBalance,
    totalValue: usdcBalance, // Total value is just USDC - WILD points are separate loyalty rewards
  }), [address, usdcBalance, wildBalance]);

  const placeBetMutation = useMutation({
    mutationFn: async (data: { 
      marketId: string; 
      outcomeId: string; 
      amount: number; 
      odds: number;
      tokenId?: string;
      price?: number;
      marketTitle?: string;
      outcomeLabel?: string;
      orderMinSize?: number;
    }) => {
      const walletAddr = safeAddress || address || "";
      
      if (data.tokenId) {
        console.log("[Bet] Submitting FOK market order to Polymarket:", {
          tokenId: data.tokenId,
          amount: data.amount,
          wallet: walletAddr,
          orderMinSize: data.orderMinSize,
        });
        
        // Use FOK (Fill-or-Kill) market order via official useClobOrder hook
        const result = await submitOrder({
          tokenId: data.tokenId,
          side: "BUY",
          size: data.amount, // USDC amount to spend
          negRisk: false,
          isMarketOrder: true, // Use FOK market order
        });
        
        return result;
      }
      
      return apiRequest("POST", "/api/bets", {
        marketId: data.marketId,
        outcomeId: data.outcomeId,
        amount: data.amount,
        odds: data.odds,
        walletAddress: walletAddr,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet", address] });
      queryClient.invalidateQueries({ queryKey: ["/api/polymarket/orders", safeAddress || address] });
    },
    onError: () => {
    },
  });

  const fundPlayerMutation = useMutation({
    mutationFn: async (data: { playerId: string; amount: number }) => {
      return apiRequest("POST", "/api/players/fund", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      showToast("Funded 500 WILD successfully!", "success");
    },
    onError: () => {
      showToast("Failed to fund player", "error");
    },
  });

  const tradeMutation = useMutation({
    mutationFn: async (data: { playerId: string; type: "buy" | "sell"; amount: number }) => {
      return apiRequest("POST", "/api/trades", data);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/trades"] });
      showToast(`${variables.type === "buy" ? "Bought" : "Sold"} successfully!`, "success");
    },
    onError: () => {
      showToast("Trade failed", "error");
    },
  });

  const handlePlaceBet = (
    marketId: string, 
    outcomeId: string, 
    odds: number, 
    marketTitle?: string, 
    outcomeLabel?: string, 
    marketType?: string,
    direction?: "yes" | "no",
    yesTokenId?: string,
    noTokenId?: string,
    yesPrice?: number,
    noPrice?: number,
    orderMinSize?: number,
    question?: string,
    isSoccer3Way?: boolean
  ) => {
    if (!isConnected) {
      showToast("Connect wallet to place bets", "info");
      setIsWalletOpen(true);
      return;
    }

    // If title/label provided (from new event-based UI), use them directly
    if (marketTitle && outcomeLabel) {
      // Find the market from displayEvents to get outcome labels
      let foundOutcomeLabels: [string, string] | undefined;
      for (const event of displayEvents) {
        for (const group of event.marketGroups) {
          const market = group.markets.find(m => m.id === marketId);
          if (market && market.outcomes.length >= 2) {
            foundOutcomeLabels = [market.outcomes[0].label, market.outcomes[1].label];
            break;
          }
        }
        if (foundOutcomeLabels) break;
      }
      
      setSelectedBet({
        marketId,
        outcomeId,
        odds,
        marketTitle,
        outcomeLabel,
        marketType,
        direction,
        yesTokenId,
        noTokenId,
        outcomeLabels: foundOutcomeLabels,
        yesPrice,
        noPrice,
        orderMinSize,
        question,
        isSoccer3Way,
      });
      setShowBetSlip(true);
      return;
    }

    // Fallback for legacy futures or demo data
    const allMarkets = [...markets, ...futures.map(f => ({
      id: f.id,
      title: f.title,
      outcomes: f.marketData?.outcomes || [],
    }))];
    const market = allMarkets.find(m => m.id === marketId);
    const outcome = market?.outcomes?.find((o: { id?: string; marketId?: string; label: string }) => 
      o.id === outcomeId || o.marketId === outcomeId
    );
    
    setSelectedBet({
      marketId,
      outcomeId,
      odds,
      marketTitle: market?.title || "Unknown Market",
      outcomeLabel: outcome?.label || "Unknown",
      marketType,
      direction,
      yesTokenId,
      noTokenId,
      yesPrice,
      noPrice,
      orderMinSize,
      question,
      isSoccer3Way,
    });
    setShowBetSlip(true);
  };

  const handleConfirmBet = async (stake: number, direction: "yes" | "no", effectiveOdds: number, executionPrice: number): Promise<{ success: boolean; error?: string; orderId?: string }> => {
    if (!selectedBet) {
      return { success: false, error: "No bet selected" };
    }
    
    const tokenId = direction === "yes" 
      ? selectedBet.yesTokenId
      : selectedBet.noTokenId;
    
    const betOutcomeId = direction === "yes" 
      ? (selectedBet.yesTokenId || selectedBet.outcomeId)
      : (selectedBet.noTokenId || `${selectedBet.outcomeId}_NO`);
    
    const price = executionPrice;
    
    try {
      const result = await placeBetMutation.mutateAsync({
        marketId: selectedBet.marketId,
        outcomeId: betOutcomeId,
        amount: stake,
        odds: effectiveOdds,
        tokenId,
        price,
        marketTitle: selectedBet.marketTitle,
        outcomeLabel: selectedBet.outcomeLabel,
        orderMinSize: selectedBet.orderMinSize,
      });
      
      const orderResult = result as { 
        orderID?: string; 
        filled?: boolean; 
        status?: string; 
        error?: string;
      };
      
      const isFilled = orderResult?.filled !== false;
      
      if (isFilled) {
        return { success: true, orderId: orderResult?.orderID };
      } else {
        return { success: false, error: orderResult?.error || "Order not filled - not enough liquidity" };
      }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to place bet" };
    }
  };
  
  const handleBetSuccess = () => {
    const walletAddr = safeAddress || address;
    if (walletAddr && !walletAddr.startsWith("0xDemo")) {
      // Immediate fetch attempt
      fetchPositions(walletAddr).then(setUserPositions);
      
      // Delayed fetch after 15 seconds to account for Polymarket API latency
      setTimeout(() => {
        console.log("[Positions] Delayed refresh after 15 seconds");
        fetchPositions(walletAddr).then(setUserPositions);
      }, 15000);
    }
    fetchBalance();
  };

  const handleCancelBet = () => {
    setSelectedBet(undefined);
    setShowBetSlip(false);
  };

  const handleFundPlayer = (playerId: string, amount: number) => {
    fundPlayerMutation.mutate({ playerId, amount });
  };

  const handleTrade = (playerId: string, type: "buy" | "sell") => {
    tradeMutation.mutate({ playerId, type, amount: 100 });
  };

  const handleConnect = () => {
    login();
    setIsWalletOpen(false);
  };

  const handleDisconnect = () => {
    logout();
    setIsWalletOpen(false);
    showToast("Wallet disconnected", "info");
  };

  return (
    <div className="min-h-screen bg-zinc-950 bg-hud-grid bg-[size:30px_30px] font-sans selection:bg-wild-brand selection:text-black text-sm overflow-hidden">
      <div className="relative z-10 min-h-dvh h-dvh flex flex-col max-w-[430px] mx-auto border-x border-zinc-800/50 bg-zinc-950/95 shadow-2xl pb-safe">
        <Header
          usdcBalance={wallet.usdcBalance}
          wildBalance={wallet.wildBalance}
          onWalletClick={() => setIsWalletOpen(true)}
          isConnected={isConnected}
        />

        <main className="flex-1 overflow-hidden">
          {activeTab === "predict" && (
            <PredictView
              markets={markets}
              displayEvents={displayEvents}
              futures={futures}
              isLoading={marketsLoading}
              futuresLoading={futuresLoading}
              onPlaceBet={handlePlaceBet}
              selectedBet={selectedBet}
              adminSettings={adminSettings}
              userPositions={userPositions}
              livePrices={livePrices}
              enabledTags={enabledTags}
              futuresCategories={futuresCategories}
            />
          )}
          {activeTab === "scout" && (
            <ScoutView
              players={players}
              isLoading={playersLoading}
              onFund={handleFundPlayer}
              onTrade={handleTrade}
            />
          )}
          {activeTab === "trade" && (
            <TradeView
              trades={trades}
              players={players}
              isLoading={tradesLoading || playersLoading}
            />
          )}
          {activeTab === "dash" && (
            <DashboardView
              wallet={isConnected ? wallet : null}
              bets={bets}
              trades={trades}
              isLoading={betsLoading || tradesLoading}
              walletAddress={safeAddress || address}
              safeAddress={safeAddress}
              isSafeDeployed={isSafeDeployed}
            />
          )}
        </main>

        <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
      </div>

      <WalletDrawer
        isOpen={isWalletOpen}
        onClose={() => setIsWalletOpen(false)}
        wallet={isConnected ? wallet : null}
        isConnected={isConnected}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        safeAddress={safeAddress}
        isSafeDeployed={isSafeDeployed}
        isSafeDeploying={isSafeDeploying}
        onDeploySafe={initializeTradingSession}
        onRefreshBalance={() => fetchBalance(true)}
        isRefreshingBalance={isRefreshingBalance}
      />

      {showBetSlip && selectedBet && (
        <BetSlip
          marketTitle={selectedBet.marketTitle}
          outcomeLabel={selectedBet.outcomeLabel}
          odds={selectedBet.odds}
          maxBalance={usdcBalance}
          onConfirm={handleConfirmBet}
          onCancel={handleCancelBet}
          isPending={placeBetMutation.isPending}
          marketType={selectedBet.marketType}
          outcomeLabels={selectedBet.outcomeLabels}
          initialDirection={selectedBet.direction || "yes"}
          yesPrice={selectedBet.yesPrice}
          noPrice={selectedBet.noPrice}
          orderMinSize={selectedBet.orderMinSize}
          yesTokenId={selectedBet.yesTokenId}
          noTokenId={selectedBet.noTokenId}
          onSuccess={handleBetSuccess}
          question={selectedBet.question}
          isSoccer3Way={selectedBet.isSoccer3Way}
          getOrderBook={clobClient ? async (tokenId: string) => {
            try {
              console.log("[OrderBook] Fetching for token:", tokenId);
              console.log("[OrderBook] Selected bet yesTokenId:", selectedBet.yesTokenId);
              console.log("[OrderBook] Selected bet noTokenId:", selectedBet.noTokenId);
              const book = await clobClient.getOrderBook(tokenId);
              console.log("[OrderBook] Raw response:", JSON.stringify(book).slice(0, 500));
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
              console.log("[OrderBook] Parsed - bestBid:", bestBid, "bestAsk:", bestAsk);
              const spread = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0;
              const spreadPercent = bestAsk > 0 && bestBid > 0 ? (spread / bestBid) * 100 : 0;
              const bidDepth = bids[0]?.size || 0;
              const askDepth = asks[0]?.size || 0;
              const totalBidLiquidity = bids.reduce((sum: number, b: any) => sum + b.size * b.price, 0);
              const totalAskLiquidity = asks.reduce((sum: number, a: any) => sum + a.size * a.price, 0);
              return {
                bids,
                asks,
                bestBid,
                bestAsk,
                spread,
                spreadPercent,
                bidDepth,
                askDepth,
                totalBidLiquidity,
                totalAskLiquidity,
                isLowLiquidity: totalAskLiquidity < 100,
                isWideSpread: spreadPercent > 5,
              };
            } catch (err) {
              console.error("Failed to get order book:", err);
              return null;
            }
          } : undefined}
        />
      )}

      <ToastContainer />
    </div>
  );
}
