import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Award, Activity, Wallet, History, Package, Coins, ArrowDownToLine, ArrowUpFromLine, RefreshCw, CheckCircle2, Copy, Check, HelpCircle, ChevronDown, ChevronUp, Loader2, ExternalLink, DollarSign, X, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { fetchPositions, fetchActivity, type PolymarketPosition, type PolymarketActivity } from "@/lib/polymarketOrder";
import { usePolymarketClient } from "@/hooks/usePolymarketClient";
import { useBridgeApi, getAddressTypeForChain, type SupportedAsset, type Transaction as BridgeTransaction } from "@/hooks/useBridgeApi";
import { DepositInstructions } from "@/components/terminal/DepositInstructions";
import { useTheme } from "@/hooks/useTheme";
import type { Wallet as WalletType, Bet, Trade } from "@shared/schema";

interface DashboardViewProps {
  wallet: WalletType | null;
  bets: Bet[];
  trades: Trade[];
  isLoading: boolean;
  walletAddress?: string;
  safeAddress?: string | null;
  isSafeDeployed?: boolean;
  submitOrder?: (params: {
    tokenId: string;
    side: "BUY" | "SELL";
    size: number;
    negRisk?: boolean;
    isMarketOrder?: boolean;
  }) => Promise<{ success: boolean; error?: string }>;
  clobClient?: any;
}

