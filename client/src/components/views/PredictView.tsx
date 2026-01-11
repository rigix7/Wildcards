import { useState, useEffect } from "react";
import { Shield, Lock, Loader2, TrendingUp, Calendar, Radio, Clock } from "lucide-react";
import { SubTabs } from "@/components/terminal/SubTabs";
import { MarketCard, MarketCardSkeleton } from "@/components/terminal/MarketCard";
import { EmptyState } from "@/components/terminal/EmptyState";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Market, Futures, AdminSettings } from "@shared/schema";

type PredictSubTab = "matchday" | "futures" | "fantasy";

const subTabs = [
  { id: "matchday" as const, label: "MATCH DAY" },
  { id: "futures" as const, label: "FUTURES" },
  { id: "fantasy" as const, label: "FANTASY" },
];

interface PredictViewProps {
  markets: Market[];
  futures: Futures[];
  isLoading: boolean;
  futuresLoading: boolean;
  onPlaceBet: (marketId: string, outcomeId: string, odds: number) => void;
  selectedBet?: { marketId: string; outcomeId: string };
  adminSettings?: AdminSettings;
}

function isValidDate(dateString: string): boolean {
  if (!dateString) return false;
  const date = new Date(dateString);
  return !isNaN(date.getTime()) && date.getFullYear() > 2020;
}

function getTimeUntil(dateString: string): { text: string; isLive: boolean; isUpcoming: boolean } {
  if (!isValidDate(dateString)) {
    return { text: "TBD", isLive: false, isUpcoming: false };
  }
  
  const now = new Date();
  const eventTime = new Date(dateString);
  const diff = eventTime.getTime() - now.getTime();
  
  const sixHoursMs = 6 * 60 * 60 * 1000;
  if (diff <= 0 && diff > -sixHoursMs) {
    return { text: "LIVE", isLive: true, isUpcoming: false };
  }
  
  if (diff <= -sixHoursMs) {
    return { text: "ENDED", isLive: false, isUpcoming: false };
  }
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours < 1) {
    return { text: `${minutes}m`, isLive: false, isUpcoming: true };
  }
  if (hours < 24) {
    return { text: `${hours}h ${minutes}m`, isLive: false, isUpcoming: true };
  }
  
  const days = Math.floor(hours / 24);
  return { text: `${days}d ${hours % 24}h`, isLive: false, isUpcoming: true };
}

function isWithin5Days(dateString: string): boolean {
  if (!isValidDate(dateString)) return false;
  
  const now = new Date();
  const eventTime = new Date(dateString);
  const diff = eventTime.getTime() - now.getTime();
  
  const fiveDaysMs = 5 * 24 * 60 * 60 * 1000;
  const sixHoursAgoMs = -6 * 60 * 60 * 1000;
  
  return diff >= sixHoursAgoMs && diff <= fiveDaysMs;
}

function extractLeagueFromMarket(market: Market): string {
  return market.league?.toUpperCase() || market.sport?.toUpperCase() || "OTHER";
}

function formatTickerTitle(title: string, league?: string): string {
  // Try to extract team names from title like "Team A vs Team B - Winner"
  const vsMatch = title.match(/(.+?)\s+(?:vs\.?|v\.?)\s+(.+?)(?:\s+-|\s+\||\s+:|\?|$)/i);
  if (vsMatch) {
    const team1 = vsMatch[1].trim().split(" ").slice(-2).join(" ");
    const team2 = vsMatch[2].trim().split(" ").slice(0, 2).join(" ");
    const prefix = league ? `${league}: ` : "";
    return `${prefix}${team1} vs ${team2}`;
  }
  // Fallback: truncate and add league prefix
  const prefix = league ? `${league}: ` : "";
  const shortTitle = title.length > 30 ? title.slice(0, 30) + "..." : title;
  return `${prefix}${shortTitle}`;
}

