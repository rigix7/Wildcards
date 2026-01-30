import { X, Copy, ExternalLink, Wallet, Check, Shield, Loader2, ChevronLeft, HelpCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import type { Wallet as WalletType } from "@shared/schema";
import { DepositInstructions } from "./DepositInstructions";
import { useBridgeApi, getAddressTypeForChain } from "@/hooks/useBridgeApi";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function SafeAddressDisplay({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  const truncateAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const copyAddress = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center justify-between bg-zinc-900 rounded p-2 mt-2">
      <div className="flex flex-col">
        <span className="text-[10px] text-zinc-500 mb-0.5">Deposit Address</span>
        <span className="text-[11px] font-mono text-zinc-300">{truncateAddress(address)}</span>
      </div>
      <div className="flex items-center gap-1">
        <Button
          size="icon"
          variant="ghost"
          onClick={copyAddress}
          className="w-7 h-7"
          data-testid="button-copy-safe-address"
        >
          {copied ? (
            <Check className="w-3 h-3 text-wild-scout" />
          ) : (
            <Copy className="w-3 h-3 text-zinc-400" />
          )}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => window.open(`https://polygonscan.com/address/${address}`, "_blank")}
          className="w-7 h-7"
          data-testid="button-view-safe-explorer"
        >
          <ExternalLink className="w-3 h-3 text-zinc-400" />
        </Button>
      </div>
    </div>
  );
}

interface WalletDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  wallet: WalletType | null;
  isConnected: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  safeAddress?: string | null;
  isSafeDeployed?: boolean;
  isSafeDeploying?: boolean;
  onDeploySafe?: () => void;
  onRefreshBalance?: () => void;
  isRefreshingBalance?: boolean;
}

