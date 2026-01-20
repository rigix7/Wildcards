import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Award, Activity, Wallet, History, Package, Coins, ArrowDownToLine, ArrowUpFromLine, RefreshCw, CheckCircle2, Copy, Check, HelpCircle, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { fetchPositions, fetchActivity, type PolymarketPosition, type PolymarketActivity } from "@/lib/polymarketOrder";
import { usePolymarketClient } from "@/hooks/usePolymarketClient";
import { DepositInstructions } from "@/components/terminal/DepositInstructions";
import type { Wallet as WalletType, Bet, Trade } from "@shared/schema";

interface DashboardViewProps {
  wallet: WalletType | null;
  bets: Bet[];
  trades: Trade[];
  isLoading: boolean;
  walletAddress?: string;
  safeAddress?: string | null;
  isSafeDeployed?: boolean;
}

export function DashboardView({ wallet, bets, trades, isLoading, walletAddress, safeAddress, isSafeDeployed }: DashboardViewProps) {
  const [positions, setPositions] = useState<PolymarketPosition[]>([]);
  const [activity, setActivity] = useState<PolymarketActivity[]>([]);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawTo, setWithdrawTo] = useState("");
  const [copied, setCopied] = useState(false);
  const [showDepositInstructions, setShowDepositInstructions] = useState(false);
  
  const { 
    withdrawUSDC, 
    redeemPositions,
    batchRedeemPositions,
  } = usePolymarketClient();
  
  useEffect(() => {
    if (walletAddress) {
      setPositionsLoading(true);
      setActivityLoading(true);
      
      fetchPositions(walletAddress)
        .then(setPositions)
        .finally(() => setPositionsLoading(false));
      
      fetchActivity(walletAddress)
        .then(setActivity)
        .finally(() => setActivityLoading(false));
    }
  }, [walletAddress]);

  const refreshPositions = async () => {
    if (walletAddress) {
      setPositionsLoading(true);
      setActivityLoading(true);
      
      const [pos, act] = await Promise.all([
        fetchPositions(walletAddress),
        fetchActivity(walletAddress)
      ]);
      
      setPositions(pos);
      setActivity(act);
      setPositionsLoading(false);
      setActivityLoading(false);
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
      // Collect all conditionIds and batch redeem in ONE transaction (single signature!)
      const conditionIds = claimable
        .map(p => p.conditionId)
        .filter((id): id is string => !!id);
      
      if (conditionIds.length > 0) {
        const result = await batchRedeemPositions(conditionIds, [1, 2]);
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
    mutationFn: async ({ amount, toAddress }: { amount: number; toAddress: string }) => {
      if (!walletAddress) throw new Error("No wallet connected");
      const result = await withdrawUSDC(amount, toAddress);
      if (!result.success) {
        throw new Error(result.error || "Withdrawal failed");
      }
      return result;
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

  const wonBets = bets.filter((b) => b.status === "won");
  const pendingBets = bets.filter((b) => b.status === "pending");
  const totalPnL = bets.reduce((acc, bet) => {
    if (bet.status === "won") return acc + (bet.potentialPayout - bet.amount);
    if (bet.status === "lost") return acc - bet.amount;
    return acc;
  }, 0);

  const openPositions = positions.filter(p => p.status === "open" || p.status === "filled");
  const claimablePositions = positions.filter(p => p.status === "claimable");
  const pendingPositions = positions.filter(p => p.status === "pending");
  const lostPositions = positions.filter(p => p.status === "lost");
  // Resolved tab only shows actionable positions (pending wins and claimable wins)
  const resolvedPositions = [...claimablePositions, ...pendingPositions];
  const totalClaimable = claimablePositions.reduce((sum, p) => sum + p.size, 0);
  // History tab count includes lost positions + activity
  const historyCount = lostPositions.length + activity.length;
  
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
            <div key={i} className="bg-zinc-900 border border-zinc-800 p-4 rounded-md">
              <div className="w-8 h-8 bg-zinc-850 rounded animate-pulse-skeleton mb-3" />
              <div className="w-16 h-3 bg-zinc-850 rounded animate-pulse-skeleton mb-2" />
              <div className="w-24 h-6 bg-zinc-850 rounded animate-pulse-skeleton" />
            </div>
          ))}
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-md space-y-3">
          <div className="w-32 h-4 bg-zinc-850 rounded animate-pulse-skeleton" />
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 bg-zinc-850 rounded animate-pulse-skeleton" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full animate-fade-in overflow-y-auto">
      <div className="shrink-0 bg-zinc-950 border-b border-zinc-800 p-3 z-20">
        <h2 className="text-xs font-bold text-zinc-400 tracking-wider">DASHBOARD</h2>
      </div>

      <div className="p-3 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-md">
            <div className="w-8 h-8 rounded-full bg-wild-gold/20 flex items-center justify-center mb-3">
              <Wallet className="w-4 h-4 text-wild-gold" />
            </div>
            <div className="text-[10px] font-mono text-zinc-500 uppercase mb-1">Total Value</div>
            <div className="text-xl font-black font-mono text-white" data-testid="text-total-value">
              ${formatBalance(wallet?.totalValue || 0)}
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-md">
            <div className="w-8 h-8 rounded-full bg-wild-trade/20 flex items-center justify-center mb-3">
              <Activity className="w-4 h-4 text-wild-trade" />
            </div>
            <div className="text-[10px] font-mono text-zinc-500 uppercase mb-1">P&L</div>
            <div
              className={cn(
                "text-xl font-black font-mono flex items-center gap-1",
                totalPnL >= 0 ? "text-wild-scout" : "text-wild-brand"
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

          <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-md">
            <div className="w-8 h-8 rounded-full bg-wild-scout/20 flex items-center justify-center mb-3">
              <Award className="w-4 h-4 text-wild-scout" />
            </div>
            <div className="text-[10px] font-mono text-zinc-500 uppercase mb-1">Won / Total</div>
            <div className="text-xl font-black font-mono text-white" data-testid="text-win-ratio">
              {wonBets.length} / {bets.length}
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-md">
            <div className="w-8 h-8 rounded-full bg-wild-brand/20 flex items-center justify-center mb-3">
              <History className="w-4 h-4 text-wild-brand" />
            </div>
            <div className="text-[10px] font-mono text-zinc-500 uppercase mb-1">Pending</div>
            <div className="text-xl font-black font-mono text-white" data-testid="text-pending">
              {pendingBets.length}
            </div>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-md overflow-hidden">
          <div className="p-3 border-b border-zinc-800">
            <h3 className="text-xs font-bold text-zinc-400 tracking-wider">BALANCES</h3>
          </div>
          <div className="divide-y divide-zinc-800/50">
            <div className="flex justify-between items-center p-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-[10px] font-bold text-white">
                  $
                </div>
                <div>
                  <div className="text-sm font-medium text-white">USDC</div>
                  <div className="text-[10px] text-zinc-500 font-mono">Polygon</div>
                </div>
              </div>
              <span className="font-mono font-bold text-white" data-testid="text-dash-usdc">
                ${formatBalance(wallet?.usdcBalance || 0)}
              </span>
            </div>
            <div className="flex justify-between items-center p-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-wild-scout flex items-center justify-center text-[10px] font-bold text-zinc-950">
                  W
                </div>
                <div>
                  <div className="text-sm font-medium text-white">WILD</div>
                  <div className="text-[10px] text-zinc-500 font-mono">Wildcard Token</div>
                </div>
              </div>
              <span className="font-mono font-bold text-white" data-testid="text-dash-wild">
                {formatBalance(wallet?.wildBalance || 0)}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-md overflow-hidden">
          <div className="p-3 border-b border-zinc-800 flex items-center gap-2">
            <ArrowUpFromLine className="w-4 h-4 text-wild-trade" />
            <h3 className="text-xs font-bold text-zinc-400 tracking-wider">DEPOSIT USDC</h3>
          </div>
          <div className="p-3 space-y-3">
            {isSafeDeployed && safeAddress ? (
              <>
                <div className="flex items-center justify-between bg-zinc-950 rounded p-2 border border-zinc-800">
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="text-[10px] text-zinc-500 mb-0.5">Deposit Address</span>
                    <span className="text-[11px] font-mono text-zinc-300 truncate" data-testid="text-deposit-address">
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
                      <Check className="w-3 h-3 text-wild-scout" />
                    ) : (
                      <Copy className="w-3 h-3 text-zinc-400" />
                    )}
                  </Button>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-xs border-zinc-700"
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
                <p className="text-[10px] text-zinc-600">
                  Gasless trading enabled. Deposit USDC.e (Polygon) to start.
                </p>
              </>
            ) : (
              <div className="text-center py-4">
                <p className="text-xs text-zinc-400 mb-2">
                  Activate your Prediction Wallet to get a deposit address
                </p>
                <p className="text-[10px] text-zinc-500">
                  Open your wallet (top right) and click "Activate Wallet"
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Unified Activity Tabs */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-md overflow-hidden">
          <div className="p-3 border-b border-zinc-800 flex justify-between items-center gap-2">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-wild-trade" />
              <h3 className="text-xs font-bold text-zinc-400 tracking-wider">ACTIVITY</h3>
            </div>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={refreshPositions}
              disabled={positionsLoading}
              data-testid="button-refresh-positions"
            >
              <RefreshCw className={cn("w-4 h-4 text-zinc-500", positionsLoading && "animate-spin")} />
            </Button>
          </div>
          
          <Tabs defaultValue={getDefaultTab()} className="w-full">
            <TabsList className="w-full justify-start rounded-none border-b border-zinc-800 bg-transparent h-auto p-0 gap-0 flex-wrap">
              <TabsTrigger 
                value="resolved" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-wild-scout data-[state=active]:bg-transparent data-[state=active]:text-wild-scout px-3 py-2 text-xs"
                data-testid="tab-resolved"
              >
                Resolved
                {resolvedPositions.length > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-wild-scout/20 text-wild-scout">
                    {resolvedPositions.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger 
                value="open" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-wild-trade data-[state=active]:bg-transparent data-[state=active]:text-wild-trade px-3 py-2 text-xs"
                data-testid="tab-open"
              >
                Open
                {openPositions.length > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-wild-trade/20 text-wild-trade">
                    {openPositions.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger 
                value="history" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-zinc-400 data-[state=active]:bg-transparent data-[state=active]:text-zinc-300 px-3 py-2 text-xs"
                data-testid="tab-history"
              >
                History
                {historyCount > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-zinc-700 text-zinc-300">
                    {historyCount}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            {/* Resolved Tab - Shows actionable positions (pending wins and claimable wins) */}
            <TabsContent value="resolved" className="mt-0">
              {claimablePositions.length > 0 && (
                <div className="p-2 border-b border-zinc-800 bg-wild-scout/5 flex justify-between items-center gap-2">
                  <span className="text-xs font-mono text-wild-scout">${formatBalance(totalClaimable)} to claim</span>
                  <Button
                    size="sm"
                    variant="default"
                    className="bg-wild-scout border-wild-scout text-zinc-950 text-xs shrink-0"
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
              <div className="divide-y divide-zinc-800/50">
                {resolvedPositions.length === 0 ? (
                  <div className="p-4 text-center">
                    <Coins className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                    <p className="text-xs text-zinc-500">No resolved positions</p>
                  </div>
                ) : (
                  resolvedPositions.map((pos, i) => {
                    const isClaimable = pos.status === "claimable";
                    const isPending = pos.status === "pending";
                    const isWin = isClaimable || isPending;
                    return (
                      <div key={`${pos.tokenId}-${i}`} className="p-3 flex justify-between items-center gap-2" data-testid={`resolved-${i}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0",
                              isClaimable ? "bg-wild-scout/20 text-wild-scout" 
                                : isPending ? "bg-wild-gold/20 text-wild-gold"
                                : "bg-wild-brand/20 text-wild-brand"
                            )}>
                              {isClaimable ? "WON" : isPending ? "PENDING" : "LOST"}
                            </span>
                            <div className="text-xs text-white truncate">{pos.marketQuestion || "Resolved Position"}</div>
                          </div>
                          <div className="text-[10px] font-mono text-zinc-500 mt-1">{pos.outcomeLabel || pos.side}</div>
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          {isWin ? (
                            <div className="text-sm font-mono text-wild-scout font-bold">${pos.size.toFixed(2)}</div>
                          ) : (
                            <div className="text-sm font-mono text-zinc-500">-${(pos.size * pos.avgPrice).toFixed(2)}</div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </TabsContent>

            {/* Open Positions Tab */}
            <TabsContent value="open" className="mt-0">
              <div className="divide-y divide-zinc-800/50">
                {openPositions.length === 0 ? (
                  <div className="p-4 text-center">
                    <Package className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                    <p className="text-xs text-zinc-500">No open positions</p>
                  </div>
                ) : (
                  openPositions.map((pos, i) => (
                    <div key={`${pos.tokenId}-${i}`} className="p-3" data-testid={`position-${i}`}>
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-white truncate">{pos.marketQuestion || "Unknown Market"}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-mono text-zinc-500">{pos.outcomeLabel || pos.side}</span>
                            <span className="text-[10px] font-mono text-wild-trade">@{pos.avgPrice.toFixed(2)}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <div className="text-xs font-mono text-white">{pos.size.toFixed(2)} shares</div>
                          {pos.unrealizedPnl !== undefined && (
                            <div className={cn(
                              "text-[10px] font-mono",
                              pos.unrealizedPnl >= 0 ? "text-wild-scout" : "text-wild-brand"
                            )}>
                              {pos.unrealizedPnl >= 0 ? "+" : ""}{pos.unrealizedPnl.toFixed(2)}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>

            {/* History Tab - Lost positions + Polymarket Activity API */}
            <TabsContent value="history" className="mt-0">
              <div className="divide-y divide-zinc-800/50">
                {activityLoading && lostPositions.length === 0 ? (
                  <div className="p-4 text-center">
                    <RefreshCw className="w-6 h-6 text-zinc-600 mx-auto mb-2 animate-spin" />
                    <p className="text-xs text-zinc-500">Loading history...</p>
                  </div>
                ) : historyCount === 0 ? (
                  <div className="p-4 text-center">
                    <History className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                    <p className="text-xs text-zinc-500">No history yet</p>
                  </div>
                ) : (
                  <>
                    {/* Lost positions first */}
                    {lostPositions.map((pos, i) => (
                      <div key={`lost-${pos.tokenId}-${i}`} className="p-3 flex justify-between items-center gap-2" data-testid={`history-lost-${i}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 bg-wild-brand/20 text-wild-brand">
                              LOST
                            </span>
                            <div className="text-xs text-white truncate">{pos.marketQuestion || "Resolved Position"}</div>
                          </div>
                          <div className="text-[10px] font-mono text-zinc-500 mt-1">{pos.outcomeLabel || pos.side}</div>
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <div className="text-sm font-mono font-bold text-wild-brand">
                            -${(pos.size * pos.avgPrice).toFixed(2)}
                          </div>
                        </div>
                      </div>
                    ))}
                    {/* Activity from Polymarket API */}
                    {activity.slice(0, 20).map((act, i) => (
                    <div 
                      key={`${act.transactionHash}-${i}`} 
                      className="p-3 flex justify-between items-center gap-2" 
                      data-testid={`activity-${i}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0",
                            act.type === "REDEEM" 
                              ? "bg-wild-scout/20 text-wild-scout"
                              : act.side === "SELL"
                              ? "bg-wild-gold/20 text-wild-gold"
                              : "bg-wild-trade/20 text-wild-trade"
                          )}>
                            {act.type === "REDEEM" ? "CLAIMED" : act.side === "SELL" ? "SOLD" : "BOUGHT"}
                          </span>
                          <div className="text-xs text-white truncate">{act.title}</div>
                        </div>
                        <div className="text-[10px] font-mono text-zinc-500 mt-1">
                          {act.outcome} {act.price ? `@ ${(act.price).toFixed(2)}` : ""}
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <div className={cn(
                          "text-sm font-mono font-bold",
                          act.type === "REDEEM" 
                            ? "text-wild-scout" 
                            : act.side === "SELL" 
                            ? "text-wild-gold" 
                            : "text-white"
                        )}>
                          {act.type === "REDEEM" ? "+" : act.side === "SELL" ? "+" : "-"}${act.usdcSize.toFixed(2)}
                        </div>
                        <div className="text-[10px] text-zinc-500">
                          {formatActivityTime(act.timestamp)}
                        </div>
                      </div>
                    </div>
                  ))}
                  </>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {wallet && wallet.usdcBalance > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-md overflow-hidden">
            <div className="p-3 border-b border-zinc-800 flex items-center gap-2">
              <ArrowDownToLine className="w-4 h-4 text-wild-gold" />
              <h3 className="text-xs font-bold text-zinc-400 tracking-wider">WITHDRAW</h3>
            </div>
            <div className="p-3 space-y-3">
              <div>
                <label className="text-[10px] text-zinc-500 block mb-1">Amount (USDC)</label>
                <input
                  type="number"
                  placeholder="0.00"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  className="w-full bg-zinc-850 border border-zinc-800 rounded px-3 py-2 text-sm font-mono text-white placeholder:text-zinc-600 focus:outline-none focus:border-wild-gold"
                  data-testid="input-withdraw-amount"
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 block mb-1">To Address</label>
                <input
                  type="text"
                  placeholder="0x..."
                  value={withdrawTo}
                  onChange={(e) => setWithdrawTo(e.target.value)}
                  className="w-full bg-zinc-850 border border-zinc-800 rounded px-3 py-2 text-sm font-mono text-white placeholder:text-zinc-600 focus:outline-none focus:border-wild-gold"
                  data-testid="input-withdraw-address"
                />
              </div>
              <Button
                className="w-full bg-wild-gold border-wild-gold text-zinc-950"
                disabled={!withdrawAmount || !withdrawTo || withdrawMutation.isPending}
                onClick={() => withdrawMutation.mutate({ 
                  amount: parseFloat(withdrawAmount), 
                  toAddress: withdrawTo 
                })}
                data-testid="button-withdraw"
              >
                {withdrawMutation.isPending ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  "Withdraw USDC"
                )}
              </Button>
              {withdrawMutation.isSuccess && (
                <p className="text-xs text-wild-scout text-center">Withdrawal submitted!</p>
              )}
              {withdrawMutation.isError && (
                <p className="text-xs text-wild-brand text-center">
                  {withdrawMutation.error instanceof Error ? withdrawMutation.error.message : "Withdrawal failed"}
                </p>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