function PriceTicker({ markets }: { markets: Market[] }) {
  const [offset, setOffset] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setOffset((prev) => (prev + 1) % 100);
    }, 50);
    return () => clearInterval(interval);
  }, []);
  
  if (markets.length === 0) return null;
  
  const tickerItems = markets.slice(0, 10).map((market) => {
    const outcomes = Array.isArray(market.outcomes) ? market.outcomes : [];
    // Find the "Yes" outcome, or fallback to first outcome
    const yesOutcome = outcomes.find(o => 
      o.label?.toLowerCase() === "yes" || 
      o.label?.toLowerCase().includes("win") ||
      o.label?.toLowerCase().includes("over")
    ) || outcomes[0];
    
    const probability = yesOutcome?.probability || 0;
    const displayPct = Math.round(probability * 100);
    
    return {
      title: formatTickerTitle(market.title, market.league ?? undefined),
      probability: displayPct,
      isLive: market.status === "open",
    };
  });
  
  return (
    <div className="bg-zinc-900/80 border-b border-zinc-800 overflow-hidden">
      <div 
        className="flex whitespace-nowrap py-2 px-3 gap-8"
        style={{ transform: `translateX(-${offset}%)`, transition: 'transform 0.05s linear' }}
      >
        {[...tickerItems, ...tickerItems].map((item, idx) => (
          <div key={idx} className="flex items-center gap-2 text-xs">
            <span className="text-zinc-400">{item.title}</span>
            <span className="text-wild-gold font-mono font-bold">YES {item.probability}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LeagueFilters({ 
  leagues, 
  selectedLeagues, 
  onToggle 
}: { 
  leagues: string[]; 
  selectedLeagues: Set<string>; 
  onToggle: (league: string) => void;
}) {
  if (leagues.length === 0) return null;
  
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 px-1">
      <Button
        size="sm"
        variant={selectedLeagues.size === 0 ? "default" : "outline"}
        onClick={() => onToggle("ALL")}
        className="shrink-0 text-xs h-7"
        data-testid="filter-all"
      >
        All
      </Button>
      {leagues.map((league) => (
        <Button
          key={league}
          size="sm"
          variant={selectedLeagues.has(league) ? "default" : "outline"}
          onClick={() => onToggle(league)}
          className="shrink-0 text-xs h-7"
          data-testid={`filter-${league.toLowerCase()}`}
        >
          {league}
        </Button>
      ))}
    </div>
  );
}

function CountdownBadge({ startTime }: { startTime: string }) {
  const [timeInfo, setTimeInfo] = useState(getTimeUntil(startTime));
  
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeInfo(getTimeUntil(startTime));
    }, 60000);
    return () => clearInterval(interval);
  }, [startTime]);
  
  if (timeInfo.isLive) {
    return (
      <Badge variant="destructive" className="animate-pulse text-xs">
        <Radio className="w-3 h-3 mr-1" />
        LIVE
      </Badge>
    );
  }
  
  return (
    <Badge variant="secondary" className="text-xs">
      <Clock className="w-3 h-3 mr-1" />
      {timeInfo.text}
    </Badge>
  );
}

