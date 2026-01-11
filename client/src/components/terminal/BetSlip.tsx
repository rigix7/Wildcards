import { useState } from "react";
import { X, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface BetSlipProps {
  marketTitle: string;
  outcomeLabel: string;
  odds: number;
  maxBalance: number;
  onConfirm: (stake: number) => void;
  onCancel: () => void;
  isPending: boolean;
}

export function BetSlip({
  marketTitle,
  outcomeLabel,
  odds,
  maxBalance,
  onConfirm,
  onCancel,
  isPending,
}: BetSlipProps) {
  const [stake, setStake] = useState<string>("10");
  const stakeNum = parseFloat(stake) || 0;
  const potentialWin = stakeNum * odds;
  const wildPoints = Math.floor(stakeNum);
  const insufficientBalance = stakeNum > maxBalance;
  
  const handleConfirm = () => {
    if (stakeNum > 0 && !insufficientBalance) {
      onConfirm(stakeNum);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-[430px] bg-zinc-900 border-t border-zinc-700 rounded-t-xl p-4 animate-slide-up">
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wider">Bet Slip</p>
            <h3 className="font-bold text-white text-lg">{outcomeLabel}</h3>
            <p className="text-xs text-zinc-400 mt-0.5">{marketTitle}</p>
          </div>
          <button
            onClick={onCancel}
            className="text-zinc-400 hover:text-white p-1"
            disabled={isPending}
            data-testid="button-close-betslip"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
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
                disabled={isPending}
                data-testid="input-stake"
              />
            </div>
            <div className="text-right">
              <p className="text-xs text-zinc-500">Odds</p>
              <p className="text-2xl font-black font-mono text-wild-gold">{odds.toFixed(2)}</p>
            </div>
          </div>

          <div className="flex gap-2">
            {[5, 10, 25, 50].map((amount) => (
              <button
                key={amount}
                onClick={() => setStake(amount.toString())}
                className="flex-1 py-2 text-sm font-mono bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300 transition-colors"
                disabled={isPending}
                data-testid={`button-quick-${amount}`}
              >
                ${amount}
              </button>
            ))}
          </div>

          <div className="bg-zinc-800/50 rounded-lg p-3 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">Potential Win</span>
              <span className="font-mono font-bold text-white">
                ${potentialWin.toFixed(2)}
              </span>
            </div>
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

          <Button
            onClick={handleConfirm}
            disabled={stakeNum <= 0 || insufficientBalance || isPending}
            className="w-full h-12 bg-wild-brand hover:bg-wild-brand/90 text-white font-bold text-lg"
            data-testid="button-confirm-bet"
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Placing Bet...
              </>
            ) : (
              `Place Bet · $${stakeNum.toFixed(2)}`
            )}
          </Button>

          <p className="text-[10px] text-zinc-600 text-center">
            Bets earn WILD points. Polymarket CLOB integration coming soon.
          </p>
        </div>
      </div>
    </div>
  );
}
