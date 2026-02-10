import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { X, AlertTriangle, Loader2, RefreshCw, CheckCircle2, XCircle, ArrowRight, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { OrderBookData } from "@/hooks/usePolymarketClient";
import { categorizeError, type CategorizedError } from "@/lib/polymarketErrors";
import useFeeCollection from "@/hooks/useFeeCollection";

type SubmissionStatus = "idle" | "pending" | "success" | "error";

// Format USDC amounts with appropriate precision
// For amounts < $0.01, show up to 4 decimals to display small fees accurately
// For larger amounts, show standard 2 decimals
function formatUSDC(amount: number, options?: { minDecimals?: number; maxDecimals?: number }): string {
  const { minDecimals = 2, maxDecimals = 4 } = options || {};
  
  // For very small amounts (fees), show more precision
  if (amount > 0 && amount < 0.01) {
    return amount.toFixed(maxDecimals).replace(/\.?0+$/, '') || '0.00';
  }
  
  // For amounts that would round to different values, show more precision
  const rounded2 = Math.round(amount * 100) / 100;
  const diff = Math.abs(amount - rounded2);
  if (diff >= 0.005) {
    // Amount differs significantly from 2-decimal display, show more precision
    return amount.toFixed(maxDecimals).replace(/0+$/, '').replace(/\.$/, '');
  }
  
  return amount.toFixed(minDecimals);
}

// Simulate filling an order through multiple price levels
// Returns fill simulation with total available depth across all levels
interface FillSimulation {
  canFill: boolean;
  avgPrice: number;
  slippagePercent: number;
  wouldSlip: boolean;
  depthAtBestAsk: number;
  totalDepth: number;       // Total $ available across all ask levels
  noOrderBook: boolean;     // True if order book has no asks
}

function simulateFill(
  stakeUSDC: number,
  asks: { price: number; size: number }[],
  bestAsk: number
): FillSimulation {
  // Handle missing or empty order book
  if (!asks || asks.length === 0) {
    return { 
      canFill: false, 
      avgPrice: bestAsk, 
      slippagePercent: 0, 
      wouldSlip: false, 
      depthAtBestAsk: 0,
      totalDepth: 0,
      noOrderBook: true
    };
  }
  
  if (stakeUSDC <= 0) {
    // No stake entered yet - don't show warning
    const totalDepth = asks.reduce((sum, ask) => sum + ask.size * ask.price, 0);
    return { 
      canFill: true, 
      avgPrice: bestAsk, 
      slippagePercent: 0, 
      wouldSlip: false, 
      depthAtBestAsk: asks[0].size * asks[0].price,
      totalDepth,
      noOrderBook: false
    };
  }
  
  // Calculate depth at bestAsk price level (in USDC)
  const depthAtBestAsk = asks[0].size * asks[0].price;
  
  // Calculate total depth across all levels
  const totalDepth = asks.reduce((sum, ask) => sum + ask.size * ask.price, 0);
  
  // If stake fits entirely at bestAsk, no slippage
  if (stakeUSDC <= depthAtBestAsk) {
    return { 
      canFill: true, 
      avgPrice: bestAsk, 
      slippagePercent: 0, 
      wouldSlip: false, 
      depthAtBestAsk,
      totalDepth,
      noOrderBook: false
    };
  }
  
  // Walk through ask levels to simulate fill
  let remaining = stakeUSDC;
  let totalCost = 0;
  let totalShares = 0;
  
  for (const ask of asks) {
    if (remaining <= 0) break;
    
    const levelLiquidity = ask.size * ask.price; // $ available at this level
    const fillAmount = Math.min(remaining, levelLiquidity);
    const sharesBought = fillAmount / ask.price;
    
    totalCost += fillAmount;
    totalShares += sharesBought;
    remaining -= fillAmount;
  }
  
  // If we couldn't fill the entire order
  if (remaining > 0) {
    return { 
      canFill: false, 
      avgPrice: totalShares > 0 ? totalCost / totalShares : bestAsk,
      slippagePercent: 0,
      wouldSlip: true,
      depthAtBestAsk,
      totalDepth,
      noOrderBook: false
    };
  }
  
  const avgPrice = totalCost / totalShares;
  const slippagePercent = ((avgPrice - bestAsk) / bestAsk) * 100;
  
  return { 
    canFill: true, 
    avgPrice, 
    slippagePercent, 
    wouldSlip: slippagePercent > 0.5, // Consider > 0.5% as meaningful slippage
    depthAtBestAsk,
    totalDepth,
    noOrderBook: false
  };
}

interface BetSlipProps {
  marketTitle: string;
  outcomeLabel: string;
  odds: number;
  maxBalance: number;
  onConfirm: (stake: number, direction: "yes" | "no", effectiveOdds: number, executionPrice: number, originalStake?: number) => Promise<{ success: boolean; error?: string; orderId?: string }>;
  onCancel: () => void;
  isPending: boolean;
  marketType?: string;
  outcomeLabels?: [string, string];
  initialDirection?: "yes" | "no";
  yesPrice?: number;
  noPrice?: number;
  orderMinSize?: number;
  yesTokenId?: string;
  noTokenId?: string;
  getOrderBook?: (tokenId: string) => Promise<OrderBookData | null>;
  onSuccess?: () => void;
  question?: string;
  isSoccer3Way?: boolean;
}

export function BetSlip({
  marketTitle,
  outcomeLabel,
  odds,
  maxBalance,
  onConfirm,
  onCancel,
  isPending,
  marketType,
  outcomeLabels,
  initialDirection = "yes",
  yesPrice,
  noPrice,
  orderMinSize,
  yesTokenId,
  noTokenId,
  getOrderBook,
  onSuccess,
  question,
  isSoccer3Way = false,
}: BetSlipProps) {
  const [stake, setStake] = useState<string>("10");
  const [betDirection, setBetDirection] = useState<"yes" | "no">(initialDirection);
  const [orderBook, setOrderBook] = useState<OrderBookData | null>(null);
  const [isLoadingBook, setIsLoadingBook] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);
  const [submissionStatus, setSubmissionStatus] = useState<SubmissionStatus>("idle");
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<CategorizedError | null>(null);
  const [confirmedStake, setConfirmedStake] = useState<number>(0);
  
  // Safety guard: track last fetched token to prevent duplicate fetches
  const lastFetchedTokenRef = useRef<string | null>(null);
  // Retry counter to trigger re-fetch when user clicks refresh
  const [retryCounter, setRetryCounter] = useState(0);
  
  // Fee collection config - wait for it to load before calculating adjusted odds
  const { feeBps, isFeeCollectionEnabled, configLoaded: feeConfigLoaded } = useFeeCollection();
  
  // Only apply fee deduction once config is loaded and enabled
  const shouldApplyFee = feeConfigLoaded && isFeeCollectionEnabled;
  
  // Allow manual retry by resetting the ref AND triggering a re-render
  const retryOrderBook = useCallback(() => {
    lastFetchedTokenRef.current = null;
    setRetryCounter(c => c + 1);
  }, []);
  
  const stakeNum = parseFloat(stake) || 0;
  
  // Calculate effective bet amount after fee deduction
  // Fee is taken from the stake, so user's actual bet is reduced
  // Only apply once config is loaded to avoid showing wrong odds initially
  const feeMultiplier = shouldApplyFee ? (1 - feeBps / 10000) : 1;
  const effectiveBetAmount = stakeNum * feeMultiplier;
  const feeAmount = stakeNum - effectiveBetAmount;
  
  // For match-winner markets, each outcome has its own token
  // Query the order book for the selected outcome's token
  const currentTokenId = betDirection === "yes" ? yesTokenId : noTokenId;
  
  // Fetch order book for the selected outcome's token
  // Only fetch if tokenId changed since last fetch (prevents infinite loops)
  useEffect(() => {
    if (!getOrderBook || !currentTokenId) {
      setOrderBook(null);
      return;
    }
    
    // Safety guard: skip if already fetched for this token or currently loading
    if (lastFetchedTokenRef.current === currentTokenId || isLoadingBook) {
      return;
    }
    
    const fetchBook = async () => {
      setIsLoadingBook(true);
      setBookError(null);
      
      try {
        const book = await getOrderBook(currentTokenId);
        setOrderBook(book);
        setLastFetchTime(Date.now());
        // Only mark as fetched AFTER success
        lastFetchedTokenRef.current = currentTokenId;
        
        if (!book) {
          setBookError("Could not fetch order book");
          // Allow retry on null response
          lastFetchedTokenRef.current = null;
        }
      } catch (err) {
        console.error("Failed to fetch order book:", err);
        setBookError("Failed to fetch market data");
        setOrderBook(null);
        // Clear ref on error to allow retry
        lastFetchedTokenRef.current = null;
      } finally {
        setIsLoadingBook(false);
      }
    };
    
    fetchBook();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getOrderBook, currentTokenId, betDirection, retryCounter]);
  
  // Calculate the execution price from order book
  // Using 3% buffer to ensure we cross the spread and match against existing orders
  const PRICE_BUFFER = 0.03;
  
  const getExecutionPrice = (): number => {
    // For match-winner markets, each outcome has its own order book
    // Use bestAsk directly from the selected outcome's order book
    if (orderBook && orderBook.bestAsk > 0 && orderBook.bestAsk < 0.99) {
      return Math.min(orderBook.bestAsk + PRICE_BUFFER, 0.99);
    }
    // Fallback to passed-in prices for the selected direction
    const fallbackPrice = betDirection === "yes" ? yesPrice : noPrice;
    if (fallbackPrice && fallbackPrice > 0) {
      return Math.min(fallbackPrice + PRICE_BUFFER, 0.99);
    }
    // Last resort: calculate from odds
    return odds > 0 ? Math.min(1 / odds + PRICE_BUFFER, 0.99) : 0.5;
  };
  
  const executionPrice = getExecutionPrice();
  const marketOdds = executionPrice > 0 ? 1 / executionPrice : 2;
  
  // Potential win is based on effective bet amount (after fee deduction)
  const potentialWin = effectiveBetAmount * marketOdds;
  // Display adjusted odds that show true return relative to user's stake
  const displayedOdds = stakeNum > 0 ? potentialWin / stakeNum : marketOdds;
  const wildPoints = Math.floor(stakeNum);
  const insufficientBalance = stakeNum > maxBalance;
  
  // Minimum order validation
  // orderMinSize is in shares, so convert to USDC using order book bestAsk
  const minShares = orderMinSize ?? 5; // Default Polymarket minimum is 5 shares
  
  // Use bestAsk from the selected outcome's order book (without buffer for accurate minimum)
  const priceForMinCalc = (orderBook?.bestAsk && orderBook.bestAsk > 0 && orderBook.bestAsk < 0.99)
    ? orderBook.bestAsk
    : executionPrice;
  const minOrderUSDC = minShares * priceForMinCalc;
  const isBelowMinimum = stakeNum > 0 && stakeNum < minOrderUSDC;
  
  // Smart liquidity analysis - only warn if user's stake would cause slippage
  const fillSimulation = useMemo((): FillSimulation => {
    if (!orderBook || !orderBook.asks || orderBook.asks.length === 0) {
      // No order book data - show warning only if user has entered a stake
      return { 
        canFill: false, 
        avgPrice: executionPrice, 
        slippagePercent: 0, 
        wouldSlip: false, 
        depthAtBestAsk: 0,
        totalDepth: 0,
        noOrderBook: true
      };
    }
    return simulateFill(stakeNum, orderBook.asks, orderBook.bestAsk);
  }, [orderBook, stakeNum, executionPrice]);
  
  // Only show liquidity warning if:
  // 1. User has entered a stake AND
  // 2. Either no order book, can't fully fill, or would experience slippage
  const hasLiquidityWarning = stakeNum > 0 && (
    fillSimulation.noOrderBook || 
    !fillSimulation.canFill || 
    fillSimulation.wouldSlip
  );
  
  // Check if odds are stale (more than 30 seconds old)
  // Use state to trigger re-renders for stale check
  const STALE_THRESHOLD_MS = 30000;
  const [currentTime, setCurrentTime] = useState(Date.now());
  
  // Update currentTime every 10 seconds to check staleness
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 10000);
    return () => clearInterval(interval);
  }, []);
  
  const isOddsStale = lastFetchTime > 0 && (currentTime - lastFetchTime) > STALE_THRESHOLD_MS;
  
  // Determine button labels based on market type or custom outcomeLabels
  const getDirectionLabels = () => {
    if (outcomeLabels && outcomeLabels[0] && outcomeLabels[1]) {
      return { yes: outcomeLabels[0].toUpperCase(), no: outcomeLabels[1].toUpperCase() };
    }
    if (marketType === "totals") {
      return { yes: "OVER", no: "UNDER" };
    }
    return { yes: "YES", no: "NO" };
  };
  
  const labels = getDirectionLabels();
  
  const handleConfirm = async () => {
    if (stakeNum <= 0) return;
    
    // Auto-refresh stale odds before placing bet
    if (isOddsStale && getOrderBook && currentTokenId) {
      console.log("[BetSlip] Odds are stale, refreshing before bet...");
      setIsLoadingBook(true);
      try {
        const freshBook = await getOrderBook(currentTokenId);
        if (freshBook) {
          setOrderBook(freshBook);
          setLastFetchTime(Date.now());
          lastFetchedTokenRef.current = currentTokenId;
        }
      } catch (err) {
        console.warn("[BetSlip] Failed to refresh stale odds:", err);
      } finally {
        setIsLoadingBook(false);
      }
    }
    
    setSubmissionStatus("pending");
    setSubmissionError(null);
    setErrorDetails(null);
    setConfirmedStake(stakeNum);
    
    try {
      // Pass the effective bet amount (after fee deduction) to the order
      // Also pass original stake for fee calculation
      const result = await onConfirm(effectiveBetAmount, betDirection, displayedOdds, executionPrice, stakeNum);
      
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

  // Success Panel
  if (submissionStatus === "success") {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
        <div className="w-full max-w-[430px] bg-zinc-900 border-t border-emerald-500/50 rounded-t-xl p-6 animate-slide-up">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-10 h-10 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white mb-1">Bet Placed!</h3>
              <p className="text-emerald-400 font-mono text-lg">${confirmedStake.toFixed(2)} on {outcomeLabel}</p>
              <p className="text-zinc-400 text-sm mt-2">{marketTitle}</p>
            </div>
            <div className="pt-2 space-y-3">
              <Button
                onClick={onCancel}
                size="lg"
                className="w-full bg-emerald-600 text-white font-bold"
                data-testid="button-success-done"
              >
                Done
              </Button>
              <Button
                onClick={onCancel}
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

  // Error Panel
  if (submissionStatus === "error") {
    const isWarning = errorDetails?.severity === "warning";
    const borderColor = isWarning ? "border-amber-500/50" : "border-red-500/50";
    const iconBgColor = isWarning ? "bg-amber-500/20" : "bg-red-500/20";
    const iconColor = isWarning ? "text-amber-400" : "text-red-400";
    const textColor = isWarning ? "text-amber-400" : "text-red-400";
    
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
                onClick={onCancel}
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
      <div className="w-full max-w-[430px] bg-zinc-900 border-t border-zinc-700 rounded-t-xl p-4 animate-slide-up">
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wider">Bet Slip</p>
            <h3 className="font-bold text-white text-lg">
              {outcomeLabel} {isSoccer3Way && <span className={betDirection === "yes" ? "text-wild-scout" : "text-wild-brand"}>({labels[betDirection]})</span>}
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">{marketTitle}</p>
            {question && (
              <p className="text-xs text-zinc-500 mt-1 italic">{question}</p>
            )}
          </div>
          <button
            onClick={onCancel}
            className="text-zinc-400 hover:text-white p-1"
            disabled={isPending || submissionStatus === "pending"}
            data-testid="button-close-betslip"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Direction Selection - Only show for soccer 3-way markets where Yes/No makes sense */}
          {isSoccer3Way && (
            <div className="flex gap-2">
              <button
                onClick={() => setBetDirection("yes")}
                className={`flex-1 py-3 rounded-lg font-bold text-sm transition-all ${
                  betDirection === "yes"
                    ? "bg-wild-scout text-white border-2 border-wild-scout"
                    : "bg-zinc-800 text-zinc-400 border-2 border-zinc-700 hover:border-zinc-600"
                }`}
                disabled={isPending || isLoadingBook || submissionStatus === "pending"}
                data-testid="button-direction-yes"
              >
                {labels.yes}
              </button>
              <button
                onClick={() => setBetDirection("no")}
                className={`flex-1 py-3 rounded-lg font-bold text-sm transition-all ${
                  betDirection === "no"
                    ? "bg-wild-brand text-white border-2 border-wild-brand"
                    : "bg-zinc-800 text-zinc-400 border-2 border-zinc-700 hover:border-zinc-600"
                }`}
                disabled={isPending || isLoadingBook || submissionStatus === "pending"}
                data-testid="button-direction-no"
              >
                {labels.no}
              </button>
            </div>
          )}

          {/* Order Book Status */}
          {isLoadingBook && (
            <div className="flex items-center justify-center gap-2 text-zinc-400 text-sm py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Fetching live prices...</span>
            </div>
          )}

          {/* Smart Liquidity Warning - shown for no order book, insufficient depth, or slippage */}
          {hasLiquidityWarning && !isLoadingBook && (
            <div className="rounded-lg p-3 space-y-1 bg-amber-500/10 border border-amber-500/30">
              <div className="flex items-center gap-2 text-amber-400 text-sm font-medium">
                <AlertTriangle className="w-4 h-4" />
                <span>{fillSimulation.noOrderBook ? "No Order Book" : "Liquidity Warning"}</span>
              </div>
              <div className="text-xs text-amber-400/80 space-y-0.5">
                {fillSimulation.noOrderBook ? (
                  <p>Order book data unavailable - order may not fill at expected price</p>
                ) : !fillSimulation.canFill ? (
                  <p>Order too large - only ${fillSimulation.totalDepth.toFixed(0)} total available (${fillSimulation.depthAtBestAsk.toFixed(0)} at best price)</p>
                ) : fillSimulation.slippagePercent > 0 ? (
                  <p>Your ${stakeNum} bet will fill at avg price ${fillSimulation.avgPrice.toFixed(3)} (+{fillSimulation.slippagePercent.toFixed(1)}% slippage from ${orderBook?.bestAsk.toFixed(3)})</p>
                ) : (
                  <p>Large order may experience price impact</p>
                )}
              </div>
            </div>
          )}

          {bookError && !isLoadingBook && (
            <div className="flex items-center justify-between text-amber-400 text-sm bg-amber-400/10 rounded p-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                <span>{bookError}</span>
              </div>
              <button
                onClick={retryOrderBook}
                className="p-1 hover:bg-amber-400/20 rounded"
                data-testid="button-refresh-book"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="text-xs text-zinc-500 mb-1 block">Stake (USDC)</label>
              <Input
                type="number"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
                placeholder="0.00"
                className="bg-zinc-800 border-zinc-700 text-white text-lg font-mono h-12"
                min="0"
                step="1"
                disabled={isPending || submissionStatus === "pending"}
                data-testid="input-stake"
              />
            </div>
            <div className="text-right flex items-start gap-2">
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-xs text-zinc-500">Odds</p>
                  {isOddsStale && !isLoadingBook && (
                    <span className="text-[10px] text-amber-400 animate-pulse" title="Odds may be outdated">stale</span>
                  )}
                </div>
                <p className={`text-2xl font-black font-mono ${isOddsStale ? 'text-wild-gold/70' : 'text-wild-gold'}`}>{displayedOdds.toFixed(2)}</p>
                {orderBook && (
                  <p className="text-[10px] text-zinc-500">
                    @ ${executionPrice.toFixed(2)}
                  </p>
                )}
              </div>
              <button
                onClick={retryOrderBook}
                disabled={isLoadingBook || submissionStatus === "pending"}
                className={`mt-1 p-1.5 rounded transition-colors disabled:opacity-50 ${
                  isOddsStale 
                    ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30' 
                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-wild-gold'
                }`}
                title={isOddsStale ? "Refresh stale odds" : "Refresh odds"}
                data-testid="button-refresh-odds"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingBook ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <div className="flex gap-2">
            {[5, 10, 25, 50].map((amount) => (
              <button
                key={amount}
                onClick={() => setStake(amount.toString())}
                className="flex-1 py-2 text-sm font-mono bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300 transition-colors"
                disabled={isPending || submissionStatus === "pending"}
                data-testid={`button-quick-${amount}`}
              >
                ${amount}
              </button>
            ))}
            <button
              onClick={() => setStake((Math.floor(maxBalance * 100) / 100).toString())}
              className="flex-1 py-2 text-sm font-bold bg-wild-gold/20 hover:bg-wild-gold/30 rounded text-wild-gold transition-colors border border-wild-gold/30"
              disabled={isPending || maxBalance <= 0 || submissionStatus === "pending"}
              data-testid="button-quick-max"
            >
              MAX
            </button>
          </div>

          <div className="bg-zinc-800/50 rounded-lg p-3 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">Potential Win</span>
              <span className="font-mono font-bold text-white">
                ${potentialWin.toFixed(2)}
              </span>
            </div>
            {shouldApplyFee && feeAmount > 0 && (
              <>
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">Platform Fee ({(feeBps / 100).toFixed(2)}%)</span>
                  <span className="font-mono text-zinc-500">-${formatUSDC(feeAmount)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">Your Bet Amount</span>
                  <span className="font-mono text-zinc-400">${formatUSDC(effectiveBetAmount)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">WILD Points Earned</span>
              <span className="font-mono text-wild-gold">+{wildPoints} WILD</span>
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
          
          {isBelowMinimum && !insufficientBalance && (
            <div className="flex items-center gap-2 text-amber-400 text-sm bg-amber-400/10 rounded p-2">
              <AlertTriangle className="w-4 h-4" />
              <span>Minimum bet is ${minOrderUSDC.toFixed(2)} USDC ({minShares} shares)</span>
            </div>
          )}

          <Button
            onClick={handleConfirm}
            disabled={stakeNum <= 0 || isPending || isLoadingBook || isBelowMinimum || submissionStatus === "pending"}
            size="lg"
            className="w-full bg-wild-brand text-white font-bold text-lg"
            data-testid="button-confirm-bet"
          >
            {submissionStatus === "pending" || isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Submitting to Polymarket...
              </>
            ) : isLoadingBook ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Loading...
              </>
            ) : (
              `Place Bet · $${stakeNum.toFixed(2)}`
            )}
          </Button>

          <p className="text-[10px] text-zinc-600 text-center">
            Bets earn WILD points. Orders submitted to Polymarket CLOB.
          </p>
        </div>
      </div>
    </div>
  );
}
