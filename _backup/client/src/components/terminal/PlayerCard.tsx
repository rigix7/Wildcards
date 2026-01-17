import { TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Player } from "@shared/schema";

interface PlayerCardProps {
  player: Player;
  variant: "offering" | "available";
  onFund?: (playerId: string, amount: number) => void;
  onTrade?: (playerId: string, type: "buy" | "sell") => void;
}

export function PlayerCard({ player, variant, onFund, onTrade }: PlayerCardProps) {
  const formatNumber = (value: number) => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}K`;
    }
    return value.toString();
  };

  if (variant === "offering") {
    return (
      <div
        className="bg-zinc-900 border border-zinc-800 relative group overflow-visible"
        data-testid={`card-player-offering-${player.id}`}
      >
        <div className="h-0.5 w-full bg-wild-scout absolute top-0 left-0" />
        <div className="p-4">
          <div className="flex justify-between items-start mb-4 gap-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-zinc-800 rounded flex items-center justify-center font-bold text-sm text-zinc-500">
                {player.avatarInitials}
              </div>
              <div>
                <h3 className="font-black text-white text-base">{player.name}</h3>
                <p className="text-[10px] font-mono text-zinc-500">
                  ${player.symbol} &bull; {player.team}
                </p>
              </div>
            </div>
            <div className="text-right font-mono">
              <div className="text-wild-scout font-bold text-sm">
                {player.fundingPercentage}%
              </div>
              <div className="text-[9px] text-zinc-500">Funded</div>
            </div>
          </div>

          <div className="mb-4">
            <div className="h-3 w-full bg-zinc-950 rounded-full overflow-hidden border border-zinc-800">
              <div
                className="h-full bg-wild-scout relative transition-all duration-500"
                style={{
                  width: `${player.fundingPercentage}%`,
                  boxShadow: "0 0 15px rgba(52,211,153,0.6)",
                }}
              />
            </div>
            <p className="text-[9px] text-zinc-500 mt-2 font-mono text-right">
              Target: {formatNumber(player.fundingTarget)} WILD
            </p>
          </div>

          <Button
            onClick={() => onFund?.(player.id, 500)}
            className="w-full py-3 bg-wild-scout text-zinc-950 font-black text-xs uppercase tracking-wide"
            data-testid={`button-fund-${player.id}`}
          >
            Fund Curve (Mint)
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="bg-zinc-900 border border-zinc-800 p-3 hover:border-zinc-600 transition-colors"
      data-testid={`card-player-available-${player.id}`}
    >
      <div className="flex justify-between items-start mb-2 gap-2">
        <div className="w-8 h-8 bg-zinc-800 rounded-full text-[10px] flex items-center justify-center font-medium text-zinc-400">
          {player.avatarInitials}
        </div>
        <span className="text-[9px] bg-zinc-950 text-wild-scout px-1.5 py-0.5 rounded border border-wild-scout/20">
          GEN {player.generation}
        </span>
      </div>
      <div className="font-bold text-white text-sm">{player.name}</div>
      <div className="text-[10px] text-zinc-500 font-mono mb-3">{player.team}</div>

      {player.stats && (
        <div className="flex justify-between items-center text-[10px] font-mono mb-3">
          <span className="text-zinc-400">{formatNumber(player.stats.marketCap)} MC</span>
          <span
            className={cn(
              "flex items-center gap-0.5",
              player.stats.change24h >= 0 ? "text-wild-scout" : "text-wild-brand"
            )}
          >
            {player.stats.change24h >= 0 ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            {Math.abs(player.stats.change24h).toFixed(1)}%
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onTrade?.(player.id, "buy")}
          className="text-[10px] font-bold bg-wild-scout/10 text-wild-scout border border-wild-scout/20"
          data-testid={`button-buy-${player.id}`}
        >
          BUY
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onTrade?.(player.id, "sell")}
          className="text-[10px] font-bold bg-wild-brand/10 text-wild-brand border border-wild-brand/20"
          data-testid={`button-sell-${player.id}`}
        >
          SELL
        </Button>
      </div>
    </div>
  );
}

export function PlayerCardSkeleton({ variant }: { variant: "offering" | "available" }) {
  if (variant === "offering") {
    return (
      <div className="bg-zinc-900 border border-zinc-800 p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-zinc-850 rounded animate-pulse-skeleton" />
          <div className="flex-1">
            <div className="w-24 h-5 bg-zinc-850 rounded animate-pulse-skeleton mb-2" />
            <div className="w-32 h-3 bg-zinc-850 rounded animate-pulse-skeleton" />
          </div>
        </div>
        <div className="h-3 w-full bg-zinc-850 rounded-full animate-pulse-skeleton mb-4" />
        <div className="h-10 w-full bg-zinc-850 rounded animate-pulse-skeleton" />
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 p-3">
      <div className="flex justify-between items-start mb-2">
        <div className="w-8 h-8 bg-zinc-850 rounded-full animate-pulse-skeleton" />
        <div className="w-12 h-4 bg-zinc-850 rounded animate-pulse-skeleton" />
      </div>
      <div className="w-20 h-4 bg-zinc-850 rounded animate-pulse-skeleton mb-1" />
      <div className="w-16 h-3 bg-zinc-850 rounded animate-pulse-skeleton mb-3" />
      <div className="grid grid-cols-2 gap-1">
        <div className="h-8 bg-zinc-850 rounded animate-pulse-skeleton" />
        <div className="h-8 bg-zinc-850 rounded animate-pulse-skeleton" />
      </div>
    </div>
  );
}
