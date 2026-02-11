import { TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/useTheme";
import type { Player } from "@shared/schema";

interface PlayerCardProps {
  player: Player;
  variant: "offering" | "available";
  onFund?: (playerId: string, amount: number) => void;
  onTrade?: (playerId: string, type: "buy" | "sell") => void;
}

export function PlayerCard({ player, variant, onFund, onTrade }: PlayerCardProps) {
  const { pointsName } = useTheme();
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
        className="bg-[var(--card-bg)] border border-[var(--border-primary)] relative group overflow-visible"
        data-testid={`card-player-offering-${player.id}`}
      >
        <div className="h-0.5 w-full bg-wild-scout absolute top-0 left-0" />
        <div className="p-4">
          <div className="flex justify-between items-start mb-4 gap-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-[var(--card-bg-elevated)] rounded flex items-center justify-center font-bold text-sm text-[var(--text-muted)]">
                {player.avatarInitials}
              </div>
              <div>
                <h3 className="font-black text-[var(--text-primary)] text-base">{player.name}</h3>
                <p className="text-[10px] font-mono text-[var(--text-muted)]">
                  ${player.symbol} &bull; {player.team}
                </p>
              </div>
            </div>
            <div className="text-right font-mono">
              <div className="text-wild-scout font-bold text-sm">
                {player.fundingPercentage}%
              </div>
              <div className="text-[9px] text-[var(--text-muted)]">Funded</div>
            </div>
          </div>

          <div className="mb-4">
            <div className="h-3 w-full bg-[var(--page-bg)] rounded-full overflow-hidden border border-[var(--border-primary)]">
              <div
                className="h-full bg-wild-scout relative transition-all duration-500"
                style={{
                  width: `${player.fundingPercentage}%`,
                  boxShadow: "0 0 15px rgba(52,211,153,0.6)",
                }}
              />
            </div>
            <p className="text-[9px] text-[var(--text-muted)] mt-2 font-mono text-right">
              Target: {formatNumber(player.fundingTarget)} {pointsName}
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
      className="bg-[var(--card-bg)] border border-[var(--border-primary)] p-3 hover:border-[var(--border-secondary)] transition-colors"
      data-testid={`card-player-available-${player.id}`}
    >
      <div className="flex justify-between items-start mb-2 gap-2">
        <div className="w-8 h-8 bg-[var(--card-bg-elevated)] rounded-full text-[10px] flex items-center justify-center font-medium text-[var(--text-secondary)]">
          {player.avatarInitials}
        </div>
        <span className="text-[9px] bg-[var(--page-bg)] text-wild-scout px-1.5 py-0.5 rounded border border-wild-scout/20">
          GEN {player.generation}
        </span>
      </div>
      <div className="font-bold text-[var(--text-primary)] text-sm">{player.name}</div>
      <div className="text-[10px] text-[var(--text-muted)] font-mono mb-3">{player.team}</div>

      {player.stats && (
        <div className="flex justify-between items-center text-[10px] font-mono mb-3">
          <span className="text-[var(--text-secondary)]">{formatNumber(player.stats.marketCap)} MC</span>
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
      <div className="bg-[var(--card-bg)] border border-[var(--border-primary)] p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-[var(--card-bg)] rounded animate-pulse-skeleton" />
          <div className="flex-1">
            <div className="w-24 h-5 bg-[var(--card-bg)] rounded animate-pulse-skeleton mb-2" />
            <div className="w-32 h-3 bg-[var(--card-bg)] rounded animate-pulse-skeleton" />
          </div>
        </div>
        <div className="h-3 w-full bg-[var(--card-bg)] rounded-full animate-pulse-skeleton mb-4" />
        <div className="h-10 w-full bg-[var(--card-bg)] rounded animate-pulse-skeleton" />
      </div>
    );
  }

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--border-primary)] p-3">
      <div className="flex justify-between items-start mb-2">
        <div className="w-8 h-8 bg-[var(--card-bg)] rounded-full animate-pulse-skeleton" />
        <div className="w-12 h-4 bg-[var(--card-bg)] rounded animate-pulse-skeleton" />
      </div>
      <div className="w-20 h-4 bg-[var(--card-bg)] rounded animate-pulse-skeleton mb-1" />
      <div className="w-16 h-3 bg-[var(--card-bg)] rounded animate-pulse-skeleton mb-3" />
      <div className="grid grid-cols-2 gap-1">
        <div className="h-8 bg-[var(--card-bg)] rounded animate-pulse-skeleton" />
        <div className="h-8 bg-[var(--card-bg)] rounded animate-pulse-skeleton" />
      </div>
    </div>
  );
}