function FuturesCard({ future, onPlaceBet, selectedOutcome }: { 
  future: Futures; 
  onPlaceBet: (marketId: string, outcomeId: string, odds: number) => void;
  selectedOutcome?: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const outcomes = future.marketData?.outcomes || [];
  const displayedOutcomes = showAll ? outcomes : outcomes.slice(0, 6);
  const hasMore = outcomes.length > 6;
  
  return (
    <Card className="p-4 space-y-3" data-testid={`futures-card-${future.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-sm">{future.title}</h3>
          {future.description && (
            <p className="text-xs text-zinc-500 line-clamp-2 mt-0.5">{future.description}</p>
          )}
        </div>
        <Badge variant="secondary" className="text-xs shrink-0">
          <Calendar className="w-3 h-3 mr-1" />
          {outcomes.length} teams
        </Badge>
      </div>
      
      {outcomes.length > 0 && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2 max-h-[400px] overflow-y-auto">
            {displayedOutcomes.map((outcome, index) => {
              const outcomeId = outcome.marketId || outcome.conditionId || `${future.id}-${index}`;
              const isSelected = selectedOutcome === outcomeId;
              const probability = outcome.probability * 100;
              
              return (
                <button
                  key={index}
                  onClick={() => onPlaceBet(future.id, outcomeId, outcome.odds)}
                  className={`flex flex-col p-2 rounded-md border transition-colors text-left ${
                    isSelected 
                      ? "border-wild-brand bg-wild-brand/10" 
                      : "border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/50"
                  }`}
                  data-testid={`futures-outcome-${future.id}-${index}`}
                >
                  <span className="text-xs truncate w-full font-medium">{outcome.label}</span>
                  <div className="flex items-center justify-between w-full mt-1">
                    <span className="text-xs text-zinc-500">{probability.toFixed(0)}%</span>
                    <span className={`font-mono text-sm font-bold ${
                      isSelected ? "text-wild-brand" : "text-wild-gold"
                    }`}>
                      {outcome.odds.toFixed(2)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
          {hasMore && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="w-full text-xs text-wild-brand hover:text-wild-brand/80 py-1"
              data-testid={`futures-toggle-${future.id}`}
            >
              {showAll ? "Show less" : `Show all ${outcomes.length} teams`}
            </button>
          )}
        </div>
      )}
      
      {future.marketData && (
        <div className="flex items-center justify-between text-xs text-zinc-500 pt-2 border-t border-zinc-800">
          <div className="flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            Vol: ${(future.marketData.volume / 1000).toFixed(1)}K
          </div>
          {future.endDate && (
            <span>Ends: {new Date(future.endDate).toLocaleDateString()}</span>
          )}
        </div>
      )}
    </Card>
  );
}

export function PredictView({ markets, futures, isLoading, futuresLoading, onPlaceBet, selectedBet, adminSettings }: PredictViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<PredictSubTab>("matchday");
  const [selectedLeagues, setSelectedLeagues] = useState<Set<string>>(new Set());

  const openMarkets = markets.filter(m => m.status === "open");
  
  const filteredMarkets = openMarkets.filter(market => {
    if (!isWithin5Days(market.startTime)) return false;
    if (selectedLeagues.size === 0) return true;
    const league = extractLeagueFromMarket(market);
    return selectedLeagues.has(league);
  });
  
  const liveMarkets = filteredMarkets.filter(m => {
    const { isLive } = getTimeUntil(m.startTime);
    return isLive;
  });
  
  const upcomingMarkets = filteredMarkets.filter(m => {
    const { isLive } = getTimeUntil(m.startTime);
    return !isLive;
  }).sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  
  const availableLeagues = Array.from(new Set(openMarkets.map(extractLeagueFromMarket))).sort();
  
  const handleLeagueToggle = (league: string) => {
    if (league === "ALL") {
      setSelectedLeagues(new Set());
      return;
    }
    
    setSelectedLeagues(prev => {
      const newSet = new Set(prev);
      if (newSet.has(league)) {
        newSet.delete(league);
      } else {
        newSet.add(league);
      }
      return newSet;
    });
  };

  return (
    <div className="flex flex-col h-full animate-fade-in">
      <PriceTicker markets={openMarkets} />
      <SubTabs tabs={subTabs} activeTab={activeSubTab} onTabChange={setActiveSubTab} />
      
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {activeSubTab === "matchday" && (
          <div className="space-y-3">
            <LeagueFilters 
              leagues={availableLeagues}
              selectedLeagues={selectedLeagues}
              onToggle={handleLeagueToggle}
            />
            
            {isLoading ? (
              <>
                <MarketCardSkeleton />
                <MarketCardSkeleton />
                <div className="opacity-50">
                  <MarketCardSkeleton />
                </div>
              </>
            ) : (
              <>
                {liveMarkets.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-bold text-red-400">
                      <Radio className="w-4 h-4 animate-pulse" />
                      LIVE NOW ({liveMarkets.length})
                    </div>
                    {liveMarkets.map((market) => (
                      <div key={market.id} className="relative">
                        <div className="absolute top-2 right-2 z-10">
                          <CountdownBadge startTime={market.startTime} />
                        </div>
                        <MarketCard
                          market={market}
                          onPlaceBet={onPlaceBet}
                          selectedOutcome={
                            selectedBet?.marketId === market.id ? selectedBet.outcomeId : undefined
                          }
                        />
                      </div>
                    ))}
                  </div>
                )}
                
                {upcomingMarkets.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-bold text-zinc-400">
                      <Clock className="w-4 h-4" />
                      UPCOMING ({upcomingMarkets.length})
                    </div>
                    {upcomingMarkets.map((market) => (
                      <div key={market.id} className="relative">
                        <div className="absolute top-2 right-2 z-10">
                          <CountdownBadge startTime={market.startTime} />
                        </div>
                        <MarketCard
                          market={market}
                          onPlaceBet={onPlaceBet}
                          selectedOutcome={
                            selectedBet?.marketId === market.id ? selectedBet.outcomeId : undefined
                          }
                        />
                      </div>
                    ))}
                  </div>
                )}
                
                {liveMarkets.length === 0 && upcomingMarkets.length === 0 && (
                  <EmptyState
                    icon={Calendar}
                    title="No Events in 5-Day Window"
                    description="Select leagues in the admin panel to see upcoming games"
                  />
                )}
              </>
            )}
          </div>
        )}

        {activeSubTab === "futures" && (
          <div className="space-y-3">
            {futuresLoading ? (
              <>
                <MarketCardSkeleton />
                <MarketCardSkeleton />
              </>
            ) : futures.length > 0 ? (
              futures.map((future) => (
                <FuturesCard
                  key={future.id}
                  future={future}
                  onPlaceBet={onPlaceBet}
                  selectedOutcome={
                    selectedBet?.marketId === future.id ? selectedBet.outcomeId : undefined
                  }
                />
              ))
            ) : (
              <EmptyState
                icon={Lock}
                title="No Futures Events"
                description="Long-term events will appear here when added by admin"
              />
            )}
          </div>
        )}

        {activeSubTab === "fantasy" && (
          <EmptyState
            icon={Shield}
            title="Fantasy Squads"
            description="Coming Q3 2026"
          />
        )}
      </div>
    </div>
  );
}