export function DashboardView({ wallet, bets, trades, isLoading, walletAddress, safeAddress, isSafeDeployed, submitOrder, clobClient }: DashboardViewProps) {
  const { pointsName, pointsEnabled } = useTheme();
  const [positions, setPositions] = useState<PolymarketPosition[]>([]);
  const [activity, setActivity] = useState<PolymarketActivity[]>([]);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawTo, setWithdrawTo] = useState("");
  const [copied, setCopied] = useState(false);
  const [showDepositInstructions, setShowDepositInstructions] = useState(false);
  
  const [depositChain, setDepositChain] = useState<string>("polygon");
  const [depositToken, setDepositToken] = useState<string>("");
  const [bridgeDepositAddresses, setBridgeDepositAddresses] = useState<{ evm: string; svm: string; btc: string } | null>(null);
  const [isLoadingDepositAddresses, setIsLoadingDepositAddresses] = useState(false);
  
  const [withdrawChain, setWithdrawChain] = useState<string>("polygon");
  const [withdrawToken, setWithdrawToken] = useState<string>("");
  const [withdrawQuote, setWithdrawQuote] = useState<{ fee: string; output: string } | null>(null);
  const [isGettingQuote, setIsGettingQuote] = useState(false);
  
  const [bridgeTransactions, setBridgeTransactions] = useState<BridgeTransaction[]>([]);
  const [bridgeTransactionsLoading, setBridgeTransactionsLoading] = useState(false);
  
  // Sell modal state
  const [sellModalOpen, setSellModalOpen] = useState(false);
  const [sellPosition, setSellPosition] = useState<PolymarketPosition | null>(null);
  const [sellAmount, setSellAmount] = useState("");
  const [sellError, setSellError] = useState<string | null>(null);
  const [sellSuccess, setSellSuccess] = useState(false);
  const [isSelling, setIsSelling] = useState(false);
  
  const { 
    withdrawUSDC, 
    redeemPositions,
    batchRedeemPositions,
    getOrderBook,
  } = usePolymarketClient();
  
  // Best bid state for sell modal
  const [bestBid, setBestBid] = useState<number | null>(null);
  const [isLoadingBid, setIsLoadingBid] = useState(false);
  
  const { 
    supportedAssets, 
    isLoadingAssets, 
    getChainOptions,
    createDeposit,
    createWithdrawal,
    getQuote,
    getBridgeHistory,
  } = useBridgeApi();
  
  const chainOptions = getChainOptions();
  
  const getTokensForChain = (chainId: string): SupportedAsset[] => {
    return supportedAssets.filter(a => a.chainId === chainId);
  };
  
  const fetchBridgeDepositAddresses = async () => {
    if (!safeAddress || bridgeDepositAddresses) return;
    
    setIsLoadingDepositAddresses(true);
    try {
      const result = await createDeposit({ address: safeAddress });
      if (result?.address) {
        setBridgeDepositAddresses(result.address);
        console.log("[Bridge] Deposit addresses loaded:", result.address);
      }
    } finally {
      setIsLoadingDepositAddresses(false);
    }
  };
  
  const handleDepositChainChange = async (chain: string) => {
    setDepositChain(chain);
    setDepositToken("");
    
    if (chain === "polygon") {
      return;
    }
    
    if (!bridgeDepositAddresses && safeAddress) {
      fetchBridgeDepositAddresses();
    }
    
    const tokens = getTokensForChain(chain);
    if (tokens.length > 0) {
      const usdcToken = tokens.find(t => t.token.symbol === "USDC") || tokens[0];
      setDepositToken(usdcToken.token.address);
    }
  };
  
  const getBridgeDepositAddress = (): string | null => {
    if (!bridgeDepositAddresses) return null;
    
    // Use the proper address type based on chain mapping from Bridge API
    const addressType = getAddressTypeForChain(depositChain);
    if (!addressType) {
      // Chain not supported - don't show an address
      return null;
    }
    
    return bridgeDepositAddresses[addressType];
  };
  
  const handleWithdrawChainChange = async (chain: string) => {
    setWithdrawChain(chain);
    setWithdrawQuote(null);
    setWithdrawToken("");
    
    if (chain === "polygon") {
      return;
    }
    
    const tokens = getTokensForChain(chain);
    if (tokens.length > 0) {
      const usdcToken = tokens.find(t => t.token.symbol === "USDC") || tokens[0];
      setWithdrawToken(usdcToken.token.address);
    }
  };
  
  const handleGetWithdrawQuote = async () => {
    if (!withdrawAmount || !withdrawTo || !withdrawToken || withdrawChain === "polygon") return;
    
    setIsGettingQuote(true);
    try {
      // USDC.e on Polygon has 6 decimals
      const amountInBaseUnits = (parseFloat(withdrawAmount) * 1e6).toString();
      const result = await getQuote({
        fromChainId: "137",  // Polygon - source chain for withdrawals
        fromTokenAddress: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",  // USDC.e on Polygon
        toChainId: withdrawChain,
        toTokenAddress: withdrawToken,  // Bridge API requires toTokenAddress
        fromAmountBaseUnit: amountInBaseUnits,
        recipientAddress: withdrawTo,
      });
      if (result) {
        setWithdrawQuote({ fee: result.fee, output: result.estimatedOutput });
      }
    } finally {
      setIsGettingQuote(false);
    }
  };
  
  // Fetch positions using Safe address (where Polymarket positions live)
  useEffect(() => {
    const positionAddress = safeAddress || walletAddress;
    if (positionAddress) {
      setPositionsLoading(true);
      fetchPositions(positionAddress)
        .then(setPositions)
        .finally(() => setPositionsLoading(false));
    }
  }, [safeAddress, walletAddress]);

  // Fetch activity separately using walletAddress (activity is indexed by user profile)
  useEffect(() => {
    if (walletAddress) {
      setActivityLoading(true);
      fetchActivity(walletAddress)
        .then(setActivity)
        .finally(() => setActivityLoading(false));
    }
  }, [walletAddress]);

  useEffect(() => {
    if (safeAddress) {
      setBridgeTransactionsLoading(true);
      getBridgeHistory(safeAddress)
        .then(status => {
          if (status?.transactions) {
            setBridgeTransactions(status.transactions);
          }
        })
        .finally(() => setBridgeTransactionsLoading(false));
    }
  }, [safeAddress, getBridgeHistory]);

  const refreshPositions = async () => {
    const positionAddress = safeAddress || walletAddress;
    const activityAddress = walletAddress;

    if (positionAddress || activityAddress) {
      setPositionsLoading(true);
      setActivityLoading(true);

      const [pos, act] = await Promise.all([
        positionAddress ? fetchPositions(positionAddress) : Promise.resolve(positions),
        activityAddress ? fetchActivity(activityAddress) : Promise.resolve(activity),
      ]);

      setPositions(pos);
      setActivity(act);
      setPositionsLoading(false);
      setActivityLoading(false);
    }
    
    if (safeAddress) {
      setBridgeTransactionsLoading(true);
      const status = await getBridgeHistory(safeAddress);
      if (status?.transactions) {
        setBridgeTransactions(status.transactions);
      }
      setBridgeTransactionsLoading(false);
    }
  };

  const [claimingAll, setClaimingAll] = useState(false);

  const redeemMutation = useMutation({
    mutationFn: async ({ conditionId }: { conditionId: string }) => {
      if (!walletAddress) throw new Error("No wallet connected");
      const result = await redeemPositions(conditionId, [1, 2]);
      if (!result.success) {
        throw new Error(result.error || "Redeem failed");
      }
      return result;
    },
    onSuccess: () => {
      refreshPositions();
    },
  });

  const handleClaimAll = async () => {
    const claimable = positions.filter(p => p.status === "claimable" && p.conditionId);
    if (claimable.length === 0) return;
    
    setClaimingAll(true);
    try {
      // Filter to positions with valid conditionIds
      const redeemablePositions = claimable.filter(p => p.conditionId);
      
      // Debug: Log positions being redeemed
      console.log("[ClaimAll] Claimable positions:", redeemablePositions.map(p => ({
        question: p.marketQuestion?.substring(0, 40),
        conditionId: p.conditionId?.substring(0, 10),
        tokenId: p.tokenId?.substring(0, 20),
        negRisk: p.negRisk,
        outcome: p.outcomeLabel,
        size: p.size
      })));
      
      if (redeemablePositions.length > 0) {
        // Pass positions directly - batchRedeemPositions uses the properties as-is
        const result = await batchRedeemPositions(redeemablePositions);
        if (!result.success) {
          console.error("Batch claim failed:", result.error);
        }
      }
      await refreshPositions();
    } catch (error) {
      console.error("Claim all failed:", error);
    } finally {
      setClaimingAll(false);
    }
  };

  const withdrawMutation = useMutation({
    mutationFn: async ({ 
      amount, 
      toAddress,
      chain,
      tokenAddress 
    }: { 
      amount: number; 
      toAddress: string;
      chain: string;
      tokenAddress: string;
    }) => {
      if (!walletAddress) throw new Error("No wallet connected");
      
      if (chain === "polygon") {
        const result = await withdrawUSDC(amount, toAddress);
        if (!result.success) {
          throw new Error(result.error || "Withdrawal failed");
        }
        return result;
      } else {
        if (!tokenAddress) {
          throw new Error("Please select a token to receive");
        }
        if (!safeAddress) {
          throw new Error("Safe wallet address not available");
        }
        
        // Step 1: Get the bridge deposit address for this withdrawal
        const bridgeResult = await createWithdrawal({
          address: safeAddress,          // Source Polymarket wallet on Polygon
          toChainId: chain,              // Destination chain
          toTokenAddress: tokenAddress,  // Destination token
          recipientAddr: toAddress,      // Where to receive funds
        });
        
        if (!bridgeResult || !bridgeResult.address?.evm) {
          throw new Error("Failed to get bridge deposit address");
        }
        
        const bridgeDepositAddress = bridgeResult.address.evm;
        console.log("[Bridge] Got deposit address:", bridgeDepositAddress);
        console.log("[Bridge] Sending", amount, "USDC.e to bridge...");
        
        // Step 2: Automatically send USDC.e from Safe wallet to the bridge address
        const transferResult = await withdrawUSDC(amount, bridgeDepositAddress);
        
        if (!transferResult.success) {
          throw new Error(transferResult.error || "Failed to send funds to bridge");
        }
        
        console.log("[Bridge] Transfer to bridge successful:", transferResult.txHash);
        
        // Return success - the bridge will now process and send to destination
        return { 
          success: true, 
          txHash: transferResult.txHash,
          bridgeNote: `Funds sent to bridge. The bridge will deliver ${tokenAddress === "native" ? "native tokens" : "tokens"} to ${toAddress} on the destination chain.`,
        };
      }
    },
  });

  const formatBalance = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const formatActivityTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  // Handler to open sell modal
  const handleOpenSellModal = async (position: PolymarketPosition) => {
    setSellPosition(position);
    setSellAmount(position.size.toString()); // Default to full position
    setSellError(null);
    setSellSuccess(false);
    setBestBid(null);
    setSellModalOpen(true);
    
    // Fetch best bid price from order book
    if (getOrderBook && position.tokenId) {
      setIsLoadingBid(true);
      try {
        const book = await getOrderBook(position.tokenId);
        if (book && book.bestBid) {
          setBestBid(book.bestBid);
        }
      } catch (err) {
        console.warn("[DashboardView] Failed to fetch order book for sell:", err);
      } finally {
        setIsLoadingBid(false);
      }
    }
  };

  // Handler to execute sell - uses submitOrder with size parameter (shares, not USDC)
  const handleExecuteSell = async () => {
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
      // Use submitOrder with size (number of shares) instead of amount (USDC value)
      const result = await submitOrder({
        tokenId: sellPosition.tokenId,
        side: "SELL",
        size: shareAmount,
        negRisk: sellPosition.negRisk,
        isMarketOrder: true,
      });

      if (result.success) {
        setSellSuccess(true);
        // Refresh positions after successful sell
        if (safeAddress) {
          fetchPositions(safeAddress).then(setPositions);
          fetchActivity(safeAddress).then(setActivity);
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
  };

  // Filter positions by status
  const openPositions = positions.filter(p => p.status === "open" || p.status === "filled");
  const claimablePositions = positions.filter(p => p.status === "claimable");
  const pendingPositions = positions.filter(p => p.status === "pending");
  const lostPositions = positions.filter(p => p.status === "lost");
  
  // Aliases for stats calculation
  const wonPositions = claimablePositions;
  const pendingWinPositions = pendingPositions;
  const openActivePositions = openPositions;
  
  // ===== Activity-based P&L Calculation =====
  // P&L = Total Claimed + Total Sold - Total Bought
  // This uses Activity data as the source of truth
  
  // Calculate totals from Activity API
  const buyActivity = activity.filter(act => act.type === "TRADE" && act.side === "BUY");
  const sellActivity = activity.filter(act => act.type === "TRADE" && act.side === "SELL");
  const redeemActivity = activity.filter(act => act.type === "REDEEM");
  
  const totalBought = buyActivity.reduce((sum, act) => sum + act.usdcSize, 0);
  const totalSold = sellActivity.reduce((sum, act) => sum + act.usdcSize, 0);
  const totalClaimed = redeemActivity.reduce((sum, act) => sum + act.usdcSize, 0);
  
  // P&L = What you got back (claimed + sold) - What you spent (bought)
  const totalPnL = totalClaimed + totalSold - totalBought;
  
  // ===== Won/Total Ratio =====
  // Won/Total = Claimed count / Bought count (from Activity)
  const buyCount = buyActivity.length;
  const claimedCount = redeemActivity.length;
  const totalWonCount = claimedCount;
  const totalResolvedPositions = buyCount; // Total bets made
  // Resolved tab only shows actionable positions (pending wins and claimable wins)
  const resolvedPositions = [...claimablePositions, ...pendingPositions];
  const totalClaimable = claimablePositions.reduce((sum, p) => sum + p.size, 0);
  
  // Create a combined and sorted history array
  // Activity items have timestamps - try to match lost positions to activity by conditionId
  type HistoryItem = 
    | { type: "lost"; position: typeof lostPositions[0]; timestamp: number }
    | { type: "activity"; activity: typeof activity[0]; timestamp: number };
  
  // Build a map of conditionId -> latest activity timestamp for lost position matching
  const conditionTimestamps = new Map<string, number>();
  for (const act of activity) {
    if (act.conditionId) {
      const existing = conditionTimestamps.get(act.conditionId);
      if (!existing || act.timestamp > existing) {
        conditionTimestamps.set(act.conditionId, act.timestamp);
      }
    }
  }
  
  const historyItems: HistoryItem[] = [
    // Lost positions - try to get timestamp from matching activity, fallback to very old date
    ...lostPositions.map(pos => ({
      type: "lost" as const,
      position: pos,
      timestamp: pos.conditionId ? (conditionTimestamps.get(pos.conditionId) || 0) : 0,
    })),
    // Activity items have timestamps directly
    ...activity.map(act => ({
      type: "activity" as const,
      activity: act,
      timestamp: act.timestamp,
    })),
  ].sort((a, b) => b.timestamp - a.timestamp); // Sort newest first
  
  // History tab count includes lost positions + activity
  const historyCount = historyItems.length;
  
  // Determine default tab based on what has content
  const getDefaultTab = () => {
    if (resolvedPositions.length > 0) return "resolved";
    if (openPositions.length > 0) return "open";
    if (historyCount > 0) return "history";
    return "resolved"; // Default to resolved even if empty
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full animate-fade-in p-3 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-[var(--card-bg)] border border-[var(--border-primary)] p-4 rounded-md">
              <div className="w-8 h-8 bg-[var(--card-bg)] rounded animate-pulse-skeleton mb-3" />
              <div className="w-16 h-3 bg-[var(--card-bg)] rounded animate-pulse-skeleton mb-2" />
              <div className="w-24 h-6 bg-[var(--card-bg)] rounded animate-pulse-skeleton" />
            </div>
          ))}
        </div>
        <div className="bg-[var(--card-bg)] border border-[var(--border-primary)] p-4 rounded-md space-y-3">
          <div className="w-32 h-4 bg-[var(--card-bg)] rounded animate-pulse-skeleton" />
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 bg-[var(--card-bg)] rounded animate-pulse-skeleton" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full animate-fade-in overflow-y-auto">
      <div className="shrink-0 bg-[var(--page-bg)] border-b border-[var(--border-primary)] p-3 z-20">
        <h2 className="text-xs font-bold text-[var(--text-secondary)] tracking-wider">DASHBOARD</h2>
      </div>

      <div className="p-3 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[var(--card-bg)] border border-[var(--border-primary)] p-4 rounded-md">
            <div className="w-8 h-8 rounded-full bg-dash-action/20 flex items-center justify-center mb-3">
              <Wallet className="w-4 h-4 text-dash-action" />
            </div>
            <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase mb-1">Total Value</div>
            <div className="text-xl font-black font-mono text-[var(--text-primary)]" data-testid="text-total-value">
              ${formatBalance(wallet?.totalValue || 0)}
            </div>
          </div>

          <div className="bg-[var(--card-bg)] border border-[var(--border-primary)] p-4 rounded-md">
            <div className="w-8 h-8 rounded-full bg-dash-accent/20 flex items-center justify-center mb-3">
              <Activity className="w-4 h-4 text-dash-accent" />
            </div>
            <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase mb-1">P&L</div>
            <div
              className={cn(
                "text-xl font-black font-mono flex items-center gap-1",
                totalPnL >= 0 ? "text-dash-positive" : "text-dash-negative"
              )}
              data-testid="text-pnl"
            >
              {totalPnL >= 0 ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
              ${formatBalance(Math.abs(totalPnL))}
            </div>
          </div>

          <div className="bg-[var(--card-bg)] border border-[var(--border-primary)] p-4 rounded-md">
            <div className="w-8 h-8 rounded-full bg-dash-positive/20 flex items-center justify-center mb-3">
              <Award className="w-4 h-4 text-dash-positive" />
            </div>
            <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase mb-1">Won / Total</div>
            <div className="text-xl font-black font-mono text-[var(--text-primary)]" data-testid="text-win-ratio">
              {totalWonCount} / {totalResolvedPositions}
            </div>
          </div>

          <div className="bg-[var(--card-bg)] border border-[var(--border-primary)] p-4 rounded-md">
            <div className="w-8 h-8 rounded-full bg-dash-negative/20 flex items-center justify-center mb-3">
              <History className="w-4 h-4 text-dash-negative" />
            </div>
            <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase mb-1">Open Bets</div>
            <div className="text-xl font-black font-mono text-[var(--text-primary)]" data-testid="text-pending">
              {openActivePositions.length}
            </div>
          </div>
        </div>

        <div className="bg-[var(--card-bg)] border border-[var(--border-primary)] rounded-md overflow-hidden">
          <div className="p-3 border-b border-[var(--border-primary)]">
            <h3 className="text-xs font-bold text-[var(--text-secondary)] tracking-wider">BALANCES</h3>
          </div>
          <div className="divide-y divide-[var(--border-primary)]/50">
            <div className="flex justify-between items-center p-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-[10px] font-bold text-[var(--text-primary)]">
                  $
                </div>
                <div>
                  <div className="text-sm font-medium text-[var(--text-primary)]">USDC</div>
                  <div className="text-[10px] text-[var(--text-muted)] font-mono">Polygon</div>
                </div>
              </div>
              <span className="font-mono font-bold text-[var(--text-primary)]" data-testid="text-dash-usdc">
                ${formatBalance(wallet?.usdcBalance || 0)}
              </span>
            </div>
            {pointsEnabled && (
              <div className="flex justify-between items-center p-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-dash-positive flex items-center justify-center text-[10px] font-bold text-zinc-950">
                    W
                  </div>
                  <div>
                    <div className="text-sm font-medium text-[var(--text-primary)]">{pointsName}</div>
                    <div className="text-[10px] text-[var(--text-muted)] font-mono">{pointsName} Points</div>
                  </div>
                </div>
                <span className="font-mono font-bold text-[var(--text-primary)]" data-testid="text-dash-wild">
                  {formatBalance(wallet?.wildBalance || 0)}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="bg-[var(--card-bg)] border border-[var(--border-primary)] rounded-md overflow-hidden">
          <div className="p-3 border-b border-[var(--border-primary)] flex items-center gap-2">
            <ArrowUpFromLine className="w-4 h-4 text-dash-accent" />
            <h3 className="text-xs font-bold text-[var(--text-secondary)] tracking-wider">DEPOSIT</h3>
          </div>
          <div className="p-3 space-y-3">
            {isSafeDeployed && safeAddress ? (
              <>
                <div>
                  <label className="text-[10px] text-[var(--text-muted)] block mb-1">Deposit From</label>
                  <Select value={depositChain} onValueChange={handleDepositChainChange}>
                    <SelectTrigger className="w-full bg-[var(--page-bg)] border-[var(--border-primary)] text-sm" data-testid="select-deposit-chain">
                      <SelectValue placeholder="Select chain" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="polygon">
                        <span className="flex items-center gap-2">
                          <span className="w-4 h-4 rounded-full bg-purple-500 flex items-center justify-center text-[8px] font-bold text-[var(--text-primary)]">P</span>
                          Polygon (Native)
                        </span>
                      </SelectItem>
                      {chainOptions.map((chain) => (
                        <SelectItem key={chain.chainId} value={chain.chainId}>
                          <span className="flex items-center gap-2">
                            <span className="w-4 h-4 rounded-full bg-[var(--card-bg-hover)] flex items-center justify-center text-[8px] font-bold text-[var(--text-primary)]">
                              {chain.chainName.charAt(0)}
                            </span>
                            {chain.chainName}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {depositChain !== "polygon" && (
                  <div>
                    <label className="text-[10px] text-[var(--text-muted)] block mb-1">Token</label>
                    <Select value={depositToken} onValueChange={setDepositToken}>
                      <SelectTrigger className="w-full bg-[var(--page-bg)] border-[var(--border-primary)] text-sm" data-testid="select-deposit-token">
                        <SelectValue placeholder="Select token" />
                      </SelectTrigger>
                      <SelectContent>
                        {getTokensForChain(depositChain).map((asset) => (
                          <SelectItem key={asset.token.address} value={asset.token.address}>
                            <span className="flex flex-col">
                              <span>{asset.token.symbol} - {asset.token.name}</span>
                              <span className="text-[9px] text-[var(--text-muted)] font-mono">
                                {asset.token.address.slice(0, 10)}...{asset.token.address.slice(-6)}
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-rose-400 mt-1 font-medium">
                      Min: ${getTokensForChain(depositChain).find(t => t.token.address === depositToken)?.minCheckoutUsd || 7} USD
                    </p>
                  </div>
                )}
                
                {depositChain === "polygon" ? (
                  <>
                    <div className="flex items-center justify-between bg-[var(--page-bg)] rounded p-2 border border-[var(--border-primary)]">
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="text-[10px] text-[var(--text-muted)] mb-0.5">Deposit Address (Polygon)</span>
                        <span className="text-[11px] font-mono text-[var(--text-secondary)] truncate" data-testid="text-deposit-address">
                          {safeAddress}
                        </span>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="shrink-0 w-7 h-7"
                        onClick={() => {
                          navigator.clipboard.writeText(safeAddress);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }}
                        data-testid="button-copy-address"
                      >
                        {copied ? (
                          <Check className="w-3 h-3 text-dash-positive" />
                        ) : (
                          <Copy className="w-3 h-3 text-[var(--text-secondary)]" />
                        )}
                      </Button>
                    </div>
                    <p className="text-[10px] text-wild-warning">
                      Send USDC.e only. Other tokens will be lost.
                    </p>
                  </>
                ) : isLoadingDepositAddresses ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-dash-accent" />
                    <span className="text-xs text-[var(--text-secondary)] ml-2">Loading deposit address...</span>
                  </div>
                ) : getBridgeDepositAddress() ? (
                  <>
                    <div className="flex items-center justify-between bg-[var(--page-bg)] rounded p-2 border border-[var(--border-primary)]">
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="text-[10px] text-[var(--text-muted)] mb-0.5">Bridge Deposit Address</span>
                        <span className="text-[11px] font-mono text-[var(--text-secondary)] truncate" data-testid="text-bridge-deposit-address">
                          {getBridgeDepositAddress()}
                        </span>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="shrink-0 w-7 h-7"
                        onClick={() => {
                          const addr = getBridgeDepositAddress();
                          if (addr) {
                            navigator.clipboard.writeText(addr);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                          }
                        }}
                        data-testid="button-copy-bridge-address"
                      >
                        {copied ? (
                          <Check className="w-3 h-3 text-dash-positive" />
                        ) : (
                          <Copy className="w-3 h-3 text-[var(--text-secondary)]" />
                        )}
                      </Button>
                    </div>
                    <div className="bg-dash-positive/10 border border-dash-positive/30 rounded p-2">
                      <p className="text-[10px] text-dash-positive">
                        Funds will be automatically bridged to USDC.e on Polygon and credited to your Prediction Wallet.
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-3">
                    <p className="text-xs text-[var(--text-secondary)]">Select a chain to get deposit address</p>
                  </div>
                )}
                
                {depositChain !== "polygon" && (
                  <div className="bg-rose-950/30 border border-rose-500/50 rounded p-2 mb-2">
                    <p className="text-[10px] text-rose-400 font-medium text-center">
                      Deposits below the minimum amount will NOT be credited to your wallet.
                    </p>
                  </div>
                )}
                
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-xs border-[var(--border-secondary)]"
                  onClick={() => setShowDepositInstructions(!showDepositInstructions)}
                  data-testid="button-how-to-deposit"
                >
                  <HelpCircle className="w-3 h-3 mr-1" />
                  How to Deposit
                  {showDepositInstructions ? (
                    <ChevronUp className="w-3 h-3 ml-1" />
                  ) : (
                    <ChevronDown className="w-3 h-3 ml-1" />
                  )}
                </Button>
                {showDepositInstructions && (
                  <div className="mt-3">
                    <DepositInstructions safeAddress={safeAddress} />
                  </div>
                )}
                <p className="text-[10px] text-[var(--text-muted)]">
                  Gasless trading enabled. Deposit USDC.e (Polygon) to start.
                </p>
              </>
            ) : (
              <div className="text-center py-4">
                <p className="text-xs text-[var(--text-secondary)] mb-2">
                  Activate your Prediction Wallet to get a deposit address
                </p>
                <p className="text-[10px] text-[var(--text-muted)]">
                  Open your wallet (top right) and click "Activate Wallet"
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Unified Activity Tabs */}
        <div className="bg-[var(--card-bg)] border border-[var(--border-primary)] rounded-md overflow-hidden">
          <div className="p-3 border-b border-[var(--border-primary)] flex justify-between items-center gap-2">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-dash-accent" />
              <h3 className="text-xs font-bold text-[var(--text-secondary)] tracking-wider">ACTIVITY</h3>
            </div>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={refreshPositions}
              disabled={positionsLoading}
              data-testid="button-refresh-positions"
            >
              <RefreshCw className={cn("w-4 h-4 text-[var(--text-muted)]", positionsLoading && "animate-spin")} />
            </Button>
          </div>
          
          <Tabs defaultValue={getDefaultTab()} className="w-full">
            <TabsList className="w-full justify-start rounded-none border-b border-[var(--border-primary)] bg-transparent h-auto p-0 gap-0 flex-wrap">
              <TabsTrigger 
                value="resolved" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-dash-positive data-[state=active]:bg-transparent data-[state=active]:text-dash-positive px-3 py-2 text-xs"
                data-testid="tab-resolved"
              >
                Resolved
                {resolvedPositions.length > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-dash-positive/20 text-dash-positive">
                    {resolvedPositions.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger 
                value="open" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-dash-accent data-[state=active]:bg-transparent data-[state=active]:text-dash-accent px-3 py-2 text-xs"
                data-testid="tab-open"
              >
                Open
                {openPositions.length > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-dash-accent/20 text-dash-accent">
                    {openPositions.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger 
                value="history" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-[var(--text-secondary)] data-[state=active]:bg-transparent data-[state=active]:text-[var(--text-secondary)] px-3 py-2 text-xs"
                data-testid="tab-history"
              >
                History
                {historyCount > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-[var(--card-bg-hover)] text-[var(--text-secondary)]">
                    {historyCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger 
                value="bridge" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-dash-action data-[state=active]:bg-transparent data-[state=active]:text-dash-action px-3 py-2 text-xs"
                data-testid="tab-bridge"
              >
                Bridge
                {bridgeTransactions.length > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-dash-action/20 text-dash-action">
                    {bridgeTransactions.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            {/* Resolved Tab - Shows actionable positions (pending wins and claimable wins) */}
            <TabsContent value="resolved" className="mt-0">
              {claimablePositions.length > 0 && (
                <div className="p-2 border-b border-[var(--border-primary)] bg-dash-positive/5 flex justify-between items-center gap-2">
                  <span className="text-xs font-mono text-dash-positive">${formatBalance(totalClaimable)} to claim</span>
                  <Button
                    size="sm"
                    variant="default"
                    className="bg-dash-positive border-dash-positive text-zinc-950 text-xs shrink-0"
                    onClick={handleClaimAll}
                    disabled={claimingAll || claimablePositions.length === 0}
                    data-testid="button-claim-all"
                  >
                    {claimingAll ? (
                      <RefreshCw className="w-3 h-3 animate-spin mr-1" />
                    ) : (
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                    )}
                    Claim All
                  </Button>
                </div>
              )}
              <div className="divide-y divide-[var(--border-primary)]/50">
                {resolvedPositions.length === 0 ? (
                  <div className="p-4 text-center">
                    <Coins className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-2" />
                    <p className="text-xs text-[var(--text-muted)]">No resolved positions</p>
                  </div>
                ) : (
                  resolvedPositions.map((pos, i) => {
                    const isClaimable = pos.status === "claimable";
                    const isPending = pos.status === "pending";
                    const isWin = isClaimable || isPending;
                    return (
                      <div key={`${pos.tokenId}-${i}`} className="p-3" data-testid={`resolved-${i}`}>
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start gap-2">
                              <span className={cn(
                                "px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0",
                                isClaimable ? "bg-dash-positive/20 text-dash-positive" 
                                  : isPending ? "bg-dash-action/20 text-dash-action"
                                  : "bg-dash-negative/20 text-dash-negative"
                              )}>
                                {isClaimable ? "WON" : isPending ? "PENDING" : "LOST"}
                              </span>
                              <div className="text-xs text-[var(--text-primary)] leading-tight">{pos.marketQuestion || "Resolved Position"}</div>
                            </div>
                            <div className="text-[10px] font-mono text-[var(--text-muted)] mt-1 ml-10">{pos.outcomeLabel || pos.side}</div>
                          </div>
                          <div className="text-right shrink-0 ml-2">
                            {isWin ? (
                              <div className="text-sm font-mono text-dash-positive font-bold">${pos.size.toFixed(2)}</div>
                            ) : (
                              <div className="text-sm font-mono text-[var(--text-muted)]">-${(pos.size * pos.avgPrice).toFixed(2)}</div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </TabsContent>

            {/* Open Positions Tab */}
            <TabsContent value="open" className="mt-0">
              <div className="divide-y divide-[var(--border-primary)]/50">
                {openPositions.length === 0 ? (
                  <div className="p-4 text-center">
                    <Package className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-2" />
                    <p className="text-xs text-[var(--text-muted)]">No open positions</p>
                  </div>
                ) : (
                  openPositions.map((pos, i) => (
                    <div key={`${pos.tokenId}-${i}`} className="p-3" data-testid={`position-${i}`}>
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-[var(--text-primary)] leading-tight">{pos.marketQuestion || "Unknown Market"}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-mono text-[var(--text-muted)]">{pos.outcomeLabel || pos.side}</span>
                            <span className="text-[10px] font-mono text-dash-accent">@{pos.avgPrice.toFixed(2)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <div className="text-right">
                            <div className="text-xs font-mono text-[var(--text-primary)]">{pos.size.toFixed(2)} shares</div>
                            {pos.unrealizedPnl !== undefined && (
                              <div className={cn(
                                "text-[10px] font-mono",
                                pos.unrealizedPnl >= 0 ? "text-dash-positive" : "text-dash-negative"
                              )}>
                                {pos.unrealizedPnl >= 0 ? "+" : ""}{pos.unrealizedPnl.toFixed(2)}
                              </div>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-[10px] h-7 px-2 border-dash-action/50 text-dash-action hover:bg-dash-action/10"
                            onClick={() => handleOpenSellModal(pos)}
                            data-testid={`button-sell-position-${i}`}
                          >
                            <DollarSign className="w-3 h-3 mr-1" />
                            Sell
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>

            {/* History Tab - Sorted chronologically with newest first */}
            <TabsContent value="history" className="mt-0">
              <div className="divide-y divide-[var(--border-primary)]/50">
                {activityLoading && lostPositions.length === 0 ? (
                  <div className="p-4 text-center">
                    <RefreshCw className="w-6 h-6 text-[var(--text-muted)] mx-auto mb-2 animate-spin" />
                    <p className="text-xs text-[var(--text-muted)]">Loading history...</p>
                  </div>
                ) : historyCount === 0 ? (
                  <div className="p-4 text-center">
                    <History className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-2" />
                    <p className="text-xs text-[var(--text-muted)]">No history yet</p>
                  </div>
                ) : (
                  <>
                    {historyItems.map((item, i) => {
                      if (item.type === "lost") {
                        const pos = item.position;
                        return (
                          <div key={`lost-${pos.tokenId}-${i}`} className="p-3" data-testid={`history-lost-${i}`}>
                            <div className="flex justify-between items-start gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start gap-2">
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 bg-dash-negative/20 text-dash-negative">
                                    LOST
                                  </span>
                                  <div className="text-xs text-[var(--text-primary)] leading-tight">{pos.marketQuestion || "Resolved Position"}</div>
                                </div>
                                <div className="text-[10px] font-mono text-[var(--text-muted)] mt-1 ml-10">{pos.outcomeLabel || pos.side}</div>
                              </div>
                              <div className="text-right shrink-0 ml-2">
                                <div className="text-sm font-mono font-bold text-dash-negative">
                                  -${(pos.size * pos.avgPrice).toFixed(2)}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      } else {
                        const act = item.activity;
                        return (
                          <div 
                            key={`${act.transactionHash}-${i}`} 
                            className="p-3" 
                            data-testid={`activity-${i}`}
                          >
                            <div className="flex justify-between items-start gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start gap-2">
                                  <span className={cn(
                                    "px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0",
                                    act.type === "REDEEM" 
                                      ? "bg-dash-positive/20 text-dash-positive"
                                      : act.side === "SELL"
                                      ? "bg-dash-action/20 text-dash-action"
                                      : "bg-dash-accent/20 text-dash-accent"
                                  )}>
                                    {act.type === "REDEEM" ? "CLAIMED" : act.side === "SELL" ? "SOLD" : "BOUGHT"}
                                  </span>
                                  <div className="text-xs text-[var(--text-primary)] leading-tight">{act.title}</div>
                                </div>
                                <div className="text-[10px] font-mono text-[var(--text-muted)] mt-1 ml-10">
                                  {act.outcome} {act.price ? `@ ${(act.price).toFixed(2)}` : ""}
                                </div>
                              </div>
                              <div className="text-right shrink-0 ml-2">
                                <div className={cn(
                                  "text-sm font-mono font-bold",
                                  act.type === "REDEEM" 
                                    ? "text-dash-positive" 
                                    : act.side === "SELL" 
                                    ? "text-dash-action" 
                                    : "text-[var(--text-primary)]"
                                )}>
                                  {act.type === "REDEEM" ? "+" : act.side === "SELL" ? "+" : "-"}${act.usdcSize.toFixed(2)}
                                </div>
                                <div className="text-[10px] text-[var(--text-muted)]">
                                  {formatActivityTime(act.timestamp)}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      }
                    })}
                  </>
                )}
              </div>
            </TabsContent>

            {/* Bridge Tab - Shows bridge deposit/withdrawal history */}
            <TabsContent value="bridge" className="mt-0">
              <div className="divide-y divide-[var(--border-primary)]/50">
                {bridgeTransactionsLoading ? (
                  <div className="p-4 text-center">
                    <RefreshCw className="w-6 h-6 text-[var(--text-muted)] mx-auto mb-2 animate-spin" />
                    <p className="text-xs text-[var(--text-muted)]">Loading bridge history...</p>
                  </div>
                ) : bridgeTransactions.length === 0 ? (
                  <div className="p-4 text-center">
                    <ArrowUpFromLine className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-2" />
                    <p className="text-xs text-[var(--text-muted)]">No bridge transactions yet</p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-1">Deposit or withdraw via bridge to see history</p>
                  </div>
                ) : (
                  bridgeTransactions.map((tx, i) => {
                    const isDeposit = tx.toChainId === "137";
                    const fromChainName = chainOptions.find(c => c.chainId === tx.fromChainId)?.chainName || tx.fromChainId;
                    const toChainName = chainOptions.find(c => c.chainId === tx.toChainId)?.chainName || (tx.toChainId === "137" ? "Polygon" : tx.toChainId);
                    const amount = parseFloat(tx.fromAmountBaseUnit) / 1e6;
                    const statusColor = tx.status === "COMPLETED" ? "text-dash-positive" : tx.status === "PROCESSING" ? "text-dash-action" : "text-dash-accent";
                    const statusBg = tx.status === "COMPLETED" ? "bg-dash-positive/20" : tx.status === "PROCESSING" ? "bg-dash-action/20" : "bg-dash-accent/20";
                    
                    return (
                      <div 
                        key={`${tx.txHash || i}-${tx.createdTimeMs}`} 
                        className="p-3 hover:bg-[var(--card-bg-elevated)]/30 transition-colors"
                        data-testid={`bridge-tx-${i}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={cn(
                                "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase",
                                statusBg, statusColor
                              )}>
                                {tx.status.replace("_", " ")}
                              </span>
                              <span className={cn(
                                "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase",
                                isDeposit ? "bg-dash-positive/20 text-dash-positive" : "bg-dash-action/20 text-dash-action"
                              )}>
                                {isDeposit ? "DEPOSIT" : "WITHDRAW"}
                              </span>
                            </div>
                            <div className="text-xs text-[var(--text-primary)]">
                              {fromChainName} → {toChainName}
                            </div>
                            {tx.txHash && (
                              <a 
                                href={`https://polygonscan.com/tx/${tx.txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] text-dash-accent hover:underline flex items-center gap-1 mt-1"
                              >
                                {tx.txHash.slice(0, 10)}...{tx.txHash.slice(-6)}
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <div className={cn(
                              "text-sm font-mono font-bold",
                              isDeposit ? "text-dash-positive" : "text-dash-action"
                            )}>
                              {isDeposit ? "+" : "-"}${amount.toFixed(2)}
                            </div>
                            {tx.createdTimeMs && (
                              <div className="text-[10px] text-[var(--text-muted)]">
                                {new Date(tx.createdTimeMs).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  hour: "numeric",
                                  minute: "2-digit",
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {wallet && wallet.usdcBalance > 0 && (
          <div className="bg-[var(--card-bg)] border border-[var(--border-primary)] rounded-md overflow-hidden">
            <div className="p-3 border-b border-[var(--border-primary)] flex items-center gap-2">
              <ArrowDownToLine className="w-4 h-4 text-dash-action" />
              <h3 className="text-xs font-bold text-[var(--text-secondary)] tracking-wider">WITHDRAW</h3>
            </div>
            <div className="p-3 space-y-3">
              <div>
                <label className="text-[10px] text-[var(--text-muted)] block mb-1">Withdraw To</label>
                <Select value={withdrawChain} onValueChange={handleWithdrawChainChange}>
                  <SelectTrigger className="w-full bg-[var(--page-bg)] border-[var(--border-primary)] text-sm" data-testid="select-withdraw-chain">
                    <SelectValue placeholder="Select destination" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="polygon">
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 rounded-full bg-purple-500 flex items-center justify-center text-[8px] font-bold text-[var(--text-primary)]">P</span>
                        Polygon (USDC.e)
                      </span>
                    </SelectItem>
                    {chainOptions.map((chain) => (
                      <SelectItem key={chain.chainId} value={chain.chainId}>
                        <span className="flex items-center gap-2">
                          <span className="w-4 h-4 rounded-full bg-[var(--card-bg-hover)] flex items-center justify-center text-[8px] font-bold text-[var(--text-primary)]">
                            {chain.chainName.charAt(0)}
                          </span>
                          {chain.chainName}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {withdrawChain !== "polygon" && (
                <div>
                  <label className="text-[10px] text-[var(--text-muted)] block mb-1">Receive Token</label>
                  <Select value={withdrawToken} onValueChange={setWithdrawToken}>
                    <SelectTrigger className="w-full bg-[var(--page-bg)] border-[var(--border-primary)] text-sm" data-testid="select-withdraw-token">
                      <SelectValue placeholder="Select token" />
                    </SelectTrigger>
                    <SelectContent>
                      {getTokensForChain(withdrawChain).map((asset) => (
                        <SelectItem key={asset.token.address} value={asset.token.address}>
                          <span className="flex flex-col">
                            <span>{asset.token.symbol} - {asset.token.name}</span>
                            <span className="text-[9px] text-[var(--text-muted)] font-mono">
                              {asset.token.address.slice(0, 10)}...{asset.token.address.slice(-6)}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {withdrawToken && (
                    <p className="text-[10px] text-rose-400 mt-1 font-medium">
                      Min: ${getTokensForChain(withdrawChain).find(t => t.token.address === withdrawToken)?.minCheckoutUsd || 2} USD
                    </p>
                  )}
                </div>
              )}
              
              <div>
                <label className="text-[10px] text-[var(--text-muted)] block mb-1">Amount (USDC)</label>
                {(() => {
                  const minAmount = withdrawChain === "polygon" 
                    ? 1 
                    : (getTokensForChain(withdrawChain).find(t => t.token.address === withdrawToken)?.minCheckoutUsd || 2);
                  const isAmountBelowMin = withdrawAmount && parseFloat(withdrawAmount) > 0 && parseFloat(withdrawAmount) < minAmount;
                  return (
                    <>
                      <input
                        type="number"
                        placeholder="0.00"
                        min={minAmount}
                        step="0.01"
                        value={withdrawAmount}
                        onChange={(e) => {
                          setWithdrawAmount(e.target.value);
                          setWithdrawQuote(null);
                        }}
                        className={`w-full bg-[var(--page-bg)] border rounded px-3 py-2 text-sm font-mono text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none ${isAmountBelowMin ? 'border-rose-500 focus:border-rose-500' : 'border-[var(--border-primary)] focus:border-dash-action'}`}
                        data-testid="input-withdraw-amount"
                      />
                      {isAmountBelowMin && (
                        <p className="text-[10px] text-rose-400 mt-1">
                          Minimum withdrawal: ${minAmount} USD
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>
              <div>
                <label className="text-[10px] text-[var(--text-muted)] block mb-1">To Address</label>
                <input
                  type="text"
                  placeholder="0x..."
                  value={withdrawTo}
                  onChange={(e) => setWithdrawTo(e.target.value)}
                  className="w-full bg-[var(--page-bg)] border border-[var(--border-primary)] rounded px-3 py-2 text-sm font-mono text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-dash-action"
                  data-testid="input-withdraw-address"
                />
              </div>
              
              {withdrawChain !== "polygon" && withdrawAmount && withdrawTo && (
                <>
                  {withdrawQuote ? (
                    <div className="bg-[var(--page-bg)] border border-[var(--border-primary)] rounded p-2 space-y-1">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-[var(--text-muted)]">Network Fee</span>
                        <span className="text-[var(--text-secondary)]">${withdrawQuote.fee}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-[var(--text-secondary)]">You'll Receive</span>
                        <span className="text-dash-positive font-mono">{withdrawQuote.output}</span>
                      </div>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full text-xs border-[var(--border-secondary)]"
                      onClick={handleGetWithdrawQuote}
                      disabled={isGettingQuote || !withdrawToken || parseFloat(withdrawAmount) < (getTokensForChain(withdrawChain).find(t => t.token.address === withdrawToken)?.minCheckoutUsd || 2)}
                      data-testid="button-get-quote"
                    >
                      {isGettingQuote ? (
                        <Loader2 className="w-3 h-3 animate-spin mr-1" />
                      ) : null}
                      Get Quote
                    </Button>
                  )}
                </>
              )}
              
              <Button
                className="w-full bg-dash-action border-dash-action text-zinc-950"
                disabled={!withdrawAmount || !withdrawTo || withdrawMutation.isPending || (withdrawChain !== "polygon" && (!withdrawQuote || !withdrawToken)) || parseFloat(withdrawAmount || "0") < (withdrawChain === "polygon" ? 1 : (getTokensForChain(withdrawChain).find(t => t.token.address === withdrawToken)?.minCheckoutUsd || 2))}
                onClick={() => withdrawMutation.mutate({ 
                  amount: parseFloat(withdrawAmount), 
                  toAddress: withdrawTo,
                  chain: withdrawChain,
                  tokenAddress: withdrawToken,
                })}
                data-testid="button-withdraw"
              >
                {withdrawMutation.isPending ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : withdrawChain === "polygon" ? (
                  "Withdraw USDC.e"
                ) : (
                  "Withdraw via Bridge"
                )}
              </Button>
              {withdrawMutation.isSuccess && (
                <div className="p-3 rounded-md bg-dash-positive/10 border border-dash-positive/30">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-4 h-4 text-dash-positive" />
                    <p className="text-xs text-dash-positive font-medium">
                      {withdrawChain === "polygon" ? "Withdrawal successful!" : "Bridge transfer initiated!"}
                    </p>
                  </div>
                  {withdrawMutation.data?.txHash && (
                    <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                      <span>Tx:</span>
                      <a 
                        href={`https://polygonscan.com/tx/${withdrawMutation.data.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-dash-accent hover:underline flex items-center gap-1"
                      >
                        {withdrawMutation.data.txHash.slice(0, 10)}...{withdrawMutation.data.txHash.slice(-8)}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                  {withdrawChain !== "polygon" && (
                    <p className="text-xs text-[var(--text-secondary)] mt-2">
                      Your funds are being bridged. They will arrive at your destination address shortly.
                    </p>
                  )}
                </div>
              )}
              {withdrawMutation.isError && (
                <p className="text-xs text-dash-negative text-center">
                  {withdrawMutation.error instanceof Error ? withdrawMutation.error.message : "Withdrawal failed"}
                </p>
              )}
            </div>
          </div>
        )}

      </div>

      {/* Sell Position Panel - BetSlip Style */}
      {sellModalOpen && sellPosition && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-[430px] bg-[var(--card-bg)] border-t border-dash-action/50 rounded-t-xl p-4 animate-slide-up">
            {/* Header */}
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1">
                  <DollarSign className="w-3 h-3 text-dash-action" />
                  Sell Position
                </p>
                <h3 className="font-bold text-[var(--text-primary)] text-lg">
                  {sellPosition.outcomeLabel || sellPosition.side}
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">{sellPosition.marketQuestion || "Unknown Market"}</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  You have: <span className="text-[var(--text-primary)] font-mono">{sellPosition.size.toFixed(2)} shares</span>
                </p>
              </div>
              <button
                onClick={() => setSellModalOpen(false)}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1"
                disabled={isSelling}
                data-testid="button-close-sell"
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
                  {isLoadingBid ? (
                    <span className="text-sm font-mono text-[var(--text-muted)] flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Loading...
                    </span>
                  ) : bestBid ? (
                    <span className={cn("text-sm font-mono font-semibold",
                      bestBid >= sellPosition.avgPrice ? "text-dash-positive" : "text-dash-negative"
                    )}>
                      ${bestBid.toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-sm font-mono text-[var(--text-muted)]">—</span>
                  )}
                </div>
              </div>

              {/* Shares Input with Odds Display */}
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
                    data-testid="input-sell-amount"
                  />
                </div>
                <div className="text-right">
                  <p className="text-xs text-[var(--text-muted)]">Best Bid</p>
                  <p className={cn("text-2xl font-black font-mono",
                    bestBid && bestBid >= sellPosition.avgPrice ? "text-dash-positive" : "text-dash-action"
                  )}>
                    {bestBid ? `$${bestBid.toFixed(2)}` : "—"}
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
                        ? "bg-dash-action/20 text-dash-action border border-dash-action/30"
                        : "bg-[var(--card-bg-elevated)] hover:bg-[var(--card-bg-hover)] text-[var(--text-secondary)]"
                    )}
                    disabled={isSelling}
                    data-testid={`button-sell-${pct}pct`}
                  >
                    {pct}%
                  </button>
                ))}
                <button
                  onClick={() => setSellAmount(sellPosition.size.toFixed(2))}
                  className={cn(
                    "flex-1 py-2 text-sm font-bold rounded transition-colors border",
                    sellAmount === sellPosition.size.toFixed(2)
                      ? "bg-dash-action/30 text-dash-action border-dash-action/50"
                      : "bg-dash-action/20 hover:bg-dash-action/30 text-dash-action border-dash-action/30"
                  )}
                  disabled={isSelling}
                  data-testid="button-sell-100pct"
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
                    <span className="font-mono font-bold text-dash-action">
                      ~${(parseFloat(sellAmount) * (bestBid || sellPosition.avgPrice)).toFixed(2)}
                    </span>
                  </div>
                  {bestBid && (
                    <div className="flex justify-between text-sm border-t border-[var(--border-secondary)] pt-2 mt-2">
                      <span className="text-[var(--text-secondary)]">Estimated P&L</span>
                      <span className={cn("font-mono font-semibold",
                        (bestBid - sellPosition.avgPrice) >= 0 ? "text-dash-positive" : "text-dash-negative"
                      )}>
                        {(bestBid - sellPosition.avgPrice) >= 0 ? "+" : ""}
                        ${((parseFloat(sellAmount) * bestBid) - (parseFloat(sellAmount) * sellPosition.avgPrice)).toFixed(2)}
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
                <div className="flex items-center gap-2 text-dash-negative text-sm bg-dash-negative/10 rounded p-2">
                  <AlertTriangle className="w-4 h-4" />
                  <span>{sellError}</span>
                </div>
              )}

              {/* Success Message */}
              {sellSuccess && (
                <div className="flex items-center gap-2 text-dash-positive text-sm bg-dash-positive/10 rounded p-2">
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
                  data-testid="button-cancel-sell"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleExecuteSell}
                  disabled={isSelling || sellSuccess || !sellAmount || parseFloat(sellAmount) <= 0}
                  size="lg"
                  className="flex-1 bg-dash-action text-zinc-950 font-bold text-lg"
                  data-testid="button-confirm-sell"
                >
                  {isSelling ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Selling...
                    </>
                  ) : (
                    `Sell · $${(parseFloat(sellAmount || "0") * (bestBid || sellPosition.avgPrice)).toFixed(2)}`
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
