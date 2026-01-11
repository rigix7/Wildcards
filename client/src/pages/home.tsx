import { useState, useEffect, useMemo } from "react";
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
import { fetchGammaEvents, gammaEventToMarket } from "@/lib/polymarket";
import { getUSDCBalance } from "@/lib/polygon";
import { useWallet } from "@/providers/PrivyProvider";
import { useSafeWallet } from "@/hooks/useSafeWallet";
import type { Market, Player, Trade, Bet, Wallet, AdminSettings, WalletRecord, Futures } from "@shared/schema";

export default function HomePage() {
  const { authenticated: isConnected, eoaAddress: address, login, logout, isReady } = useWallet();
  const { safeAddress, isDeployed: isSafeDeployed, isDeploying: isSafeDeploying, deploy: deploySafe } = useSafeWallet();
  const walletLoading = !isReady;
  const [activeTab, setActiveTab] = useState<TabType>("predict");
  const [isWalletOpen, setIsWalletOpen] = useState(false);
  const [selectedBet, setSelectedBet] = useState<{ marketId: string; outcomeId: string; odds: number; marketTitle: string; outcomeLabel: string } | undefined>();
  const [showBetSlip, setShowBetSlip] = useState(false);
  const [liveMarkets, setLiveMarkets] = useState<Market[]>([]);
  const [liveMarketsLoading, setLiveMarketsLoading] = useState(false);
  const [usdcBalance, setUsdcBalance] = useState(0);
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

  // Fetch real USDC balance when wallet is connected (skip for demo addresses)
  useEffect(() => {
    const fetchBalance = async () => {
      if (address && !address.startsWith("0xDemo")) {
        const balance = await getUSDCBalance(address);
        setUsdcBalance(balance);
      } else {
        setUsdcBalance(0);
      }
    };
    fetchBalance();
  }, [address]);

  useEffect(() => {
    const loadLiveMarkets = async () => {
      const activeTagIds = adminSettings?.activeTagIds || [];
      if (activeTagIds.length === 0) {
        setLiveMarkets([]);
        return;
      }

      setLiveMarketsLoading(true);
      try {
        const events = await fetchGammaEvents(activeTagIds);
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
    mutationFn: async (data: { marketId: string; outcomeId: string; amount: number; odds: number }) => {
      return apiRequest("POST", "/api/bets", {
        ...data,
        walletAddress: address,
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet", address] });
      const wildEarned = Math.floor(variables.amount);
      showToast(`Bet placed! +${wildEarned} WILD earned`, "success");
      setSelectedBet(undefined);
      setShowBetSlip(false);
      if (address && !address.startsWith("0xDemo")) {
        getUSDCBalance(address).then(setUsdcBalance);
      }
    },
    onError: () => {
      showToast("Failed to place bet", "error");
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

  const handlePlaceBet = (marketId: string, outcomeId: string, odds: number) => {
    if (!isConnected) {
      showToast("Connect wallet to place bets", "info");
      setIsWalletOpen(true);
      return;
    }

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
    });
    setShowBetSlip(true);
  };

  const handleConfirmBet = (stake: number) => {
    if (selectedBet) {
      placeBetMutation.mutate({
        marketId: selectedBet.marketId,
        outcomeId: selectedBet.outcomeId,
        amount: stake,
        odds: selectedBet.odds,
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
              futures={futures}
              isLoading={marketsLoading}
              futuresLoading={futuresLoading}
              onPlaceBet={handlePlaceBet}
              selectedBet={selectedBet}
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
        />
      )}

      <ToastContainer />
    </div>
  );
}
