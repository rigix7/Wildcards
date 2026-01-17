import { useState } from "react";
import { Users } from "lucide-react";
import { DemoBadge } from "@/components/terminal/DemoBadge";
import { PlayerCard, PlayerCardSkeleton } from "@/components/terminal/PlayerCard";
import { EmptyState } from "@/components/terminal/EmptyState";
import { cn } from "@/lib/utils";
import type { Player } from "@shared/schema";

type ScoutMode = "offering" | "available";

interface ScoutViewProps {
  players: Player[];
  isLoading: boolean;
  onFund: (playerId: string, amount: number) => void;
  onTrade: (playerId: string, type: "buy" | "sell") => void;
}

export function ScoutView({ players, isLoading, onFund, onTrade }: ScoutViewProps) {
  const [mode, setMode] = useState<ScoutMode>("offering");

  const offeringPlayers = players.filter((p) => p.status === "offering");
  const availablePlayers = players.filter((p) => p.status === "available");

  return (
    <div className="flex flex-col h-full relative animate-fade-in">
      <DemoBadge />

      <div className="shrink-0 bg-zinc-950 border-b border-zinc-800 p-3 flex justify-between items-center z-20">
        <h2 className="text-xs font-bold text-zinc-400 tracking-wider">PLAYER LAUNCHPAD</h2>
        <div className="flex gap-4 text-[10px] font-mono font-bold">
          <button
            onClick={() => setMode("offering")}
            className={cn(
              "pb-0.5 transition-colors",
              mode === "offering"
                ? "text-wild-scout border-b-2 border-wild-scout"
                : "text-zinc-600 hover:text-white"
            )}
            data-testid="button-mode-offering"
          >
            OFFERING
          </button>
          <button
            onClick={() => setMode("available")}
            className={cn(
              "pb-0.5 transition-colors",
              mode === "available"
                ? "text-wild-scout border-b-2 border-wild-scout"
                : "text-zinc-600 hover:text-white"
            )}
            data-testid="button-mode-available"
          >
            AVAILABLE
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {mode === "offering" && (
          <div className="space-y-4">
            {isLoading ? (
              <>
                <PlayerCardSkeleton variant="offering" />
                <PlayerCardSkeleton variant="offering" />
              </>
            ) : offeringPlayers.length > 0 ? (
              offeringPlayers.map((player) => (
                <PlayerCard
                  key={player.id}
                  player={player}
                  variant="offering"
                  onFund={onFund}
                />
              ))
            ) : (
              <EmptyState
                icon={Users}
                title="No Active Offerings"
                description="Check back later for new player launches"
              />
            )}
          </div>
        )}

        {mode === "available" && (
          <div className="grid grid-cols-2 gap-3">
            {isLoading ? (
              <>
                <PlayerCardSkeleton variant="available" />
                <PlayerCardSkeleton variant="available" />
                <PlayerCardSkeleton variant="available" />
                <PlayerCardSkeleton variant="available" />
              </>
            ) : availablePlayers.length > 0 ? (
              availablePlayers.map((player) => (
                <PlayerCard
                  key={player.id}
                  player={player}
                  variant="available"
                  onTrade={onTrade}
                />
              ))
            ) : (
              <div className="col-span-2">
                <EmptyState
                  icon={Users}
                  title="No Available Players"
                  description="Players will appear here after funding completes"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
