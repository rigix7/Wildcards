import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { X, AlertTriangle, Loader2, RefreshCw, CheckCircle2, XCircle, ArrowRight, Info, ChevronUp, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { OrderBookData } from "@/hooks/usePolymarketClient";
import { categorizeError, type CategorizedError } from "@/lib/polymarketErrors";
import useFeeCollection from "@/hooks/useFeeCollection";

type SubmissionStatus = "idle" | "pending" | "success" | "error";

export interface BetSelection {
  id: string;
  marketId: string;
  outcomeId: string;
  marketTitle: string;
  outcomeLabel: string;
  odds: number;
  stake: string;
  direction: "yes" | "no";
  yesTokenId?: string;
  noTokenId?: string;
  yesPrice?: number;
  noPrice?: number;
  orderMinSize?: number;
  question?: string;
  isSoccer3Way?: boolean;
  negRisk?: boolean;
  outcomeLabels?: [string, string];
  orderBook?: OrderBookData | null;
  isLoadingBook?: boolean;
  bookError?: string | null;
  lastRefresh?: number;
}

interface FillSimulation {
  canFill: boolean;
  avgPrice: number;
  slippagePercent: number;
  wouldSlip: boolean;
  depthAtBestAsk: number;
  totalDepth: number;
  noOrderBook: boolean;
}

function simulateFill(
  stakeUSDC: number,
  asks: { price: number; size: number }[],
  bestAsk: number
): FillSimulation {
  if (!asks || asks.length === 0) {
    return { 
      canFill: false, avgPrice: bestAsk, slippagePercent: 0, wouldSlip: false, 
      depthAtBestAsk: 0, totalDepth: 0, noOrderBook: true
    };
  }
  
  if (stakeUSDC <= 0) {
    const totalDepth = asks.reduce((sum, ask) => sum + ask.size * ask.price, 0);
    return { 
      canFill: true, avgPrice: bestAsk, slippagePercent: 0, wouldSlip: false, 
      depthAtBestAsk: asks[0].size * asks[0].price, totalDepth, noOrderBook: false
    };
  }
  
  const depthAtBestAsk = asks[0].size * asks[0].price;
  const totalDepth = asks.reduce((sum, ask) => sum + ask.size * ask.price, 0);
  
  if (stakeUSDC <= depthAtBestAsk) {
    return { 
      canFill: true, avgPrice: bestAsk, slippagePercent: 0, wouldSlip: false, 
      depthAtBestAsk, totalDepth, noOrderBook: false
    };
  }
  
  let remaining = stakeUSDC;
  let totalCost = 0;
  let totalShares = 0;
  
  for (const ask of asks) {
    if (remaining <= 0) break;
    const levelLiquidity = ask.size * ask.price;
    const fillAmount = Math.min(remaining, levelLiquidity);
    const sharesBought = fillAmount / ask.price;
    totalCost += fillAmount;
    totalShares += sharesBought;
    remaining -= fillAmount;
  }
  
  if (remaining > 0) {
    return { 
      canFill: false, avgPrice: totalShares > 0 ? totalCost / totalShares : bestAsk,
      slippagePercent: 0, wouldSlip: true, depthAtBestAsk, totalDepth, noOrderBook: false
    };
  }
  
  const avgPrice = totalCost / totalShares;
  const slippagePercent = ((avgPrice - bestAsk) / bestAsk) * 100;
  
  return { 
    canFill: true, avgPrice, slippagePercent, wouldSlip: slippagePercent > 0.5,
    depthAtBestAsk, totalDepth, noOrderBook: false
  };
}

interface MultiBetSlipProps {
  selections: BetSelection[];
  maxBalance: number;
  onConfirm: (bets: Array<{ 
    selection: BetSelection; 
    effectiveAmount: number; 
    executionPrice: number;
    originalStake: number;
  }>) => Promise<{ success: boolean; error?: string; results?: Array<{ success: boolean; orderId?: string }> }>;
  onRemoveSelection: (id: string) => void;
  onUpdateSelection: (id: string, updates: Partial<BetSelection>) => void;
  onClose: () => void;
  onMinimize: () => void;
  onClearAll: () => void;
  isMinimized: boolean;
  isPending: boolean;
  getOrderBook?: (tokenId: string) => Promise<OrderBookData | null>;
  onSuccess?: () => void;
}

const PRICE_BUFFER = 0.03;

function getExecutionPrice(bet: BetSelection): number {
  const orderBook = bet.orderBook;
  if (orderBook && orderBook.bestAsk > 0 && orderBook.bestAsk < 0.99) {
    return Math.min(orderBook.bestAsk + PRICE_BUFFER, 0.99);
  }
  const fallbackPrice = bet.direction === "yes" ? bet.yesPrice : bet.noPrice;
  if (fallbackPrice && fallbackPrice > 0) {
    return Math.min(fallbackPrice + PRICE_BUFFER, 0.99);
  }
  return bet.odds > 0 ? Math.min(1 / bet.odds + PRICE_BUFFER, 0.99) : 0.5;
}

export function MultiBetSlip({
  selections,
  maxBalance,
  onConfirm,
  onRemoveSelection,
  onUpdateSelection,
  onClose,
  onMinimize,
  onClearAll,
  isMinimized,
  isPending,
  getOrderBook,
  onSuccess,
}: MultiBetSlipProps) {
  const [submissionStatus, setSubmissionStatus] = useState<SubmissionStatus>("idle");
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<CategorizedError | null>(null);
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  
  const { feeBps, configLoaded: feeConfigLoaded, isFeeCollectionEnabled } = useFeeCollection();
  const shouldApplyFee = feeConfigLoaded && isFeeCollectionEnabled;
  const feeMultiplier = shouldApplyFee ? (1 - feeBps / 10000) : 1;
  
  const totalStake = useMemo(() => 
    selections.reduce((sum, s) => sum + (parseFloat(s.stake) || 0), 0),
  [selections]);
  
  const totalFee = totalStake * (1 - feeMultiplier);
  const effectiveTotalStake = totalStake * feeMultiplier;
  
  const totalPotentialWin = useMemo(() => {
    return selections.reduce((sum, s) => {
      const stake = parseFloat(s.stake) || 0;
      const effectiveBet = stake * feeMultiplier;
      const execPrice = getExecutionPrice(s);
      const odds = execPrice > 0 ? 1 / execPrice : 2;
      return sum + effectiveBet * odds;
    }, 0);
  }, [selections, feeMultiplier]);
  
  const insufficientBalance = totalStake > maxBalance;
  const hasAnyBet = selections.length > 0;
  const allBetsValid = selections.every(s => {
    const stake = parseFloat(s.stake) || 0;
    const minShares = s.orderMinSize ?? 5;
    const execPrice = getExecutionPrice(s);
    const minOrderUSDC = minShares * (execPrice - PRICE_BUFFER);
    return stake >= minOrderUSDC && stake > 0;
  });
  
  const refreshSingleBet = useCallback(async (bet: BetSelection) => {
    if (!getOrderBook) return;
    
    const tokenId = bet.direction === "yes" ? bet.yesTokenId : bet.noTokenId;
    if (!tokenId) return;
    
    onUpdateSelection(bet.id, { isLoadingBook: true, bookError: null });
    
    try {
      const book = await getOrderBook(tokenId);
      onUpdateSelection(bet.id, { 
        orderBook: book, 
        isLoadingBook: false, 
        lastRefresh: Date.now(),
        bookError: book ? null : "Could not fetch order book"
      });
    } catch {
      onUpdateSelection(bet.id, { 
        isLoadingBook: false, 
        bookError: "Failed to fetch market data" 
      });
    }
  }, [getOrderBook, onUpdateSelection]);
  
  const refreshAllOdds = useCallback(async () => {
    if (!getOrderBook || selections.length === 0) return;
    
    setIsRefreshingAll(true);
    
    const refreshPromises = selections.map(async (bet) => {
      const tokenId = bet.direction === "yes" ? bet.yesTokenId : bet.noTokenId;
      if (!tokenId) return;
      
      onUpdateSelection(bet.id, { isLoadingBook: true, bookError: null });
      
      try {
        const book = await getOrderBook(tokenId);
        onUpdateSelection(bet.id, { 
          orderBook: book, 
          isLoadingBook: false, 
          lastRefresh: Date.now(),
          bookError: book ? null : "Could not fetch order book"
        });
      } catch {
        onUpdateSelection(bet.id, { 
          isLoadingBook: false, 
          bookError: "Failed to fetch market data" 
        });
      }
    });
    
    await Promise.all(refreshPromises);
    setIsRefreshingAll(false);
  }, [getOrderBook, selections, onUpdateSelection]);
  
  useEffect(() => {
    if (!isMinimized && selections.length > 0) {
      refreshAllOdds();
    }
  }, [isMinimized]);
  
  const handleConfirmAll = async () => {
    if (selections.length === 0 || totalStake <= 0) return;
    
    setSubmissionStatus("pending");
    setSubmissionError(null);
    setErrorDetails(null);
    
    try {
      const betsToSubmit = selections.map(s => ({
        selection: s,
        effectiveAmount: (parseFloat(s.stake) || 0) * feeMultiplier,
        executionPrice: getExecutionPrice(s),
        originalStake: parseFloat(s.stake) || 0,
      }));
      
      const result = await onConfirm(betsToSubmit);
      
      if (result.success) {
        setSubmissionStatus("success");
        onSuccess?.();
      } else {
        setSubmissionStatus("error");
        const categorized = categorizeError(result.error || "Order failed");
        setSubmissionError(categorized.userMessage);
        setErrorDetails(categorized);
      }
    } catch (err) {
      setSubmissionStatus("error");
      const categorized = categorizeError(err);
      setSubmissionError(categorized.userMessage);
      setErrorDetails(categorized);
    }
  };
  
  const handleRetry = () => {
    setSubmissionStatus("idle");
    setSubmissionError(null);
    setErrorDetails(null);
  };

  if (isMinimized) {
    return (
      <div 
        className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-900 border-t border-zinc-700 p-3 cursor-pointer hover-elevate"
        onClick={onMinimize}
        data-testid="betslip-minimized-bar"
      >
        <div className="max-w-[430px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-wild-brand/20 text-wild-brand rounded-full px-3 py-1 text-sm font-bold">
              {selections.length} {selections.length === 1 ? "Bet" : "Bets"}
            </div>
            <span className="text-zinc-400 text-sm">
              ${totalStake.toFixed(2)} stake
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-wild-gold font-mono font-bold">
              ${totalPotentialWin.toFixed(2)}
            </span>
            <ChevronUp className="w-5 h-5 text-zinc-400" />
          </div>
        </div>
      </div>
    );
  }

  if (submissionStatus === "success") {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
        <div className="w-full max-w-[430px] bg-zinc-900 border-t border-emerald-500/50 rounded-t-xl p-6 animate-slide-up">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-10 h-10 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white mb-1">
                {selections.length === 1 ? "Bet Placed!" : `${selections.length} Bets Placed!`}
              </h3>
              <p className="text-emerald-400 font-mono text-lg">${totalStake.toFixed(2)} total stake</p>
            </div>
            <div className="pt-2 space-y-3">
              <Button
                onClick={() => { onClearAll(); onClose(); }}
                size="lg"
                className="w-full bg-emerald-600 text-white font-bold"
                data-testid="button-success-done"
              >
                Done
              </Button>
              <Button
                onClick={() => { onClearAll(); onClose(); }}
                variant="ghost"
                size="sm"
                className="w-full text-zinc-400"
                data-testid="button-view-activity"
              >
                View in Activity <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (submissionStatus === "error") {
    const isWarning = errorDetails?.severity === "warning";
    const borderColor = isWarning ? "border-amber-500/50" : "border-red-500/50";
    const iconBgColor = isWarning ? "bg-amber-500/20" : "bg-red-500/20";
    const iconColor = isWarning ? "text-amber-400" : "text-red-400";
    
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
        <div className={`w-full max-w-[430px] bg-zinc-900 border-t ${borderColor} rounded-t-xl p-6 animate-slide-up`}>
          <div className="text-center space-y-4">
            <div className={`w-16 h-16 rounded-full ${iconBgColor} flex items-center justify-center mx-auto`}>
              {isWarning ? (
                <AlertTriangle className={`w-10 h-10 ${iconColor}`} />
              ) : (
                <XCircle className={`w-10 h-10 ${iconColor}`} />
              )}
            </div>
            <div>
              <h3 className="text-xl font-bold text-white mb-1">
                {submissionError || "Bet Failed"}
              </h3>
              {errorDetails?.actionable && (
                <p className="text-zinc-400 text-sm mt-2">{errorDetails.actionable}</p>
              )}
              {errorDetails?.category && (
                <div className="flex items-center justify-center gap-1 mt-3">
                  <Info className="w-3 h-3 text-zinc-500" />
                  <p className="text-zinc-500 text-xs font-mono">
                    {errorDetails.category.replace(/_/g, " ")}
                  </p>
                </div>
              )}
            </div>
            <div className="pt-2 space-y-3">
              <Button
                onClick={handleRetry}
                size="lg"
                className="w-full bg-wild-brand text-white font-bold"
                data-testid="button-retry-bet"
              >
                Try Again
              </Button>
              <Button
                onClick={onClose}
                variant="ghost"
                size="sm"
                className="w-full text-zinc-400"
                data-testid="button-cancel-bet"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-[430px] bg-zinc-900 border-t border-zinc-700 rounded-t-xl animate-slide-up max-h-[85vh] flex flex-col">
        <div className="flex justify-between items-center p-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <p className="text-xs text-zinc-500 uppercase tracking-wider">Bet Slip</p>
            <span className="bg-wild-brand/20 text-wild-brand rounded-full px-2 py-0.5 text-xs font-bold">
              {selections.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={refreshAllOdds}
              disabled={isRefreshingAll || isPending || submissionStatus === "pending"}
              className="text-zinc-400 hover:text-white"
              data-testid="button-refresh-all-odds"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshingAll ? "animate-spin" : ""}`} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onMinimize}
              disabled={isPending || submissionStatus === "pending"}
              className="text-zinc-400 hover:text-white"
              data-testid="button-minimize-betslip"
            >
              <ChevronUp className="w-5 h-5 rotate-180" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              disabled={isPending || submissionStatus === "pending"}
              className="text-zinc-400 hover:text-white"
              data-testid="button-close-betslip"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {selections.length === 0 ? (
            <div className="text-center py-8 text-zinc-500">
              <Plus className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No bets selected</p>
              <p className="text-xs mt-1">Tap on odds to add bets</p>
            </div>
          ) : (
            selections.map((bet) => (
              <BetCard
                key={bet.id}
                bet={bet}
                feeMultiplier={feeMultiplier}
                onUpdateStake={(stake) => onUpdateSelection(bet.id, { stake })}
                onRemove={() => onRemoveSelection(bet.id)}
                onRefresh={() => refreshSingleBet(bet)}
                disabled={isPending || submissionStatus === "pending"}
              />
            ))
          )}
        </div>

        {selections.length > 0 && (
          <div className="p-4 border-t border-zinc-800 space-y-3">
            <div className="bg-zinc-800/50 rounded-lg p-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Total Stake</span>
                <span className="font-mono font-bold text-white">${totalStake.toFixed(2)}</span>
              </div>
              {shouldApplyFee && totalFee > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">Platform Fee ({(feeBps / 100).toFixed(2)}%)</span>
                  <span className="font-mono text-zinc-500">-${totalFee.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Potential Win</span>
                <span className="font-mono font-bold text-wild-gold">${totalPotentialWin.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-zinc-500">Available Balance</span>
                <span className="font-mono text-zinc-400">${maxBalance.toFixed(2)} USDC</span>
              </div>
            </div>

            {insufficientBalance && (
              <div className="flex items-center gap-2 text-red-400 text-sm bg-red-400/10 rounded p-2">
                <AlertTriangle className="w-4 h-4" />
                <span>Insufficient USDC balance</span>
              </div>
            )}

            <Button
              onClick={handleConfirmAll}
              disabled={!hasAnyBet || !allBetsValid || insufficientBalance || isPending || submissionStatus === "pending"}
              size="lg"
              className="w-full bg-wild-brand text-white font-bold text-lg"
              data-testid="button-confirm-all-bets"
            >
              {submissionStatus === "pending" || isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                `Place ${selections.length} ${selections.length === 1 ? "Bet" : "Bets"} · $${totalStake.toFixed(2)}`
              )}
            </Button>

            <p className="text-[10px] text-zinc-600 text-center">
              All bets submitted in a single transaction
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

interface BetCardProps {
  bet: BetSelection;
  feeMultiplier: number;
  onUpdateStake: (stake: string) => void;
  onRemove: () => void;
  onRefresh: () => void;
  disabled: boolean;
}

function BetCard({ bet, feeMultiplier, onUpdateStake, onRemove, onRefresh, disabled }: BetCardProps) {
  const stakeNum = parseFloat(bet.stake) || 0;
  const effectiveBet = stakeNum * feeMultiplier;
  const execPrice = getExecutionPrice(bet);
  const marketOdds = execPrice > 0 ? 1 / execPrice : 2;
  const potentialWin = effectiveBet * marketOdds;
  const displayedOdds = stakeNum > 0 ? potentialWin / stakeNum : marketOdds;
  
  const minShares = bet.orderMinSize ?? 5;
  const priceForMin = execPrice - PRICE_BUFFER;
  const minOrderUSDC = minShares * (priceForMin > 0 ? priceForMin : 0.5);
  const isBelowMinimum = stakeNum > 0 && stakeNum < minOrderUSDC;
  
  const fillSimulation = useMemo((): FillSimulation => {
    const orderBook = bet.orderBook;
    if (!orderBook || !orderBook.asks || orderBook.asks.length === 0) {
      return { 
        canFill: false, avgPrice: execPrice, slippagePercent: 0, wouldSlip: false, 
        depthAtBestAsk: 0, totalDepth: 0, noOrderBook: true
      };
    }
    return simulateFill(stakeNum, orderBook.asks, orderBook.bestAsk);
  }, [bet.orderBook, stakeNum, execPrice]);
  
  const hasLiquidityWarning = stakeNum > 0 && (
    fillSimulation.noOrderBook || !fillSimulation.canFill || fillSimulation.wouldSlip
  );

  return (
    <div className="bg-zinc-800/50 rounded-lg p-3 space-y-3">
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0">
          <h4 className="font-bold text-white text-sm truncate">{bet.outcomeLabel}</h4>
          <p className="text-xs text-zinc-400 truncate">{bet.marketTitle}</p>
        </div>
        <div className="flex items-center gap-1 ml-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            disabled={disabled || bet.isLoadingBook}
            className="h-7 w-7 text-zinc-500 hover:text-white"
            data-testid={`button-refresh-${bet.id}`}
          >
            <RefreshCw className={`w-3 h-3 ${bet.isLoadingBook ? "animate-spin" : ""}`} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRemove}
            disabled={disabled}
            className="h-7 w-7 text-zinc-500 hover:text-red-400"
            data-testid={`button-remove-${bet.id}`}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {bet.isLoadingBook && (
        <div className="flex items-center gap-2 text-zinc-400 text-xs">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Fetching prices...</span>
        </div>
      )}

      {hasLiquidityWarning && !bet.isLoadingBook && (
        <div className="rounded p-2 bg-amber-500/10 border border-amber-500/30">
          <div className="flex items-center gap-1 text-amber-400 text-xs">
            <AlertTriangle className="w-3 h-3" />
            <span>{fillSimulation.noOrderBook ? "No order book" : "Low liquidity"}</span>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="flex-1">
          <Input
            type="number"
            value={bet.stake}
            onChange={(e) => onUpdateStake(e.target.value)}
            placeholder="0.00"
            className="bg-zinc-700 border-zinc-600 text-white text-sm font-mono h-9"
            min="0"
            step="1"
            disabled={disabled}
            data-testid={`input-stake-${bet.id}`}
          />
        </div>
        <div className="text-right">
          <p className="text-xs text-zinc-500">Odds</p>
          <p className="text-lg font-black font-mono text-wild-gold">{displayedOdds.toFixed(2)}</p>
        </div>
      </div>

      <div className="flex gap-1">
        {[5, 10, 25].map((amount) => (
          <button
            key={amount}
            onClick={() => onUpdateStake(amount.toString())}
            className="flex-1 py-1 text-xs font-mono bg-zinc-700 hover:bg-zinc-600 rounded text-zinc-300 transition-colors"
            disabled={disabled}
            data-testid={`button-quick-${amount}-${bet.id}`}
          >
            ${amount}
          </button>
        ))}
      </div>

      {isBelowMinimum && (
        <div className="flex items-center gap-1 text-amber-400 text-xs">
          <AlertTriangle className="w-3 h-3" />
          <span>Min ${minOrderUSDC.toFixed(2)}</span>
        </div>
      )}

      <div className="flex justify-between text-xs text-zinc-400">
        <span>Potential win</span>
        <span className="font-mono text-white">${potentialWin.toFixed(2)}</span>
      </div>
    </div>
  );
}
