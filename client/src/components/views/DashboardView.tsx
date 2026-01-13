import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Award, Activity, Wallet, History, Package, Coins, ArrowDownToLine, RefreshCw, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { fetchPositions, type PolymarketPosition } from "@/lib/polymarketOrder";
import { usePolymarketClient } from "@/hooks/usePolymarketClient";
import type { Wallet as WalletType, Bet, Trade } from "@shared/schema";

interface DashboardViewProps {
  wallet: WalletType | null;
  bets: Bet[];
  trades: Trade[];
  isLoading: boolean;
  walletAddress?: string;
}

export function DashboardView({ wallet, bets, trades, isLoading, walletAddress }: DashboardViewProps) {
  const [positions, setPositions] = useState<PolymarketPosition[]>([]);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawTo, setWithdrawTo] = useState("");
  
  const { 
    withdrawUSDC, 
    redeemPositions, 
    isRelayerLoading 
  } = usePolymarketClient();
  
  useEffect(() => {
    if (walletAddress) {
      setPositionsLoading(true);
      fetchPositions(walletAddress)
        .then(setPositions)
        .finally(() => setPositionsLoading(false));
    }
  }, [walletAddress]);

  const refreshPositions = async () => {
    if (walletAddress) {
      setPositionsLoading(true);
      const pos = await fetchPositions(walletAddress);
      setPositions(pos);
      setPositionsLoading(false);
    }
  };

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

  const wonBets = bets.filter((b) => b.status === "won");
  const pendingBets = bets.filter((b) => b.status === "pending");
  const totalPnL = bets.reduce((acc, bet) => {
    if (bet.status === "won") return acc + (bet.potentialPayout - bet.amount);
    if (bet.status === "lost") return acc - bet.amount;
    return acc;
  }, 0);

  const openPositions = positions.filter(p => p.status === "open" || p.status === "filled");
  const claimablePositions = positions.filter(p => p.status === "resolved" || p.status === "claimable");

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
          <div className="p-3 border-b border-zinc-800 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-wild-trade" />
              <h3 className="text-xs font-bold text-zinc-400 tracking-wider">POSITIONS</h3>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6"
              onClick={refreshPositions}
              disabled={positionsLoading}
              data-testid="button-refresh-positions"
            >
              <RefreshCw className={cn("w-3 h-3 text-zinc-500", positionsLoading && "animate-spin")} />
            </Button>
          </div>
          <div className="divide-y divide-zinc-800/50">
            {openPositions.length === 0 ? (
              <div className="p-4 text-center">
                <p className="text-xs text-zinc-500">No open positions</p>
              </div>
            ) : (
              openPositions.map((pos, i) => (
                <div key={`${pos.tokenId}-${i}`} className="p-3" data-testid={`position-${i}`}>
                  <div className="flex justify-between items-start mb-2">
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
        </div>

        {claimablePositions.length > 0 && (
          <div className="bg-zinc-900 border border-wild-scout/30 rounded-md overflow-hidden">
            <div className="p-3 border-b border-zinc-800 flex items-center gap-2">
              <Coins className="w-4 h-4 text-wild-scout" />
              <h3 className="text-xs font-bold text-wild-scout tracking-wider">CLAIM WINNINGS</h3>
            </div>
            <div className="divide-y divide-zinc-800/50">
              {claimablePositions.map((pos, i) => (
                <div key={`${pos.tokenId}-${i}`} className="p-3 flex justify-between items-center" data-testid={`claimable-${i}`}>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-white truncate">{pos.marketQuestion || "Winning Position"}</div>
                    <div className="text-[10px] font-mono text-wild-scout">${pos.size.toFixed(2)} USDC</div>
                  </div>
                  <Button
                    size="sm"
                    className="bg-wild-scout hover:bg-wild-scout/80 text-zinc-950 text-xs h-7"
                    onClick={() => pos.conditionId && redeemMutation.mutate({ conditionId: pos.conditionId })}
                    disabled={redeemMutation.isPending || !pos.conditionId}
                    data-testid={`button-claim-${i}`}
                  >
                    {redeemMutation.isPending ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <>
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Claim
                      </>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

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
                className="w-full bg-wild-gold hover:bg-wild-gold/80 text-zinc-950"
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

        {bets.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-md overflow-hidden">
            <div className="p-3 border-b border-zinc-800">
              <h3 className="text-xs font-bold text-zinc-400 tracking-wider">RECENT BETS</h3>
            </div>
            <div className="divide-y divide-zinc-800/50">
              {bets.slice(0, 5).map((bet) => (
                <div
                  key={bet.id}
                  className="flex justify-between items-center p-3"
                  data-testid={`bet-${bet.id}`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "px-1.5 py-0.5 rounded text-[9px] font-bold",
                        bet.status === "won"
                          ? "bg-wild-scout/20 text-wild-scout"
                          : bet.status === "lost"
                          ? "bg-wild-brand/20 text-wild-brand"
                          : "bg-wild-gold/20 text-wild-gold"
                      )}
                    >
                      {bet.status.toUpperCase()}
                    </span>
                    <span className="text-xs text-white">@{bet.odds.toFixed(2)}</span>
                  </div>
                  <div className="text-right font-mono">
                    <div className="text-xs text-white">${bet.amount.toFixed(2)}</div>
                    <div className="text-[10px] text-zinc-500">
                      {formatTime(bet.placedAt)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {bets.length === 0 && trades.length === 0 && openPositions.length === 0 && (
          <div className="text-center py-8 opacity-60">
            <Activity className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
            <h3 className="font-bold text-zinc-500">No Activity Yet</h3>
            <p className="text-xs text-zinc-600 mt-2">
              Start predicting to see your stats here
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