export function WalletDrawer({
  isOpen,
  onClose,
  wallet,
  isConnected,
  onConnect,
  onDisconnect,
  safeAddress,
  isSafeDeployed,
  isSafeDeploying,
  onDeploySafe,
  onRefreshBalance,
  isRefreshingBalance,
}: WalletDrawerProps) {
  const [showDepositInstructions, setShowDepositInstructions] = useState(false);
  const [depositChain, setDepositChain] = useState<string>("polygon");
  const [bridgeDepositAddresses, setBridgeDepositAddresses] = useState<{ evm: string; svm: string; btc: string } | null>(null);
  const [isLoadingDepositAddresses, setIsLoadingDepositAddresses] = useState(false);
  const [depositAddressCopied, setDepositAddressCopied] = useState(false);

  const { createDeposit, getChainOptions } = useBridgeApi();
  const chainOptions = getChainOptions();

  const fetchBridgeDepositAddresses = async () => {
    if (!safeAddress || bridgeDepositAddresses) return;
    
    setIsLoadingDepositAddresses(true);
    try {
      const result = await createDeposit({ address: safeAddress });
      if (result?.address) {
        setBridgeDepositAddresses(result.address);
        console.log("[WalletDrawer] Deposit addresses loaded:", result.address);
      }
    } finally {
      setIsLoadingDepositAddresses(false);
    }
  };

  const handleDepositChainChange = (chain: string) => {
    setDepositChain(chain);
    if (chain !== "polygon" && !bridgeDepositAddresses && safeAddress) {
      fetchBridgeDepositAddresses();
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

  useEffect(() => {
    if (!isOpen) {
      setDepositChain("polygon");
      setBridgeDepositAddresses(null);
    }
  }, [isOpen]);

  const formatBalance = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
        onClick={onClose}
      />
      <div className="fixed bottom-0 left-0 right-0 z-50 max-w-[430px] mx-auto animate-slide-up">
        <div className="bg-zinc-900 border-t border-zinc-800 rounded-t-2xl">
          <div className="flex items-center justify-between p-4 border-b border-zinc-800">
            {showDepositInstructions ? (
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setShowDepositInstructions(false)}
                  className="w-8 h-8"
                  data-testid="button-back-deposit"
                >
                  <ChevronLeft className="w-5 h-5" />
                </Button>
                <h2 className="font-bold text-white">How to Deposit</h2>
              </div>
            ) : (
              <h2 className="font-bold text-white">Wallet</h2>
            )}
            <Button
              size="icon"
              variant="ghost"
              onClick={() => {
                setShowDepositInstructions(false);
                onClose();
              }}
              data-testid="button-close-drawer"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
            {showDepositInstructions && safeAddress ? (
              <DepositInstructions safeAddress={safeAddress} />
            ) : isConnected && wallet ? (
              <>
                <div className="flex items-center justify-between bg-zinc-950 rounded-lg p-3 border border-zinc-800">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-wild-brand to-wild-trade flex items-center justify-center">
                      <Wallet className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white">Connected</div>
                      <div className="text-[11px] text-zinc-500">
                        {isSafeDeployed ? "Prediction Wallet Active" : "Wallet Ready"}
                      </div>
                    </div>
                  </div>
                  <div className="w-2 h-2 rounded-full bg-wild-scout animate-pulse" />
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 bg-zinc-950 rounded-lg border border-zinc-800">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-[10px] font-bold text-white">
                        $
                      </div>
                      <span className="text-sm text-zinc-300">USDC</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-white" data-testid="text-drawer-usdc">
                        ${formatBalance(wallet.usdcBalance)}
                      </span>
                      {onRefreshBalance && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={onRefreshBalance}
                          disabled={isRefreshingBalance}
                          className="w-6 h-6"
                          data-testid="button-refresh-balance"
                        >
                          <RefreshCw className={`w-3 h-3 text-zinc-400 ${isRefreshingBalance ? 'animate-spin' : ''}`} />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-between items-center p-3 bg-zinc-950 rounded-lg border border-zinc-800">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-wild-scout flex items-center justify-center text-[10px] font-bold text-zinc-950">
                        W
                      </div>
                      <span className="text-sm text-zinc-300">WILD</span>
                    </div>
                    <span className="font-mono font-bold text-white" data-testid="text-drawer-wild">
                      {formatBalance(wallet.wildBalance)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center p-3 bg-gradient-to-r from-wild-brand/10 to-wild-trade/10 rounded-lg border border-zinc-800">
                    <span className="text-sm text-zinc-300">Total Value</span>
                    <span className="font-mono font-bold text-lg text-white" data-testid="text-drawer-total">
                      ${formatBalance(wallet.totalValue)}
                    </span>
                  </div>

                  <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-wild-trade" />
                        <span className="text-sm font-medium text-white">Prediction Wallet</span>
                      </div>
                      {isSafeDeployed ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-wild-scout/20 text-wild-scout font-medium">
                          Active
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-medium">
                          Activation Required
                        </span>
                      )}
                    </div>
                    {isSafeDeployed && safeAddress ? (
                      <div className="space-y-2 mt-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-zinc-500 whitespace-nowrap">Deposit from:</span>
                          <Select value={depositChain} onValueChange={handleDepositChainChange}>
                            <SelectTrigger className="h-7 text-[11px] bg-zinc-900 border-zinc-700 flex-1" data-testid="select-drawer-deposit-chain">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-zinc-700">
                              <SelectItem value="polygon" className="text-[11px]">Polygon (Native)</SelectItem>
                              {chainOptions.map((chain) => (
                                <SelectItem key={chain.chainId} value={chain.chainId} className="text-[11px]">
                                  {chain.chainName}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        
                        {depositChain === "polygon" ? (
                          <SafeAddressDisplay address={safeAddress} />
                        ) : isLoadingDepositAddresses ? (
                          <div className="flex items-center justify-center py-3">
                            <Loader2 className="w-4 h-4 animate-spin text-wild-trade" />
                            <span className="text-[10px] text-zinc-400 ml-2">Loading...</span>
                          </div>
                        ) : getBridgeDepositAddress() ? (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between bg-zinc-900 rounded p-2">
                              <div className="flex flex-col flex-1 min-w-0">
                                <span className="text-[10px] text-zinc-500 mb-0.5">Bridge Deposit Address</span>
                                <span className="text-[11px] font-mono text-zinc-300 truncate" data-testid="text-drawer-bridge-address">
                                  {getBridgeDepositAddress()}
                                </span>
                              </div>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="w-7 h-7 shrink-0"
                                onClick={() => {
                                  const addr = getBridgeDepositAddress();
                                  if (addr) {
                                    navigator.clipboard.writeText(addr);
                                    setDepositAddressCopied(true);
                                    setTimeout(() => setDepositAddressCopied(false), 2000);
                                  }
                                }}
                                data-testid="button-copy-drawer-bridge-address"
                              >
                                {depositAddressCopied ? (
                                  <Check className="w-3 h-3 text-wild-scout" />
                                ) : (
                                  <Copy className="w-3 h-3 text-zinc-400" />
                                )}
                              </Button>
                            </div>
                            <p className="text-[10px] text-wild-scout">
                              Funds bridged automatically to Polygon.
                            </p>
                            <p className="text-[10px] text-zinc-500">
                              Min deposit varies by asset. See "How to Deposit" for details.
                            </p>
                          </div>
                        ) : null}
                        
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full text-xs border-zinc-700"
                          onClick={() => setShowDepositInstructions(true)}
                          data-testid="button-how-to-deposit"
                        >
                          <HelpCircle className="w-3 h-3 mr-1" />
                          How to Deposit
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full mt-2 text-xs border-wild-trade/30 text-wild-trade"
                        onClick={onDeploySafe}
                        disabled={isSafeDeploying}
                        data-testid="button-activate-wallet"
                      >
                        {isSafeDeploying ? (
                          <>
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            Activating...
                          </>
                        ) : (
                          "Activate Wallet"
                        )}
                      </Button>
                    )}
                    <p className="text-[10px] text-zinc-600 mt-2">
                      {isSafeDeployed 
                        ? "Gasless trading enabled. Deposit USDC.e (Polygon) to start."
                        : "One-time activation for gasless trading on Polymarket"}
                    </p>
                  </div>
                </div>

                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={onDisconnect}
                  data-testid="button-disconnect"
                >
                  Disconnect
                </Button>
              </>
            ) : (
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-4">
                  <Wallet className="w-8 h-8 text-zinc-500" />
                </div>
                <h3 className="font-bold text-white mb-2">Connect Wallet</h3>
                <p className="text-sm text-zinc-500 mb-6">
                  Connect your wallet to start predicting
                </p>
                <Button
                  className="w-full bg-wild-brand text-zinc-950 font-bold"
                  onClick={onConnect}
                  data-testid="button-connect-wallet"
                >
                  Connect with Privy
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
