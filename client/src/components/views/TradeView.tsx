import { useState } from "react";
import { TrendingUp, TrendingDown, ArrowUpDown, Clock } from "lucide-react";
import { DemoBadge } from "@/components/terminal/DemoBadge";
import { cn } from "@/lib/utils";
import type { Trade, Player } from "@shared/schema";

interface TradeViewProps {
  trades: Trade[];
  players: Player[];
  isLoading: boolean;
}

export function TradeView({ trades, players, isLoading }: TradeViewProps) {
  const [sortBy, setSortBy] = useState<"recent" | "volume">("recent");

  const availablePlayers = players.filter((p) => p.status === "available");

  const formatNumber = (value: number) => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}K`;
    }
    return value.toFixed(2);
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return `${Math.floor(diffMins / 1440)}d ago`;
  };

  return (
    <div className="flex flex-col h-full relative animate-fade-in">
      <DemoBadge />

      <div className="shrink-0 bg-[var(--page-bg)] border-b border-[var(--border-primary)] p-3 z-20">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-xs font-bold text-[var(--text-secondary)] tracking-wider">PLAYER MARKETS</h2>
          <div className="flex items-center gap-2 text-[10px] font-mono">
            <button
              onClick={() => setSortBy("recent")}
              className={cn(
                "px-2 py-1 rounded transition-colors",
                sortBy === "recent" ? "bg-[var(--card-bg-elevated)] text-[var(--text-primary)]" : "text-[var(--text-muted)]"
              )}
              data-testid="button-sort-recent"
            >
              <Clock className="w-3 h-3 inline mr-1" />
              RECENT
            </button>
            <button
              onClick={() => setSortBy("volume")}
              className={cn(
                "px-2 py-1 rounded transition-colors",
                sortBy === "volume" ? "bg-[var(--card-bg-elevated)] text-[var(--text-primary)]" : "text-[var(--text-muted)]"
              )}
              data-testid="button-sort-volume"
            >
              <ArrowUpDown className="w-3 h-3 inline mr-1" />
              VOLUME
            </button>
          </div>
        </div>

        <div className="grid grid-cols-4 text-[9px] font-mono text-[var(--text-muted)] uppercase pb-1 border-b border-[var(--border-primary)]/50">
          <span>PLAYER</span>
          <span className="text-right">PRICE</span>
          <span className="text-right">24H</span>
          <span className="text-right">MC</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-0">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="grid grid-cols-4 items-center p-3 border-b border-[var(--border-primary)]/50"
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-[var(--card-bg)] rounded-full animate-pulse-skeleton" />
                  <div className="space-y-1">
                    <div className="w-16 h-3 bg-[var(--card-bg)] rounded animate-pulse-skeleton" />
                    <div className="w-12 h-2 bg-[var(--card-bg)] rounded animate-pulse-skeleton" />
                  </div>
                </div>
                <div className="w-12 h-4 bg-[var(--card-bg)] rounded animate-pulse-skeleton ml-auto" />
                <div className="w-10 h-4 bg-[var(--card-bg)] rounded animate-pulse-skeleton ml-auto" />
                <div className="w-12 h-4 bg-[var(--card-bg)] rounded animate-pulse-skeleton ml-auto" />
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-primary)]/50">
            {availablePlayers.map((player) => (
              <div
                key={player.id}
                className="grid grid-cols-4 items-center p-3 hover:bg-[var(--card-bg)]/50 transition-colors"
                data-testid={`row-trade-${player.id}`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-[var(--card-bg-elevated)] rounded-full flex items-center justify-center text-[10px] font-medium text-[var(--text-secondary)]">
                    {player.avatarInitials}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[var(--text-primary)]">{player.name}</div>
                    <div className="text-[10px] font-mono text-[var(--text-muted)]">${player.symbol}</div>
                  </div>
                </div>
                <div className="text-right font-mono text-xs text-[var(--text-primary)]">
                  ${(player.stats?.marketCap ? player.stats.marketCap / 1000 : 0.01).toFixed(2)}
                </div>
                <div
                  className={cn(
                    "text-right font-mono text-xs flex items-center justify-end gap-0.5",
                    (player.stats?.change24h || 0) >= 0 ? "text-wild-scout" : "text-wild-brand"
                  )}
                >
                  {(player.stats?.change24h || 0) >= 0 ? (
                    <TrendingUp className="w-3 h-3" />
                  ) : (
                    <TrendingDown className="w-3 h-3" />
                  )}
                  {Math.abs(player.stats?.change24h || 0).toFixed(1)}%
                </div>
                <div className="text-right font-mono text-xs text-[var(--text-secondary)]">
                  {formatNumber(player.stats?.marketCap || 0)}
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && trades.length > 0 && (
          <div className="p-3 border-t border-[var(--border-primary)]">
            <h3 className="text-xs font-bold text-[var(--text-secondary)] tracking-wider mb-3">RECENT TRADES</h3>
            <div className="space-y-2">
              {trades.slice(0, 5).map((trade) => (
                <div
                  key={trade.id}
                  className="flex justify-between items-center text-xs bg-[var(--card-bg)]/50 p-2 rounded border border-[var(--border-primary)]/50"
                  data-testid={`trade-${trade.id}`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "px-1.5 py-0.5 rounded text-[9px] font-bold",
                        trade.type === "buy"
                          ? "bg-wild-scout/20 text-wild-scout"
                          : "bg-wild-brand/20 text-wild-brand"
                      )}
                    >
                      {trade.type.toUpperCase()}
                    </span>
                    <span className="text-[var(--text-primary)] font-medium">{trade.playerName}</span>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-[var(--text-secondary)]">
                    <span>${trade.total.toFixed(2)}</span>
                    <span className="text-[10px]">{formatTime(trade.timestamp)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
