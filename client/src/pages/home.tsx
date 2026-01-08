import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Header } from "@/components/terminal/Header";
import { BottomNav, TabType } from "@/components/terminal/BottomNav";
import { WalletDrawer } from "@/components/terminal/WalletDrawer";
import { useTerminalToast } from "@/components/terminal/Toast";
import { PredictView } from "@/components/views/PredictView";
import { ScoutView } from "@/components/views/ScoutView";
import { TradeView } from "@/components/views/TradeView";
import { DashboardView } from "@/components/views/DashboardView";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { fetchGammaEvents, gammaEventToMarket } from "@/lib/polymarket";
import type { Market, Player, Trade, Bet, Wallet, AdminSettings } from "@shared/schema";

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<TabType>("predict");
  const [isWalletOpen, setIsWalletOpen] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [selectedBet, setSelectedBet] = useState<{ marketId: string; outcomeId: string } | undefined>();
  const [liveMarkets, setLiveMarkets] = useState<Market[]>([]);
  const [liveMarketsLoading, setLiveMarketsLoading] = useState(false);
  const { showToast, ToastContainer } = useTerminalToast();

  const { data: demoMarkets = [], isLoading: demoMarketsLoading } = useQuery<Market[]>({
    queryKey: ["/api/markets"],
  });

  const { data: adminSettings } = useQuery<AdminSettings>({
    queryKey: ["/api/admin/settings"],
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

  const { data: wallet } = useQuery<Wallet>({
    queryKey: ["/api/wallet"],
  });

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
            category: m!.category as "sports" | "politics" | "crypto" | "entertainment",
            sport: m!.sport,
            league: m!.league,
            startTime: m!.startTime,
            status: m!.status as "open" | "closed" | "settled",
            outcomes: m!.outcomes,
            volume: m!.volume,
            liquidity: m!.liquidity,
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

  const placeBetMutation = useMutation({
    mutationFn: async (data: { marketId: string; outcomeId: string; amount: number; odds: number }) => {
      return apiRequest("POST", "/api/bets", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet"] });
      showToast("Bet placed successfully!", "success");
      setSelectedBet(undefined);
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
      queryClient.invalidateQueries({ queryKey: ["/api/wallet"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/wallet"] });
      showToast(`${variables.type === "buy" ? "Bought" : "Sold"} successfully!`, "success");
    },
    onError: () => {
      showToast("Trade failed", "error");
    },
  });

  const handlePlaceBet = (marketId: string, outcomeId: string, odds: number) => {
    if (selectedBet?.marketId === marketId && selectedBet?.outcomeId === outcomeId) {
      placeBetMutation.mutate({ marketId, outcomeId, amount: 10, odds });
    } else {
      setSelectedBet({ marketId, outcomeId });
      showToast("Tap again to confirm bet", "info");
    }
  };

  const handleFundPlayer = (playerId: string, amount: number) => {
    fundPlayerMutation.mutate({ playerId, amount });
  };

  const handleTrade = (playerId: string, type: "buy" | "sell") => {
    tradeMutation.mutate({ playerId, type, amount: 100 });
  };

  const handleConnect = () => {
    setIsConnected(true);
    setIsWalletOpen(false);
    showToast("Wallet connected!", "success");
  };

  const handleDisconnect = () => {
    setIsConnected(false);
    setIsWalletOpen(false);
    showToast("Wallet disconnected", "info");
  };

  return (
    <div className="min-h-screen bg-zinc-950 bg-hud-grid bg-[size:30px_30px] font-sans selection:bg-wild-brand selection:text-black text-sm overflow-hidden">
      <div className="relative z-10 h-screen flex flex-col max-w-[430px] mx-auto border-x border-zinc-800/50 bg-zinc-950/95 shadow-2xl">
        <Header
          usdcBalance={wallet?.usdcBalance || 4240.50}
          wildBalance={wallet?.wildBalance || 1250}
          onWalletClick={() => setIsWalletOpen(true)}
        />

        <main className="flex-1 overflow-hidden">
          {activeTab === "predict" && (
            <PredictView
              markets={markets}
              isLoading={marketsLoading}
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
              wallet={wallet || null}
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
        wallet={wallet || null}
        isConnected={isConnected}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
      />

      <ToastContainer />
    </div>
  );
}
