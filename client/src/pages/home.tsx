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
import { calculateOrderSize, fetchPositions, type PolymarketPosition } from "@/lib/polymarketOrder";
import { usePolymarketClient } from "@/hooks/usePolymarketClient";
import { getUSDCBalance } from "@/lib/polygon";
import { useWallet } from "@/providers/PrivyProvider";
import { useSafeWallet } from "@/hooks/useSafeWallet";
import type { Market, Player, Trade, Bet, Wallet, AdminSettings, WalletRecord, Futures } from "@shared/schema";

export default function HomePage() {
  const { authenticated: isConnected, eoaAddress: address, login, logout, isReady } = useWallet();
  const { safeAddress, isDeployed: isSafeDeployed, isDeploying: isSafeDeploying, deploy: deploySafe } = useSafeWallet();
  const { placeOrder, isSubmitting: isPolymarketSubmitting, isInitializing, error: polymarketError } = usePolymarketClient();
  const walletLoading = !isReady;
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
  } | undefined>();
  const [showBetSlip, setShowBetSlip] = useState(false);
  const [liveMarkets, setLiveMarkets] = useState<Market[]>([]);
  const [liveMarketsLoading, setLiveMarketsLoading] = useState(false);
  const [displayEvents, setDisplayEvents] = useState<DisplayEvent[]>([]);
  const [usdcBalance, setUsdcBalance] = useState(0);
  const [isRefreshingBalance, setIsRefreshingBalance] = useState(false);
  const [userPositions, setUserPositions] = useState<PolymarketPosition[]>([]);
  const { showToast, ToastContainer } = useTerminalToast();

  const { data: demoMarkets = [], isLoading: demoMarketsLoading } = useQuery<Market[]>({
    queryKey: ["/api/markets"],
  });

  const { data: adminSettings } = useQuery<AdminSettings>({
    queryKey: ["/api/admin/settings"],
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
  
  // Fetch balance function
  const fetchBalance = useCallback(async (isManual = false) => {
    const walletAddr = safeAddress || address;
    if (walletAddr && !walletAddr.startsWith("0xDemo")) {
      if (isManual) setIsRefreshingBalance(true);
      
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
    } else {
      setUsdcBalance(0);
      prevBalanceRef.current = 0;
      isFirstFetchRef.current = true;
    }
  }, [safeAddress, address, showToast]);

  // Fetch USDC balance with polling every 10 seconds
  useEffect(() => {
    // Reset on wallet change
    isFirstFetchRef.current = true;
    prevBalanceRef.current = 0;
    
    // Initial fetch
    fetchBalance();
    
    // Set up polling interval
    const intervalId = setInterval(fetchBalance, 10000);
    
    return () => clearInterval(intervalId);
  }, [fetchBalance]);

  // Fetch user positions when wallet is connected
  useEffect(() => {
    const walletAddr = safeAddress || address;
    if (walletAddr && !walletAddr.startsWith("0xDemo")) {
      fetchPositions(walletAddr).then(setUserPositions);
    } else {
      setUserPositions([]);
    }
  }, [safeAddress, address]);

  useEffect(() => {
    const loadLiveMarkets = async () => {
      const activeTagIds = adminSettings?.activeTagIds || [];
      if (activeTagIds.length === 0) {
        setLiveMarkets([]);
        setDisplayEvents([]);
        return;
      }

      setLiveMarketsLoading(true);
      try {
        const events = await fetchGammaEvents(activeTagIds);
        
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
  }, [adminSettings?.activeTagIds]);

  const hasLiveMarkets = (adminSettings?.activeTagIds?.length || 0) > 0;
  const markets = hasLiveMarkets ? liveMarkets : demoMarkets;
  const marketsLoading = hasLiveMarkets ? liveMarketsLoading : demoMarketsLoading;

  // Build wallet object from real data
  const wildBalance = walletRecord?.wildPoints || 0;
  const wallet: Wallet = useMemo(() => ({
    address: address || "",
    usdcBalance: usdcBalance,
    wildBalance: wildBalance,
    totalValue: usdcBalance + wildBalance,
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
    }) => {
      const walletAddr = safeAddress || address || "";
      
      if (data.tokenId && data.price) {
        const size = calculateOrderSize(data.amount, data.price);
        
        console.log("[Bet] Submitting to Polymarket via SDK:", {
          tokenId: data.tokenId,
          price: data.price,
          size,
          wallet: walletAddr,
        });
        
        // Use the ClobClient SDK for real wallet-signed orders
        const result = await placeOrder({
          tokenId: data.tokenId,
          side: "BUY",
          price: data.price,
          size,
          tickSize: "0.01",
          negRisk: false,
        });
        
        if (!result.success) {
          throw new Error(result.error || "Order failed");
        }
        
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
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet", address] });
      queryClient.invalidateQueries({ queryKey: ["/api/polymarket/orders", safeAddress || address] });
      
      const wildEarned = Math.floor(variables.amount);
      const orderMsg = (result as any)?.orderID 
        ? `Order ${(result as any).orderID.slice(0, 8)}... placed!` 
        : "Bet placed!";
      showToast(`${orderMsg} +${wildEarned} WILD earned`, "success");
      setSelectedBet(undefined);
      setShowBetSlip(false);
      fetchBalance();
      // Refetch positions after bet
      const walletAddr = safeAddress || address;
      if (walletAddr && !walletAddr.startsWith("0xDemo")) {
        fetchPositions(walletAddr).then(setUserPositions);
      }
    },
    onError: (error) => {
      const msg = error instanceof Error ? error.message : "Failed to place bet";
      showToast(msg, "error");
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
    noPrice?: number
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
    });
    setShowBetSlip(true);
  };

  const handleConfirmBet = (stake: number, direction: "yes" | "no", effectiveOdds: number) => {
    if (selectedBet) {
      const tokenId = direction === "yes" 
        ? selectedBet.yesTokenId
        : selectedBet.noTokenId;
      
      const betOutcomeId = direction === "yes" 
        ? (selectedBet.yesTokenId || selectedBet.outcomeId)
        : (selectedBet.noTokenId || `${selectedBet.outcomeId}_NO`);
      
      const price = effectiveOdds > 0 ? 1 / effectiveOdds : 0.5;
      
      placeBetMutation.mutate({
        marketId: selectedBet.marketId,
        outcomeId: betOutcomeId,
        amount: stake,
        odds: effectiveOdds,
        tokenId,
        price,
        marketTitle: selectedBet.marketTitle,
        outcomeLabel: selectedBet.outcomeLabel,
      });
    }
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
      <div className="relative z-10 h-screen flex flex-col max-w-[430px] mx-auto border-x border-zinc-800/50 bg-zinc-950/95 shadow-2xl">
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
        onDeploySafe={deploySafe}
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
        />
      )}

      <ToastContainer />
    </div>
  );
}
