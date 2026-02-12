import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
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
import { fetchPositions, fetchActivity, type PolymarketPosition } from "@/lib/polymarketOrder";
import { getUSDCBalance } from "@/lib/polygon";
import { useWallet } from "@/providers/WalletContext";
import useTradingSession from "@/hooks/useTradingSession";
import useClobClient from "@/hooks/useClobClient";
import useClobOrder from "@/hooks/useClobOrder";
import { useLivePrices } from "@/hooks/useLivePrices";
import useFeeCollection from "@/hooks/useFeeCollection";
import { useTheme } from "@/hooks/useTheme";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { DollarSign, Loader2, CheckCircle2, X, AlertTriangle } from "lucide-react";
import type { Market, Player, Trade, Bet, Wallet, AdminSettings, WalletRecord, Futures, PolymarketTagRecord, FuturesCategory } from "@shared/schema";

export default function HomePage() {
  const { pointsName, pointsEnabled } = useTheme();
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
  const { collectFee, isFeeCollectionEnabled, showFeeInUI } = useFeeCollection();
  
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
    negRisk?: boolean;
  } | undefined>();
  const [showBetSlip, setShowBetSlip] = useState(false);
  const [liveMarkets, setLiveMarkets] = useState<Market[]>([]);
  const [liveMarketsLoading, setLiveMarketsLoading] = useState(false);
  const [displayEvents, setDisplayEvents] = useState<DisplayEvent[]>([]);
  const [usdcBalance, setUsdcBalance] = useState(0);
  const [isRefreshingBalance, setIsRefreshingBalance] = useState(false);
  const [userPositions, setUserPositions] = useState<PolymarketPosition[]>([]);
  const { showToast, ToastContainer } = useTerminalToast();
  
  // Sell modal state (for selling from PredictView)
  const [sellModalOpen, setSellModalOpen] = useState(false);
  const [sellPosition, setSellPosition] = useState<{ tokenId: string; size: number; avgPrice: number; outcomeLabel?: string; marketQuestion?: string; negRisk?: boolean } | null>(null);
  const [sellAmount, setSellAmount] = useState("");
  const [sellError, setSellError] = useState<string | null>(null);
  const [sellSuccess, setSellSuccess] = useState(false);
  const [isSelling, setIsSelling] = useState(false);
  const [sellBestBid, setSellBestBid] = useState<number | null>(null);
  const [isLoadingSellBid, setIsLoadingSellBid] = useState(false);
  
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
      originalStake?: number; // User's entered stake (before fee deduction) for fee calculation
    }) => {
      const walletAddr = safeAddress || address || "";
      
      if (data.tokenId) {
        console.log("[Bet] Submitting FOK market order to Polymarket:", {
          tokenId: data.tokenId,
          amount: data.amount,
          wallet: walletAddr,
          orderMinSize: data.orderMinSize,
        });
        
        // ATOMIC FEE COLLECTION: Collect fee BEFORE placing order
        // This ensures users can't reject the fee after their bet is placed
        const feeBaseAmount = data.originalStake || data.amount;
        
        // Track if fee was actually collected (not skipped or disabled)
        let feeWasCollected = false;
        
        if (isFeeCollectionEnabled && relayClient) {
          console.log("[FeeCollection] Collecting fee BEFORE order on stake $" + feeBaseAmount);
          try {
            const feeResult = await collectFee(relayClient, feeBaseAmount);
            if (!feeResult.success) {
              console.error("[FeeCollection] Fee collection failed - aborting order");
              return { success: false, error: "Fee collection failed. Please try again." };
            }
            if (feeResult.skipped) {
              console.log("[FeeCollection] Fee was skipped (disabled or zero amount)");
              // Fee was skipped, not actually collected
              feeWasCollected = false;
            } else {
              console.log("[FeeCollection] Fee collected:", feeResult.feeAmount.toString(), "tx:", feeResult.txHash);
              // Fee was actually transferred
              feeWasCollected = true;
            }
          } catch (feeErr) {
            console.error("[FeeCollection] Fee collection error - aborting order:", feeErr);
            return { success: false, error: "Fee collection failed. Please try again." };
          }
        } else {
          console.log("[FeeCollection] Skipped (not enabled or no relay client)");
        }
        
        // Now submit the order after fee is collected (or skipped)
        // Use FOK (Fill-or-Kill) market order via official useClobOrder hook
        // negRisk is true for winner-take-all markets like soccer 3-way moneylines
        const result = await submitOrder({
          tokenId: data.tokenId,
          side: "BUY",
          size: data.amount, // USDC amount to spend
          negRisk: selectedBet?.negRisk ?? false,
          isMarketOrder: true, // Use FOK market order
        });
        
        // If order failed but fee was collected, add note about potential refund
        if (!result.success && feeWasCollected) {
          console.warn("[Bet] Order failed after fee was collected. User may need support for refund.");
          return {
            ...result,
            error: (result.error || "Order failed") + " (Fee was collected - contact support if needed)"
          };
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
      showToast(`Funded 500 ${pointsName} successfully!`, "success");
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
    isSoccer3Way?: boolean,
    negRisk?: boolean
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
        negRisk,
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
      negRisk,
    });
    setShowBetSlip(true);
  };

  // Handler to open sell modal from PredictView
  const handleOpenSellModal = useCallback(async (position: { tokenId: string; size: number; avgPrice: number; outcomeLabel?: string; marketQuestion?: string; negRisk?: boolean }) => {
    setSellPosition(position);
    setSellAmount(position.size.toString());
    setSellError(null);
    setSellSuccess(false);
    setSellBestBid(null);
    setSellModalOpen(true);
    
    // Fetch best bid price
    if (clobClient && position.tokenId) {
      setIsLoadingSellBid(true);
      try {
        const book = await clobClient.getOrderBook(position.tokenId);
        if (book && book.bids && book.bids.length > 0) {
          // Sort bids descending and get best (highest) bid
          const sortedBids = [...book.bids].sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
          setSellBestBid(parseFloat(sortedBids[0].price));
        }
      } catch (err) {
        console.warn("[Home] Failed to fetch order book for sell:", err);
      } finally {
        setIsLoadingSellBid(false);
      }
    }
  }, [clobClient]);

  // Handler to execute sell
  const handleExecuteSell = useCallback(async () => {
    if (!sellPosition || !sellAmount || !submitOrder) return;
    
    const shareAmount = parseFloat(sellAmount);
    if (isNaN(shareAmount) || shareAmount <= 0) {
      setSellError("Please enter a valid amount");
      return;
    }
    if (shareAmount > sellPosition.size) {
      setSellError(`You only have ${sellPosition.size.toFixed(2)} shares`);
      return;
    }

    setSellError(null);
    setSellSuccess(false);
    setIsSelling(true);

    try {
      const result = await submitOrder({
        tokenId: sellPosition.tokenId,
        side: "SELL",
        size: shareAmount,
        negRisk: sellPosition.negRisk,
        isMarketOrder: true,
      });

      if (result.success) {
        setSellSuccess(true);
        showToast("Position sold successfully!", "success");
        // Refresh positions after successful sell
        if (safeAddress) {
          fetchPositions(safeAddress).then(setUserPositions);
        }
        // Close modal after short delay to show success
        setTimeout(() => {
          setSellModalOpen(false);
          setSellPosition(null);
        }, 1500);
      } else {
        setSellError(result.error || "Failed to sell position");
      }
    } catch (err) {
      setSellError(err instanceof Error ? err.message : "Sell failed");
    } finally {
      setIsSelling(false);
    }
  }, [sellPosition, sellAmount, submitOrder, safeAddress, showToast]);

  const handleConfirmBet = async (stake: number, direction: "yes" | "no", effectiveOdds: number, executionPrice: number, originalStake?: number): Promise<{ success: boolean; error?: string; orderId?: string }> => {
    if (!selectedBet) {
      return { success: false, error: "No bet selected" };
    }
    
    const tokenId = direction === "yes" 
      ? selectedBet.yesTokenId
      : selectedBet.noTokenId;
    
    // Detailed debug logging for comparing working vs non-working bets
    console.log("=== BET SUBMISSION DEBUG ===");
    console.log("[ConfirmBet] Market Type:", selectedBet.marketType);
    console.log("[ConfirmBet] Is Soccer 3-Way:", selectedBet.isSoccer3Way);
    console.log("[ConfirmBet] NegRisk:", selectedBet.negRisk);
    console.log("[ConfirmBet] Market Title:", selectedBet.marketTitle);
    console.log("[ConfirmBet] Outcome Label:", selectedBet.outcomeLabel);
    console.log("[ConfirmBet] Direction:", direction);
    console.log("[ConfirmBet] yesTokenId:", selectedBet.yesTokenId);
    console.log("[ConfirmBet] noTokenId:", selectedBet.noTokenId);
    console.log("[ConfirmBet] Selected tokenId:", tokenId);
    console.log("[ConfirmBet] Stake (effective):", stake, "Original Stake:", originalStake, "Execution Price:", executionPrice);
    console.log("============================");
    
    if (!tokenId) {
      return { success: false, error: `No token ID for ${direction} direction - market data may be incomplete` };
    }
    
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
        originalStake: originalStake || stake, // For fee calculation based on user's entered amount
      });
      
      const orderResult = result as { 
        success: boolean;
        orderId?: string; 
        error?: string;
      };
      
      if (orderResult?.success) {
        return { success: true, orderId: orderResult?.orderId };
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

  // Memoized getOrderBook function to prevent infinite re-renders in BetSlip
  // This must be stable across renders to avoid triggering BetSlip's useEffect repeatedly
  const getOrderBook = useCallback(async (tokenId: string) => {
    if (!clobClient) return null;
    
    try {
      console.log("[OrderBook] Fetching for token:", tokenId);
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
  }, [clobClient]);

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
    <div className="min-h-screen bg-hud-grid bg-[size:30px_30px] font-sans selection:bg-wild-brand selection:text-black text-sm overflow-hidden" style={{ backgroundColor: 'var(--header-bg, #09090b)' }}>
      <div className="relative z-10 min-h-dvh h-dvh flex flex-col max-w-[430px] mx-auto border-x border-[var(--border-primary)]/50 shadow-2xl pb-safe" style={{ backgroundColor: 'var(--header-bg, #09090b)', opacity: 0.95 }}>
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
              onSellPosition={handleOpenSellModal}
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
              submitOrder={submitOrder}
              clobClient={clobClient}
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
          getOrderBook={clobClient ? getOrderBook : undefined}
          showFeeInUI={showFeeInUI}
          pointsName={pointsName}
          pointsEnabled={pointsEnabled}
        />
      )}

      <ToastContainer />

      {/* Sell Position Panel - BetSlip Style (for PredictView) */}
      {sellModalOpen && sellPosition && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-[430px] bg-[var(--card-bg)] border-t border-wild-gold/50 rounded-t-xl p-4 animate-slide-up">
            {/* Header */}
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1">
                  <DollarSign className="w-3 h-3 text-wild-gold" />
                  Sell Position
                </p>
                <h3 className="font-bold text-[var(--text-primary)] text-lg">
                  {sellPosition.outcomeLabel || "Yes"}
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">{sellPosition.marketQuestion || "Market Position"}</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  You have: <span className="text-[var(--text-primary)] font-mono">{sellPosition.size.toFixed(2)} shares</span>
                </p>
              </div>
              <button
                onClick={() => setSellModalOpen(false)}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1"
                disabled={isSelling}
                data-testid="button-close-predict-sell"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Cost Basis & Best Bid Section */}
              <div className="bg-[var(--card-bg-elevated)]/50 rounded-lg p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-[var(--text-secondary)]">Amount spent</span>
                  <span className="text-sm font-mono text-[var(--text-primary)]">
                    ${(sellPosition.size * sellPosition.avgPrice).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-[var(--text-secondary)]">Avg cost / Breakeven</span>
                  <span className="text-sm font-mono text-[var(--text-secondary)]">
                    ${sellPosition.avgPrice.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-[var(--text-secondary)]">Best bid (sell now)</span>
                  {isLoadingSellBid ? (
                    <span className="text-sm font-mono text-[var(--text-muted)] flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Loading...
                    </span>
                  ) : sellBestBid ? (
                    <span className={cn("text-sm font-mono font-semibold",
                      sellBestBid >= sellPosition.avgPrice ? "text-wild-scout" : "text-wild-brand"
                    )}>
                      ${sellBestBid.toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-sm font-mono text-[var(--text-muted)]">—</span>
                  )}
                </div>
              </div>

              {/* Shares Input with Best Bid Display */}
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="text-xs text-[var(--text-muted)] mb-1 block">Shares to sell</label>
                  <Input
                    type="number"
                    value={sellAmount}
                    onChange={(e) => setSellAmount(e.target.value)}
                    placeholder="0.00"
                    className="bg-[var(--card-bg-elevated)] border-[var(--border-secondary)] text-[var(--text-primary)] text-lg font-mono h-12"
                    min="0"
                    max={sellPosition.size}
                    step="0.01"
                    disabled={isSelling}
                    data-testid="input-predict-sell-amount"
                  />
                </div>
                <div className="text-right">
                  <p className="text-xs text-[var(--text-muted)]">Best Bid</p>
                  <p className={cn("text-2xl font-black font-mono",
                    sellBestBid && sellBestBid >= sellPosition.avgPrice ? "text-wild-scout" : "text-wild-gold"
                  )}>
                    {sellBestBid ? `$${sellBestBid.toFixed(2)}` : "—"}
                  </p>
                </div>
              </div>

              {/* Percentage Quick Select Buttons */}
              <div className="flex gap-2">
                {[25, 50, 75].map((pct) => (
                  <button
                    key={pct}
                    onClick={() => setSellAmount((sellPosition.size * pct / 100).toFixed(2))}
                    className={cn(
                      "flex-1 py-2 text-sm font-mono rounded transition-colors",
                      sellAmount === (sellPosition.size * pct / 100).toFixed(2)
                        ? "bg-wild-gold/20 text-wild-gold border border-wild-gold/30"
                        : "bg-[var(--card-bg-elevated)] hover:bg-[var(--card-bg-hover)] text-[var(--text-secondary)]"
                    )}
                    disabled={isSelling}
                    data-testid={`button-predict-sell-${pct}pct`}
                  >
                    {pct}%
                  </button>
                ))}
                <button
                  onClick={() => setSellAmount(sellPosition.size.toFixed(2))}
                  className={cn(
                    "flex-1 py-2 text-sm font-bold rounded transition-colors border",
                    sellAmount === sellPosition.size.toFixed(2)
                      ? "bg-wild-gold/30 text-wild-gold border-wild-gold/50"
                      : "bg-wild-gold/20 hover:bg-wild-gold/30 text-wild-gold border-wild-gold/30"
                  )}
                  disabled={isSelling}
                  data-testid="button-predict-sell-100pct"
                >
                  MAX
                </button>
              </div>

              {/* Estimated Return Summary */}
              {sellAmount && parseFloat(sellAmount) > 0 && (
                <div className="bg-[var(--card-bg-elevated)]/50 rounded-lg p-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--text-secondary)]">Cost basis</span>
                    <span className="font-mono text-[var(--text-secondary)]">
                      ${(parseFloat(sellAmount) * sellPosition.avgPrice).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--text-secondary)]">Estimated return</span>
                    <span className="font-mono font-bold text-wild-gold">
                      ~${(parseFloat(sellAmount) * (sellBestBid || sellPosition.avgPrice)).toFixed(2)}
                    </span>
                  </div>
                  {sellBestBid && (
                    <div className="flex justify-between text-sm border-t border-[var(--border-secondary)] pt-2 mt-2">
                      <span className="text-[var(--text-secondary)]">Estimated P&L</span>
                      <span className={cn("font-mono font-semibold",
                        (sellBestBid - sellPosition.avgPrice) >= 0 ? "text-wild-scout" : "text-wild-brand"
                      )}>
                        {(sellBestBid - sellPosition.avgPrice) >= 0 ? "+" : ""}
                        ${((parseFloat(sellAmount) * sellBestBid) - (parseFloat(sellAmount) * sellPosition.avgPrice)).toFixed(2)}
                      </span>
                    </div>
                  )}
                  <p className="text-[10px] text-[var(--text-muted)]">
                    Final value depends on market liquidity
                  </p>
                </div>
              )}

              {/* Error Message */}
              {sellError && (
                <div className="flex items-center gap-2 text-wild-brand text-sm bg-wild-brand/10 rounded p-2">
                  <AlertTriangle className="w-4 h-4" />
                  <span>{sellError}</span>
                </div>
              )}

              {/* Success Message */}
              {sellSuccess && (
                <div className="flex items-center gap-2 text-wild-scout text-sm bg-wild-scout/10 rounded p-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Position sold successfully!</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setSellModalOpen(false)}
                  className="flex-1 border-[var(--border-secondary)]"
                  disabled={isSelling}
                  data-testid="button-cancel-predict-sell"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleExecuteSell}
                  disabled={isSelling || sellSuccess || !sellAmount || parseFloat(sellAmount) <= 0}
                  size="lg"
                  className="flex-1 bg-wild-gold text-zinc-950 font-bold text-lg"
                  data-testid="button-confirm-predict-sell"
                >
                  {isSelling ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Selling...
                    </>
                  ) : (
                    `Sell · $${(parseFloat(sellAmount || "0") * (sellBestBid || sellPosition.avgPrice)).toFixed(2)}`
                  )}
                </Button>
              </div>

              <p className="text-[10px] text-[var(--text-muted)] text-center">
                Orders submitted to Polymarket CLOB at best available price.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
