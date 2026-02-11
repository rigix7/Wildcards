import { AlertTriangle, Copy, Check, ExternalLink, Info, Clock, Shield, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useState } from "react";

interface DepositInstructionsProps {
  safeAddress: string;
  onClose?: () => void;
}

export function DepositInstructions({ safeAddress }: DepositInstructionsProps) {
  const [copied, setCopied] = useState(false);

  const copyAddress = async () => {
    await navigator.clipboard.writeText(safeAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <Tabs defaultValue="polygon" className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-[var(--page-bg)]">
          <TabsTrigger value="polygon" data-testid="tab-polygon-deposit">
            Polygon Direct
          </TabsTrigger>
          <TabsTrigger value="bridge" data-testid="tab-bridge-deposit">
            Bridge (Multi-Chain)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="polygon" className="space-y-4 mt-4">
          <div className="bg-[var(--card-bg)] rounded-lg p-3 space-y-3">
            <div>
              <p className="text-[10px] text-[var(--text-muted)] mb-1">Your Deposit Address (Polygon)</p>
              <div className="flex items-center gap-2 bg-[var(--page-bg)] rounded p-2 border border-[var(--border-primary)]">
                <code className="text-[11px] font-mono text-[var(--text-secondary)] flex-1 break-all">
                  {safeAddress}
                </code>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={copyAddress}
                  className="w-7 h-7 flex-shrink-0"
                  data-testid="button-copy-deposit-address"
                >
                  {copied ? (
                    <Check className="w-3 h-3 text-wild-scout" />
                  ) : (
                    <Copy className="w-3 h-3 text-[var(--text-secondary)]" />
                  )}
                </Button>
              </div>
            </div>

            <div className="border-t border-[var(--border-primary)] pt-3">
              <p className="text-xs font-medium text-[var(--text-primary)] mb-2">How to Deposit</p>
              
              <div className="space-y-2">
                <div className="flex items-start gap-2 text-[10px]">
                  <div className="w-4 h-4 rounded-full bg-wild-scout/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-wild-scout font-bold text-[8px]">1</span>
                  </div>
                  <div>
                    <p className="text-[var(--text-secondary)] font-medium">Exchange Withdrawal (Recommended)</p>
                    <p className="text-[var(--text-muted)]">
                      Withdraw USDC from Coinbase, Binance, or Kraken. Select "Polygon" network.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2 text-[10px]">
                  <div className="w-4 h-4 rounded-full bg-wild-trade/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-wild-trade font-bold text-[8px]">2</span>
                  </div>
                  <div>
                    <p className="text-[var(--text-secondary)] font-medium">Wallet Transfer</p>
                    <p className="text-[var(--text-muted)]">
                      Send USDC.e from any Polygon wallet directly to your deposit address.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-[var(--border-primary)] pt-3">
              <p className="text-xs font-medium text-[var(--text-primary)] mb-2">Accepted Token</p>
              <div className="flex items-center gap-2 bg-[var(--page-bg)] rounded p-2 border border-[var(--border-primary)]">
                <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
                  <span className="text-[10px] font-bold text-[var(--text-primary)]">$</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[var(--text-primary)] font-medium">USDC.e (Bridged USDC)</p>
                  <p className="text-[10px] text-[var(--text-muted)] font-mono break-all">
                    0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
              <Clock className="w-3 h-3" />
              <span>Processing time: 1-5 minutes</span>
            </div>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-amber-400">Important: Polygon Network Only</p>
                <p className="text-[10px] text-amber-400/80 mt-1">
                  Only send USDC.e on the Polygon network. Funds sent on other networks cannot be recovered.
                </p>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="bridge" className="space-y-4 mt-4">
          <div className="bg-[var(--card-bg)] rounded-lg p-3 space-y-3">
            <div className="flex items-start gap-2">
              <Zap className="w-4 h-4 text-wild-trade flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-[var(--text-primary)]">Multi-Chain Bridge</p>
                <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">
                  Deposit from Ethereum, Solana, Arbitrum, Base, or Bitcoin. Funds are automatically converted to USDC.e on Polygon.
                </p>
              </div>
            </div>

            <div className="border-t border-[var(--border-primary)] pt-3">
              <p className="text-xs font-medium text-[var(--text-primary)] mb-2">How It Works</p>
              
              <div className="space-y-2">
                <div className="flex items-start gap-2 text-[10px]">
                  <div className="w-4 h-4 rounded-full bg-wild-scout/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-wild-scout font-bold text-[8px]">1</span>
                  </div>
                  <div>
                    <p className="text-[var(--text-secondary)] font-medium">Select Your Chain</p>
                    <p className="text-[var(--text-muted)]">
                      Choose the blockchain you want to deposit from in the deposit section.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2 text-[10px]">
                  <div className="w-4 h-4 rounded-full bg-wild-trade/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-wild-trade font-bold text-[8px]">2</span>
                  </div>
                  <div>
                    <p className="text-[var(--text-secondary)] font-medium">Get Your Deposit Address</p>
                    <p className="text-[var(--text-muted)]">
                      A unique bridge address will be generated for your wallet.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2 text-[10px]">
                  <div className="w-4 h-4 rounded-full bg-wild-gold/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-wild-gold font-bold text-[8px]">3</span>
                  </div>
                  <div>
                    <p className="text-[var(--text-secondary)] font-medium">Send Funds</p>
                    <p className="text-[var(--text-muted)]">
                      Send USDC (or supported token) to the bridge address. Funds are automatically bridged and credited to your Prediction Wallet.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-[var(--border-primary)] pt-3">
              <p className="text-xs font-medium text-[var(--text-primary)] mb-2">Supported Chains</p>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { name: "Ethereum", color: "bg-blue-500" },
                  { name: "Arbitrum", color: "bg-blue-400" },
                  { name: "Base", color: "bg-blue-600" },
                  { name: "Solana", color: "bg-purple-500" },
                  { name: "Bitcoin", color: "bg-orange-500" },
                  { name: "Optimism", color: "bg-red-500" },
                ].map((chain) => (
                  <div key={chain.name} className="flex items-center gap-1.5 bg-[var(--page-bg)] rounded px-2 py-1.5 border border-[var(--border-primary)]">
                    <div className={`w-2 h-2 rounded-full ${chain.color}`} />
                    <span className="text-[10px] text-[var(--text-secondary)]">{chain.name}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-[var(--border-primary)] pt-3 space-y-2">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-[var(--text-muted)] flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Processing Time
                </span>
                <span className="text-[var(--text-secondary)]">5-20 minutes (varies by chain)</span>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-[var(--text-muted)] flex items-center gap-1">
                  <Info className="w-3 h-3" />
                  Minimum Deposit
                </span>
                <span className="text-[var(--text-secondary)]">Varies by asset (see deposit section)</span>
              </div>
            </div>
          </div>

          <div className="bg-wild-scout/10 border border-wild-scout/30 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <Shield className="w-4 h-4 text-wild-scout mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-wild-scout">Bridge Security</p>
                <p className="text-[10px] text-wild-scout/80 mt-1">
                  The bridge is powered by Polymarket's official Bridge API, using battle-tested cross-chain infrastructure.
                </p>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs font-medium text-red-400">Important Warnings</p>
            <ul className="text-[10px] text-red-400/80 mt-1 space-y-0.5 list-disc list-inside">
              <li>Only send supported tokens on their correct networks</li>
              <li>Verify the network before sending - funds sent to wrong networks cannot be recovered</li>
              <li>We cannot recover lost or misdirected funds</li>
              <li>You are solely responsible for verifying addresses and network selection</li>
              <li>Check minimum deposit amounts before sending</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="bg-[var(--card-bg)] border border-[var(--border-primary)] rounded-lg p-3">
        <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
          <span className="font-medium text-[var(--text-secondary)]">Disclaimer:</span> By using this deposit service, you acknowledge that you understand the risks involved in cryptocurrency transactions. Wildcard is not responsible for any loss of funds due to user error, including but not limited to: sending unsupported tokens, using incorrect networks, sending to wrong addresses, or failing to meet minimum deposit requirements. All transactions are final and irreversible.
        </p>
      </div>

      <Button
        variant="outline"
        size="sm"
        className="w-full text-xs"
        onClick={() => window.open(`https://polygonscan.com/address/${safeAddress}`, "_blank")}
        data-testid="button-view-wallet-explorer"
      >
        View Wallet on PolygonScan
        <ExternalLink className="w-3 h-3 ml-1" />
      </Button>
    </div>
  );
}
