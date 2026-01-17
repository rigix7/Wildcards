import { AlertTriangle, Copy, Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface DepositInstructionsProps {
  safeAddress: string;
  onClose?: () => void;
}

export function DepositInstructions({ safeAddress, onClose }: DepositInstructionsProps) {
  const [copied, setCopied] = useState(false);

  const copyAddress = async () => {
    await navigator.clipboard.writeText(safeAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs font-medium text-amber-400">Important: Polygon Network Only</p>
            <p className="text-[10px] text-amber-400/80 mt-1">
              Only send USDC.e on the Polygon network. Sending funds via any other network (Ethereum, Arbitrum, etc.) will result in permanent loss of funds.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-zinc-900 rounded-lg p-3 space-y-3">
        <div>
          <p className="text-[10px] text-zinc-500 mb-1">Your Deposit Address (Polygon)</p>
          <div className="flex items-center gap-2 bg-zinc-950 rounded p-2 border border-zinc-800">
            <code className="text-[11px] font-mono text-zinc-300 flex-1 break-all">
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
                <Copy className="w-3 h-3 text-zinc-400" />
              )}
            </Button>
          </div>
        </div>

        <div className="border-t border-zinc-800 pt-3">
          <p className="text-xs font-medium text-white mb-2">Recommended Deposit Methods</p>
          
          <div className="space-y-2">
            <div className="flex items-start gap-2 text-[10px]">
              <div className="w-4 h-4 rounded-full bg-wild-scout/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-wild-scout font-bold text-[8px]">1</span>
              </div>
              <div>
                <p className="text-zinc-300 font-medium">Exchange Withdrawal (Easiest)</p>
                <p className="text-zinc-500">
                  Withdraw USDC from Coinbase, Binance, or Kraken. Select "Polygon" as the network.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2 text-[10px]">
              <div className="w-4 h-4 rounded-full bg-wild-trade/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-wild-trade font-bold text-[8px]">2</span>
              </div>
              <div>
                <p className="text-zinc-300 font-medium">Bridge from Ethereum</p>
                <p className="text-zinc-500">
                  Use bridges like Hop, Across, or the official Polygon Bridge to move USDC from Ethereum.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-zinc-800 pt-3">
          <p className="text-xs font-medium text-white mb-2">Accepted Token</p>
          <div className="flex items-center gap-2 bg-zinc-950 rounded p-2 border border-zinc-800">
            <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
              <span className="text-[10px] font-bold text-white">$</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white font-medium">USDC.e (Bridged USDC)</p>
              <p className="text-[10px] text-zinc-500 font-mono break-all">
                0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174
              </p>
            </div>
          </div>
          <div className="mt-2 bg-amber-500/10 border border-amber-500/20 rounded p-2">
            <p className="text-[10px] text-amber-400">
              <span className="font-bold">This is the token contract address</span> - use it to add USDC.e to your wallet or verify on exchanges. Do NOT send funds to this address.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs font-medium text-red-400">Do NOT Send</p>
            <ul className="text-[10px] text-red-400/80 mt-1 space-y-0.5 list-disc list-inside">
              <li>Funds to the USDC.e token contract address above</li>
              <li>ETH, MATIC, or any other cryptocurrency</li>
              <li>USDC on Ethereum mainnet (use bridge first)</li>
              <li>USDT, DAI, or other stablecoins</li>
            </ul>
          </div>
        </div>
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
