import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Award, Activity, Wallet, History, Package, Coins, ArrowDownToLine, ArrowUpFromLine, RefreshCw, CheckCircle2, Copy, Check, HelpCircle, ChevronDown, ChevronUp, Loader2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { fetchPositions, fetchActivity, type PolymarketPosition, type PolymarketActivity } from "@/lib/polymarketOrder";
import { usePolymarketClient } from "@/hooks/usePolymarketClient";
import { useBridgeApi, getAddressTypeForChain, type SupportedAsset, type Transaction as BridgeTransaction } from "@/hooks/useBridgeApi";
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
  
  const { 
    withdrawUSDC, 
    redeemPositions,
    batchRedeemPositions,
  } = usePolymarketClient();
  
  const { 
    supportedAssets, 
    isLoadingAssets, 
    getChainOptions,
    createDeposit,
    createWithdrawal,
    getQuote,
    getTransactionStatus,
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

  useEffect(() => {
    if (safeAddress) {
      setBridgeTransactionsLoading(true);
      getTransactionStatus(safeAddress)
        .then(status => {
          if (status?.transactions) {
            setBridgeTransactions(status.transactions);
          }
        })
        .finally(() => setBridgeTransactionsLoading(false));
    }
  }, [safeAddress, getTransactionStatus]);

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
    
    if (safeAddress) {
      setBridgeTransactionsLoading(true);
      const status = await getTransactionStatus(safeAddress);
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
            <h3 className="text-xs font-bold text-zinc-400 tracking-wider">DEPOSIT</h3>
          </div>
          <div className="p-3 space-y-3">
            {isSafeDeployed && safeAddress ? (
              <>
                <div>
                  <label className="text-[10px] text-zinc-500 block mb-1">Deposit From</label>
                  <Select value={depositChain} onValueChange={handleDepositChainChange}>
                    <SelectTrigger className="w-full bg-zinc-950 border-zinc-800 text-sm" data-testid="select-deposit-chain">
                      <SelectValue placeholder="Select chain" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="polygon">
                        <span className="flex items-center gap-2">
                          <span className="w-4 h-4 rounded-full bg-purple-500 flex items-center justify-center text-[8px] font-bold text-white">P</span>
                          Polygon (Native)
                        </span>
                      </SelectItem>
                      {chainOptions.map((chain) => (
                        <SelectItem key={chain.chainId} value={chain.chainId}>
                          <span className="flex items-center gap-2">
                            <span className="w-4 h-4 rounded-full bg-zinc-600 flex items-center justify-center text-[8px] font-bold text-white">
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
                    <label className="text-[10px] text-zinc-500 block mb-1">Token</label>
                    <Select value={depositToken} onValueChange={setDepositToken}>
                      <SelectTrigger className="w-full bg-zinc-950 border-zinc-800 text-sm" data-testid="select-deposit-token">
                        <SelectValue placeholder="Select token" />
                      </SelectTrigger>
                      <SelectContent>
                        {getTokensForChain(depositChain).map((asset) => (
                          <SelectItem key={asset.token.address} value={asset.token.address}>
                            <span className="flex flex-col">
                              <span>{asset.token.symbol} - {asset.token.name}</span>
                              <span className="text-[9px] text-zinc-500 font-mono">
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
                    <div className="flex items-center justify-between bg-zinc-950 rounded p-2 border border-zinc-800">
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="text-[10px] text-zinc-500 mb-0.5">Deposit Address (Polygon)</span>
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
                    <p className="text-[10px] text-amber-400">
                      Send USDC.e only. Other tokens will be lost.
                    </p>
                  </>
                ) : isLoadingDepositAddresses ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-wild-trade" />
                    <span className="text-xs text-zinc-400 ml-2">Loading deposit address...</span>
                  </div>
                ) : getBridgeDepositAddress() ? (
                  <>
                    <div className="flex items-center justify-between bg-zinc-950 rounded p-2 border border-zinc-800">
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="text-[10px] text-zinc-500 mb-0.5">Bridge Deposit Address</span>
                        <span className="text-[11px] font-mono text-zinc-300 truncate" data-testid="text-bridge-deposit-address">
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
                          <Check className="w-3 h-3 text-wild-scout" />
                        ) : (
                          <Copy className="w-3 h-3 text-zinc-400" />
                        )}
                      </Button>
                    </div>
                    <div className="bg-wild-scout/10 border border-wild-scout/30 rounded p-2">
                      <p className="text-[10px] text-wild-scout">
                        Funds will be automatically bridged to USDC.e on Polygon and credited to your Prediction Wallet.
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-3">
                    <p className="text-xs text-zinc-400">Select a chain to get deposit address</p>
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
              <TabsTrigger 
                value="bridge" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-wild-gold data-[state=active]:bg-transparent data-[state=active]:text-wild-gold px-3 py-2 text-xs"
                data-testid="tab-bridge"
              >
                Bridge
                {bridgeTransactions.length > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-wild-gold/20 text-wild-gold">
                    {bridgeTransactions.length}
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

            {/* Bridge Tab - Shows bridge deposit/withdrawal history */}
            <TabsContent value="bridge" className="mt-0">
              <div className="divide-y divide-zinc-800/50">
                {bridgeTransactionsLoading ? (
                  <div className="p-4 text-center">
                    <RefreshCw className="w-6 h-6 text-zinc-600 mx-auto mb-2 animate-spin" />
                    <p className="text-xs text-zinc-500">Loading bridge history...</p>
                  </div>
                ) : bridgeTransactions.length === 0 ? (
                  <div className="p-4 text-center">
                    <ArrowUpFromLine className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                    <p className="text-xs text-zinc-500">No bridge transactions yet</p>
                    <p className="text-[10px] text-zinc-600 mt-1">Deposit or withdraw via bridge to see history</p>
                  </div>
                ) : (
                  bridgeTransactions.map((tx, i) => {
                    const isDeposit = tx.toChainId === "137";
                    const fromChainName = chainOptions.find(c => c.chainId === tx.fromChainId)?.chainName || tx.fromChainId;
                    const toChainName = chainOptions.find(c => c.chainId === tx.toChainId)?.chainName || (tx.toChainId === "137" ? "Polygon" : tx.toChainId);
                    const amount = parseFloat(tx.fromAmountBaseUnit) / 1e6;
                    const statusColor = tx.status === "COMPLETED" ? "text-wild-scout" : tx.status === "PROCESSING" ? "text-wild-gold" : "text-wild-trade";
                    const statusBg = tx.status === "COMPLETED" ? "bg-wild-scout/20" : tx.status === "PROCESSING" ? "bg-wild-gold/20" : "bg-wild-trade/20";
                    
                    return (
                      <div 
                        key={`${tx.txHash || i}-${tx.createdTimeMs}`} 
                        className="p-3 hover:bg-zinc-800/30 transition-colors"
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
                                isDeposit ? "bg-wild-scout/20 text-wild-scout" : "bg-wild-gold/20 text-wild-gold"
                              )}>
                                {isDeposit ? "DEPOSIT" : "WITHDRAW"}
                              </span>
                            </div>
                            <div className="text-xs text-white">
                              {fromChainName} → {toChainName}
                            </div>
                            {tx.txHash && (
                              <a 
                                href={`https://polygonscan.com/tx/${tx.txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] text-wild-trade hover:underline flex items-center gap-1 mt-1"
                              >
                                {tx.txHash.slice(0, 10)}...{tx.txHash.slice(-6)}
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <div className={cn(
                              "text-sm font-mono font-bold",
                              isDeposit ? "text-wild-scout" : "text-wild-gold"
                            )}>
                              {isDeposit ? "+" : "-"}${amount.toFixed(2)}
                            </div>
                            {tx.createdTimeMs && (
                              <div className="text-[10px] text-zinc-500">
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
          <div className="bg-zinc-900 border border-zinc-800 rounded-md overflow-hidden">
            <div className="p-3 border-b border-zinc-800 flex items-center gap-2">
              <ArrowDownToLine className="w-4 h-4 text-wild-gold" />
              <h3 className="text-xs font-bold text-zinc-400 tracking-wider">WITHDRAW</h3>
            </div>
            <div className="p-3 space-y-3">
              <div>
                <label className="text-[10px] text-zinc-500 block mb-1">Withdraw To</label>
                <Select value={withdrawChain} onValueChange={handleWithdrawChainChange}>
                  <SelectTrigger className="w-full bg-zinc-950 border-zinc-800 text-sm" data-testid="select-withdraw-chain">
                    <SelectValue placeholder="Select destination" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="polygon">
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 rounded-full bg-purple-500 flex items-center justify-center text-[8px] font-bold text-white">P</span>
                        Polygon (USDC.e)
                      </span>
                    </SelectItem>
                    {chainOptions.map((chain) => (
                      <SelectItem key={chain.chainId} value={chain.chainId}>
                        <span className="flex items-center gap-2">
                          <span className="w-4 h-4 rounded-full bg-zinc-600 flex items-center justify-center text-[8px] font-bold text-white">
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
                  <label className="text-[10px] text-zinc-500 block mb-1">Receive Token</label>
                  <Select value={withdrawToken} onValueChange={setWithdrawToken}>
                    <SelectTrigger className="w-full bg-zinc-950 border-zinc-800 text-sm" data-testid="select-withdraw-token">
                      <SelectValue placeholder="Select token" />
                    </SelectTrigger>
                    <SelectContent>
                      {getTokensForChain(withdrawChain).map((asset) => (
                        <SelectItem key={asset.token.address} value={asset.token.address}>
                          <span className="flex flex-col">
                            <span>{asset.token.symbol} - {asset.token.name}</span>
                            <span className="text-[9px] text-zinc-500 font-mono">
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
                <label className="text-[10px] text-zinc-500 block mb-1">Amount (USDC)</label>
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
                        className={`w-full bg-zinc-950 border rounded px-3 py-2 text-sm font-mono text-white placeholder:text-zinc-600 focus:outline-none ${isAmountBelowMin ? 'border-rose-500 focus:border-rose-500' : 'border-zinc-800 focus:border-wild-gold'}`}
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
                <label className="text-[10px] text-zinc-500 block mb-1">To Address</label>
                <input
                  type="text"
                  placeholder="0x..."
                  value={withdrawTo}
                  onChange={(e) => setWithdrawTo(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm font-mono text-white placeholder:text-zinc-600 focus:outline-none focus:border-wild-gold"
                  data-testid="input-withdraw-address"
                />
              </div>
              
              {withdrawChain !== "polygon" && withdrawAmount && withdrawTo && (
                <>
                  {withdrawQuote ? (
                    <div className="bg-zinc-950 border border-zinc-800 rounded p-2 space-y-1">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-zinc-500">Network Fee</span>
                        <span className="text-zinc-300">${withdrawQuote.fee}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-zinc-400">You'll Receive</span>
                        <span className="text-wild-scout font-mono">{withdrawQuote.output}</span>
                      </div>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full text-xs border-zinc-700"
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
                className="w-full bg-wild-gold border-wild-gold text-zinc-950"
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
                <div className="p-3 rounded-md bg-emerald-500/10 border border-emerald-500/30">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-4 h-4 text-wild-scout" />
                    <p className="text-xs text-wild-scout font-medium">
                      {withdrawChain === "polygon" ? "Withdrawal successful!" : "Bridge transfer initiated!"}
                    </p>
                  </div>
                  {withdrawMutation.data?.txHash && (
                    <div className="flex items-center gap-2 text-xs text-zinc-400">
                      <span>Tx:</span>
                      <a 
                        href={`https://polygonscan.com/tx/${withdrawMutation.data.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-wild-trade hover:underline flex items-center gap-1"
                      >
                        {withdrawMutation.data.txHash.slice(0, 10)}...{withdrawMutation.data.txHash.slice(-8)}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                  {withdrawChain !== "polygon" && (
                    <p className="text-xs text-zinc-400 mt-2">
                      Your funds are being bridged. They will arrive at your destination address shortly.
                    </p>
                  )}
                </div>
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
