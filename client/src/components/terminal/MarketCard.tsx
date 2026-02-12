import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Market } from "@shared/schema";

interface MarketCardProps {
  market: Market;
  onPlaceBet: (marketId: string, outcomeId: string, odds: number) => void;
  selectedOutcome?: string;
}

export function MarketCard({ market, onPlaceBet, selectedOutcome }: MarketCardProps) {
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return "Today";
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return "Tomorrow";
    }
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const formatVolume = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(1)}K`;
    }
    return `$${value}`;
  };

  return (
    <div
      className="border relative group overflow-visible animate-fade-in transition-colors"
      style={{
        backgroundColor: 'var(--market-bg, #18181b)',
        borderColor: 'var(--market-border, #27272a)',
      }}
      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--market-hover, #27272a)'}
      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--market-bg, #18181b)'}
      data-testid={`card-market-${market.id}`}
    >
      <div className="h-0.5 w-full absolute top-0 left-0" style={{ backgroundColor: 'var(--market-moneyline, #f43f5e)' }} />
      <div className="p-4">
        <div className="flex justify-between items-start mb-3 gap-2">
          <div>
            <div className="flex items-center gap-2 mb-1">
              {market.league && (
                <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider">
                  {market.league}
                </span>
              )}
              {market.sport && (
                <span className="text-[9px] bg-[var(--card-bg-elevated)] text-[var(--text-secondary)] px-1.5 py-0.5 rounded">
                  {market.sport}
                </span>
              )}
            </div>
            <h3 className="font-black text-base leading-tight" style={{ color: 'var(--market-text, #ffffff)' }}>{market.title}</h3>
          </div>
          <div className="text-right shrink-0">
            <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] font-mono">
              <Clock className="w-3 h-3" />
              <span>{formatDate(market.startTime)}</span>
            </div>
            <div className="text-[10px] text-[var(--text-muted)] font-mono">{formatTime(market.startTime)}</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          {market.outcomes.map((outcome) => {
            const isSelected = selectedOutcome === outcome.id;
            return (
              <button
                key={outcome.id}
                onClick={() => onPlaceBet(market.id, outcome.id, outcome.odds)}
                className={cn(
                  "flex flex-col items-center justify-center py-3 px-2 rounded-md border transition-all",
                  isSelected
                    ? "bg-wild-brand/20 border-wild-brand text-[var(--text-primary)] shadow-[0_0_15px_rgba(251,113,133,0.3)]"
                    : "bg-[var(--page-bg)] border-[var(--border-primary)] text-[var(--text-secondary)] hover:border-[var(--border-secondary)]"
                )}
                data-testid={`button-outcome-${outcome.id}`}
              >
                <span className="text-xl font-black font-mono" style={isSelected ? { color: 'var(--market-odds-badge, inherit)' } : undefined}>{outcome.odds.toFixed(2)}</span>
                <span className="text-[10px] text-[var(--text-secondary)] mt-1 truncate w-full text-center">
                  {outcome.label}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex justify-between items-center text-[10px] text-[var(--text-muted)] font-mono">
          <span>Vol: {formatVolume(market.volume)}</span>
          <span>Liq: {formatVolume(market.liquidity)}</span>
        </div>
      </div>
    </div>
  );
}

export function MarketCardSkeleton() {
  return (
    <div className="bg-[var(--card-bg)] border border-[var(--border-primary)] p-4 relative overflow-hidden">
      <div className="flex justify-between mb-4">
        <div className="w-24 h-4 bg-[var(--card-bg)] rounded animate-pulse-skeleton" />
        <div className="w-12 h-4 bg-[var(--card-bg)] rounded animate-pulse-skeleton" />
      </div>
      <div className="w-48 h-6 bg-[var(--card-bg)] rounded animate-pulse-skeleton mb-6" />
      <div className="grid grid-cols-3 gap-2">
        <div className="h-16 bg-[var(--card-bg)] rounded animate-pulse-skeleton" />
        <div className="h-16 bg-[var(--card-bg)] rounded animate-pulse-skeleton" />
        <div className="h-16 bg-[var(--card-bg)] rounded animate-pulse-skeleton" />
      </div>
    </div>
  );
}
