import { useState, useEffect, useRef, createContext, useContext, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Shield, Lock, Loader2, TrendingUp, Calendar, Radio, Clock, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from "lucide-react";
import { SubTabs } from "@/components/terminal/SubTabs";
import { MarketCardSkeleton } from "@/components/terminal/MarketCard";
import { EmptyState } from "@/components/terminal/EmptyState";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Market, Futures, AdminSettings, SportMarketConfig } from "@shared/schema";
import type { DisplayEvent, ParsedMarket, MarketGroup } from "@/lib/polymarket";
import { getTeamAbbreviation } from "@/lib/polymarket";
import type { UseLivePricesResult } from "@/hooks/useLivePrices";

// Type for live prices map
type LivePricesMap = Map<string, { bestAsk: number; bestBid: number }>;

// Helper to get live price for a token, or fall back to static price
function getLivePrice(
  tokenId: string | undefined, 
  staticPrice: number, 
  livePrices?: LivePricesMap
): number {
  if (!livePrices || !tokenId) return staticPrice;
  const liveData = livePrices.get(tokenId);
  if (liveData && liveData.bestAsk > 0) {
    return liveData.bestAsk;
  }
  return staticPrice;
}

// Context for sport market configs
const SportConfigContext = createContext<Map<string, SportMarketConfig>>(new Map());

function useSportConfig(sportSlug: string, marketType: string): SportMarketConfig | undefined {
  const configMap = useContext(SportConfigContext);
  return configMap.get(`${sportSlug}:${marketType}`);
}

function buildConfigMap(configs: SportMarketConfig[]): Map<string, SportMarketConfig> {
  const map = new Map<string, SportMarketConfig>();
  for (const config of configs) {
    map.set(`${config.sportSlug}:${config.marketType}`, config);
  }
  return map;
}

type PredictSubTab = "matchday" | "futures" | "fantasy";

const subTabs = [
  { id: "matchday" as const, label: "MATCH DAY" },
  { id: "futures" as const, label: "FUTURES" },
  { id: "fantasy" as const, label: "FANTASY" },
];

interface PredictViewProps {
  markets: Market[];
  displayEvents: DisplayEvent[];
  futures: Futures[];
  isLoading: boolean;
  futuresLoading: boolean;
  onPlaceBet: (marketId: string, outcomeId: string, odds: number, marketTitle?: string, outcomeLabel?: string, marketType?: string, direction?: "yes" | "no", yesTokenId?: string, noTokenId?: string, yesPrice?: number, noPrice?: number, orderMinSize?: number) => void;
  selectedBet?: { marketId: string; outcomeId: string; direction?: string };
  adminSettings?: AdminSettings;
  userPositions?: { tokenId: string; size: number; avgPrice: number; outcomeLabel?: string; marketQuestion?: string; unrealizedPnl?: number }[];
  livePrices?: UseLivePricesResult;
}

function formatVolume(vol: number): string {
  if (vol >= 1000000) return `$${(vol / 1000000).toFixed(1)}M`;
  if (vol >= 1000) return `$${(vol / 1000).toFixed(1)}K`;
  return `$${vol.toFixed(0)}`;
}

function getCountdown(dateString: string): { text: string; isLive: boolean } {
  const now = new Date();
  const eventTime = new Date(dateString);
  const diff = eventTime.getTime() - now.getTime();
  
  const sixHoursMs = 6 * 60 * 60 * 1000;
  if (diff <= 0 && diff > -sixHoursMs) {
    return { text: "LIVE", isLive: true };
  }
  
  if (diff <= -sixHoursMs) {
    return { text: "ENDED", isLive: false };
  }
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours < 1) {
    return { text: `${minutes}m`, isLive: false };
  }
  if (hours < 24) {
    return { text: `${hours}h ${minutes}m`, isLive: false };
  }
  
  const days = Math.floor(hours / 24);
  return { text: `${days}d ${hours % 24}h`, isLive: false };
}

function isWithin5Days(dateString: string): boolean {
  if (!dateString) return false;
  
  const now = new Date();
  const eventTime = new Date(dateString);
  
  // Guard against invalid dates
  if (isNaN(eventTime.getTime())) return false;
  
  const diff = eventTime.getTime() - now.getTime();
  
  const fiveDaysMs = 5 * 24 * 60 * 60 * 1000;
  const sixHoursAgoMs = -6 * 60 * 60 * 1000;
  
  return diff >= sixHoursAgoMs && diff <= fiveDaysMs;
}

// Format market type labels: replace underscores with spaces
function formatMarketTypeLabel(label: string): string {
  return label.replace(/_/g, " ");
}

// Parse team name from soccer market question (e.g., "Will Genoa win?" -> "Genoa")
function parseSoccerOutcomeName(question: string | undefined, fallback?: string): string {
  // Handle undefined/empty question
  if (!question) {
    return fallback || "Unknown";
  }
  
  const lowerQ = question.toLowerCase();
  
  // Check for draw first
  if (lowerQ.includes("draw") || lowerQ.includes("tie")) {
    return "Draw";
  }
  
  // Try to extract team name from "Will [Team] win?" pattern
  const willWinMatch = question.match(/Will (.+?) win\??/i);
  if (willWinMatch) {
    return willWinMatch[1].trim();
  }
  
  // Try "[Team] to win" pattern
  const toWinMatch = question.match(/^(.+?) to win/i);
  if (toWinMatch) {
    return toWinMatch[1].trim();
  }
  
  // Fallback: return the question itself shortened or use fallback
  if (question.length > 15) {
    return question.substring(0, 12) + "...";
  }
  return question;
}

// Price ticker showing all events with moneyline odds
// Format: {category} {event}: {team1} {price} | {team2} {price}
function PriceTicker({ events }: { events: DisplayEvent[] }) {
  if (events.length === 0) return null;
  
  // Show all events (not just 5 days) that aren't ended
  const filteredEvents = events.filter(e => e.status !== "ended");
  
  if (filteredEvents.length === 0) return null;
  
  // Build ticker items - one per event showing all moneyline options
  const tickerItems: { 
    league: string; 
    eventTitle: string; 
    outcomes: { abbrev: string; price: number }[];
  }[] = [];
  
  for (const event of filteredEvents) {
    const moneylineGroup = event.marketGroups.find(g => g.type === "moneyline");
    if (!moneylineGroup || moneylineGroup.markets.length === 0) continue;
    
    // Collect outcomes with abbreviations and prices
    const outcomes: { abbrev: string; price: number }[] = [];
    
    for (const market of moneylineGroup.markets.slice(0, 3)) {
      const yesPrice = market.bestAsk || market.outcomes[0]?.price || 0;
      // Get outcome label from question or title (NOT from outcomes array which is just Yes/No)
      let abbrev = parseSoccerOutcomeName(market.question) ||
                   market.groupItemTitle?.replace(/^Will\s+/i, "").replace(/\s+win\??$/i, "").trim() ||
                   "TBD";
      // Shorten long names to abbreviations (keep Draw as-is)
      if (abbrev.length > 6 && abbrev !== "Draw") {
        // Try to create a 3-letter abbreviation from first letters of words
        const words = abbrev.split(/\s+/);
        if (words.length >= 2) {
          abbrev = words.map(w => w[0]).join("").toUpperCase().substring(0, 3);
        } else {
          abbrev = abbrev.substring(0, 3).toUpperCase();
        }
      }
      outcomes.push({
        abbrev,
        price: Math.round(yesPrice * 100),
      });
    }
    
    if (outcomes.length > 0) {
      tickerItems.push({
        league: event.league,
        eventTitle: event.title,
        outcomes,
      });
    }
  }
  
  if (tickerItems.length === 0) return null;
  
  // Animation speed based on number of events (~4s per event)
  const animationDuration = Math.max(30, tickerItems.length * 4);
  
  return (
    <div className="bg-zinc-900/80 border-b border-zinc-800 overflow-hidden">
      <style>
        {`
          @keyframes ticker-scroll {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
          .ticker-track {
            display: flex;
            width: fit-content;
            animation: ticker-scroll ${animationDuration}s linear infinite;
          }
          .ticker-track:hover {
            animation-play-state: paused;
          }
        `}
      </style>
      <div className="ticker-track whitespace-nowrap py-2 px-3">
        {/* Duplicate the content for seamless loop */}
        {[...tickerItems, ...tickerItems].map((item, idx) => (
          <div key={idx} className="inline-flex items-center gap-2 text-xs mr-8">
            <span className="text-zinc-500 text-[10px] font-medium">{item.league}</span>
            <span className="text-zinc-400">{item.eventTitle}:</span>
            <span className="inline-flex items-center gap-1">
              {item.outcomes.map((o, i) => (
                <span key={i} className="inline-flex items-center">
                  <span className="text-zinc-300">{o.abbrev}</span>
                  <span className="text-wild-gold font-mono font-bold ml-1">{o.price}¢</span>
                  {i < item.outcomes.length - 1 && (
                    <span className="text-zinc-600 mx-1">|</span>
                  )}
                </span>
              ))}
            </span>
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

// Line selector pills for spreads/totals
function LineSelector({ 
  lines, 
  selectedLine, 
  onSelect 
}: { 
  lines: number[];
  selectedLine: number;
  onSelect: (line: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const scrollAmount = 80;
      scrollRef.current.scrollBy({ 
        left: direction === "left" ? -scrollAmount : scrollAmount, 
        behavior: "smooth" 
      });
    }
  };
  
  if (lines.length <= 1) return null;
  
  return (
    <div className="flex items-center gap-1 mt-2">
      <button 
        onClick={() => scroll("left")}
        className="p-1 text-zinc-500 hover:text-zinc-300 shrink-0"
        data-testid="line-scroll-left"
      >
        <ChevronLeft className="w-3 h-3" />
      </button>
      <div 
        ref={scrollRef}
        className="flex gap-1.5 overflow-x-auto scrollbar-hide"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {lines.map((line) => (
          <button
            key={line}
            onClick={() => onSelect(line)}
            className={`px-2.5 py-1 rounded text-xs font-mono shrink-0 transition-colors ${
              selectedLine === line
                ? "bg-zinc-600 text-white font-bold"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
            }`}
            data-testid={`line-${line}`}
          >
            {Math.abs(line)}
          </button>
        ))}
      </div>
      <button 
        onClick={() => scroll("right")}
        className="p-1 text-zinc-500 hover:text-zinc-300 shrink-0"
        data-testid="line-scroll-right"
      >
        <ChevronRight className="w-3 h-3" />
      </button>
    </div>
  );
}

// Helper to parse line from groupItemTitle if market.line is missing
function parseLineFromTitle(title: string): number | null {
  // Match patterns like "+3.5", "-4.5", "O 22.5", "U 21.5", "(+3.5)", "(-4.5)"
  const match = title.match(/([+-]?\d+\.?\d*)/);
  if (match) {
    return parseFloat(match[1]);
  }
  return null;
}

// Spread market display component - shows two buttons like [SF +4.5 48¢] [PHI -4.5 53¢]
function SpreadMarketDisplay({
  market,
  eventTitle,
  onSelect,
  selectedDirection,
  livePrices
}: {
  market: ParsedMarket;
  eventTitle: string;
  onSelect: (market: ParsedMarket, direction: "home" | "away") => void;
  selectedDirection?: "home" | "away" | null;
  livePrices?: LivePricesMap;
}) {
  // Parse the question to extract home team: "Spread: Eagles (-4.5)" -> Eagles is home with -4.5
  // The outcomes array: [homeTeam, awayTeam] - index 0 is home (gets the negative line)
  const outcomes = market.outcomes;
  if (outcomes.length < 2) return null;
  
  // Use market.line if available, otherwise try to parse from groupItemTitle
  const line = market.line ?? parseLineFromTitle(market.groupItemTitle) ?? 0;
  const homeTeam = outcomes[0].label;
  const awayTeam = outcomes[1].label;
  const homeAbbr = getTeamAbbreviation(homeTeam);
  const awayAbbr = getTeamAbbreviation(awayTeam);
  
  // Home team gets negative line (e.g., -4.5), away team gets positive (+4.5)
  const homeLine = line; // Already negative from API
  const awayLine = -line; // Flip sign for away team
  
  // Prices: use live prices from WebSocket if available, fall back to Gamma API
  const homeStaticPrice = outcomes[0].price ?? market.bestAsk ?? 0.5;
  const awayStaticPrice = outcomes[1].price ?? (1 - market.bestAsk) ?? 0.5;
  const homePrice = Math.round(getLivePrice(outcomes[0].tokenId, homeStaticPrice, livePrices) * 100);
  const awayPrice = Math.round(getLivePrice(outcomes[1].tokenId, awayStaticPrice, livePrices) * 100);
  
  const isHomeSelected = selectedDirection === "home";
  const isAwaySelected = selectedDirection === "away";
  
  return (
    <div className="flex gap-2">
      <button
        onClick={() => onSelect(market, "away")}
        className={`flex-1 flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm transition-all ${
          isAwaySelected 
            ? "bg-red-600 border border-red-500 text-white" 
            : "bg-red-900/40 border border-red-800/50 hover:bg-red-800/50 text-zinc-100"
        }`}
        data-testid={`spread-away-${market.id}`}
      >
        <span className="font-bold">
          {awayAbbr} {awayLine > 0 ? "+" : ""}{awayLine}
        </span>
        <span className="font-mono font-bold text-white">{awayPrice}¢</span>
      </button>
      <button
        onClick={() => onSelect(market, "home")}
        className={`flex-1 flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm transition-all ${
          isHomeSelected 
            ? "bg-teal-600 border border-teal-500 text-white" 
            : "bg-teal-900/40 border border-teal-800/50 hover:bg-teal-800/50 text-zinc-100"
        }`}
        data-testid={`spread-home-${market.id}`}
      >
        <span className="font-bold">
          {homeAbbr} {homeLine > 0 ? "+" : ""}{homeLine}
        </span>
        <span className="font-mono font-bold text-white">{homePrice}¢</span>
      </button>
    </div>
  );
}

// Totals market display component - shows Over/Under buttons
function TotalsMarketDisplay({
  market,
  onSelect,
  selectedDirection,
  livePrices
}: {
  market: ParsedMarket;
  onSelect: (market: ParsedMarket, direction: "over" | "under") => void;
  selectedDirection?: "over" | "under" | null;
  livePrices?: LivePricesMap;
}) {
  const outcomes = market.outcomes;
  if (outcomes.length < 2) return null;
  
  // Use market.line if available, otherwise try to parse from groupItemTitle
  const line = market.line ?? parseLineFromTitle(market.groupItemTitle) ?? 0;
  
  // Outcomes: ["Over", "Under"] with live prices from WebSocket if available
  const overStaticPrice = outcomes[0].price ?? market.bestAsk ?? 0.5;
  const underStaticPrice = outcomes[1].price ?? (1 - market.bestAsk) ?? 0.5;
  const overPrice = Math.round(getLivePrice(outcomes[0].tokenId, overStaticPrice, livePrices) * 100);
  const underPrice = Math.round(getLivePrice(outcomes[1].tokenId, underStaticPrice, livePrices) * 100);
  
  const isOverSelected = selectedDirection === "over";
  const isUnderSelected = selectedDirection === "under";
  
  return (
    <div className="flex gap-2">
      <button
        onClick={() => onSelect(market, "over")}
        className={`flex-1 flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm transition-all ${
          isOverSelected 
            ? "bg-blue-600 border border-blue-500 text-white" 
            : "bg-blue-900/40 border border-blue-800/50 hover:bg-blue-800/50 text-zinc-100"
        }`}
        data-testid={`total-over-${market.id}`}
      >
        <span className="font-bold">O {line}</span>
        <span className="font-mono font-bold text-white">{overPrice}¢</span>
      </button>
      <button
        onClick={() => onSelect(market, "under")}
        className={`flex-1 flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm transition-all ${
          isUnderSelected 
            ? "bg-blue-600 border border-blue-500 text-white" 
            : "bg-blue-900/40 border border-blue-800/50 hover:bg-blue-800/50 text-zinc-100"
        }`}
        data-testid={`total-under-${market.id}`}
      >
        <span className="font-bold">U {line}</span>
        <span className="font-mono font-bold text-white">{underPrice}¢</span>
      </button>
    </div>
  );
}

// Soccer 3-way moneyline display - shows Home/Draw/Away with prices (enhanced styling)
// Clicking any option opens betslip with Yes/No choice for that specific market
function SoccerMoneylineDisplay({
  markets,
  eventTitle,
  onSelect,
  selectedMarketId,
  selectedDirection,
  livePrices
}: {
  markets: ParsedMarket[];
  eventTitle: string;
  onSelect: (market: ParsedMarket, direction: "yes" | "no", outcomeLabel: string) => void;
  selectedMarketId?: string;
  selectedDirection?: string | null;
  livePrices?: LivePricesMap;
}) {
  // Soccer markets come as separate markets for Home Win, Draw, Away Win
  // Each market has a question like "Will Genoa win?" or "Will the match be a draw?"
  // We parse the team name from the question field
  
  // Sort markets: try to order as Home, Draw, Away (draw in middle)
  const sortedMarkets = [...markets].slice(0, 3).sort((a, b) => {
    const aQ = (a.question || "").toLowerCase();
    const bQ = (b.question || "").toLowerCase();
    const aIsDraw = aQ.includes("draw") || aQ.includes("tie");
    const bIsDraw = bQ.includes("draw") || bQ.includes("tie");
    if (aIsDraw && !bIsDraw) return 1; // Draw goes to middle/end
    if (!aIsDraw && bIsDraw) return -1;
    return 0;
  });
  
  // Reorder so draw is in the middle if we have 3 markets
  if (sortedMarkets.length === 3) {
    const drawIdx = sortedMarkets.findIndex(m => {
      const q = (m.question || "").toLowerCase();
      return q.includes("draw") || q.includes("tie");
    });
    if (drawIdx === 2) {
      // Move draw to middle
      const draw = sortedMarkets.splice(2, 1)[0];
      sortedMarkets.splice(1, 0, draw);
    } else if (drawIdx === 0) {
      // Move draw to middle
      const draw = sortedMarkets.splice(0, 1)[0];
      sortedMarkets.splice(1, 0, draw);
    }
  }
  
  // Calculate prices using live data when available and find favorite using normalized probabilities
  const prices = sortedMarkets.map(m => {
    const staticPrice = m.outcomes[0]?.price ?? m.bestAsk ?? 0;
    return getLivePrice(m.outcomes[0]?.tokenId, staticPrice, livePrices);
  });
  const totalProb = prices.reduce((sum, p) => sum + p, 0);
  const normalizedProbs = prices.map(p => totalProb > 0 ? p / totalProb : 0.33);
  const maxNormalizedProb = Math.max(...normalizedProbs);
  const favoriteIndex = normalizedProbs.indexOf(maxNormalizedProb);
  const isFavoriteStrong = maxNormalizedProb >= 0.50; // 50%+ of total probability
  
  // Calculate probability percentages for the 3-segment bar
  const probabilities = normalizedProbs.map(p => p * 100);
  
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {sortedMarkets.map((market, idx) => {
          // Use live price from WebSocket if available
          const priceInCents = Math.round(prices[idx] * 100);
          
          // Use groupItemTitle directly - it contains the team name (e.g., "Sevilla FC", "Draw", "RC Celta")
          // Fall back to parsing from question if groupItemTitle is not available
          const fullLabel = market.groupItemTitle || parseSoccerOutcomeName(market.question, "Team");
          const lowerLabel = fullLabel.toLowerCase();
          const isDraw = lowerLabel.includes("draw") || lowerLabel.includes("tie");
          
          // Use 3-letter abbreviation for teams, "DRAW" for draw
          const displayLabel = isDraw ? "DRAW" : getTeamAbbreviation(fullLabel);
          
          const isSelected = selectedMarketId === market.id;
          const isYesSelected = isSelected && selectedDirection === "yes";
          const isFavorite = idx === favoriteIndex && isFavoriteStrong;
          
          // Color: Home (teal), Draw (zinc), Away (amber)
          let colorClass: string;
          if (isDraw) {
            colorClass = isYesSelected 
              ? "bg-zinc-600 border-zinc-500" 
              : "bg-zinc-800/60 border-zinc-700/50 hover:bg-zinc-700/50";
          } else if (idx === 0) {
            colorClass = isYesSelected 
              ? "bg-teal-600 border-teal-500" 
              : "bg-teal-900/40 border-teal-800/50 hover:bg-teal-800/50";
          } else {
            colorClass = isYesSelected 
              ? "bg-amber-600 border-amber-500" 
              : "bg-amber-900/40 border-amber-800/50 hover:bg-amber-800/50";
          }
          
          return (
            <button
              key={market.id}
              onClick={() => onSelect(market, "yes", fullLabel)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-lg border text-sm transition-all ${colorClass} text-zinc-100`}
              data-testid={`soccer-moneyline-${market.id}`}
            >
              <div className="flex items-center gap-1.5">
                <span className="font-bold">{displayLabel}</span>
                {isFavorite && (
                  <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-wild-gold/20 text-wild-gold uppercase">
                    FAV
                  </span>
                )}
              </div>
              <span className="font-mono font-bold text-sm text-white">{priceInCents}¢</span>
            </button>
          );
        })}
      </div>
      
      {/* 3-segment odds differential bar */}
      {sortedMarkets.length === 3 && (
        <div className="relative h-1.5 bg-zinc-800 rounded-full overflow-hidden flex">
          <div 
            className="h-full bg-gradient-to-r from-teal-500 to-teal-400 transition-all duration-300"
            style={{ width: `${probabilities[0]}%` }}
          />
          <div 
            className="h-full bg-gradient-to-r from-zinc-500 to-zinc-400 transition-all duration-300"
            style={{ width: `${probabilities[1]}%` }}
          />
          <div 
            className="h-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-300"
            style={{ width: `${probabilities[2]}%` }}
          />
        </div>
      )}
    </div>
  );
}

// Moneyline market display - shows team buttons with prices (enhanced styling)
function MoneylineMarketDisplay({
  market,
  eventTitle,
  onSelect,
  selectedOutcomeIndex,
  livePrices
}: {
  market: ParsedMarket;
  eventTitle: string;
  onSelect: (market: ParsedMarket, outcomeIndex: number) => void;
  selectedOutcomeIndex?: number | null;
  livePrices?: LivePricesMap;
}) {
  const outcomes = market.outcomes;
  
  // Calculate prices using live data when available, find favorite
  const prices = outcomes.map((o, idx) => {
    const staticPrice = o.price ?? (idx === 0 ? market.bestAsk : market.bestBid) ?? 0.5;
    return getLivePrice(o.tokenId, staticPrice, livePrices);
  });
  const maxPrice = Math.max(...prices);
  const favoriteIndex = prices.indexOf(maxPrice);
  const isFavoriteStrong = maxPrice >= 0.70; // Show FAV badge if 70%+ implied probability
  
  // Calculate probability percentages for the bar
  const totalProb = prices.reduce((sum, p) => sum + p, 0);
  const probabilities = prices.map(p => totalProb > 0 ? (p / totalProb) * 100 : 50);
  
  return (
    <div className="space-y-2">
      {/* Larger styled buttons */}
      <div className="flex gap-2">
        {outcomes.map((outcome, idx) => {
          const priceInCents = Math.round(prices[idx] * 100);
          const abbr = getTeamAbbreviation(outcome.label);
          const isSelected = selectedOutcomeIndex === idx;
          const isFavorite = idx === favoriteIndex && isFavoriteStrong;
          
          return (
            <button
              key={idx}
              onClick={() => onSelect(market, idx)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-lg border text-sm transition-all ${
                isSelected 
                  ? idx === 0 
                    ? "bg-teal-600 border-teal-500 text-white" 
                    : "bg-amber-600 border-amber-500 text-white"
                  : idx === 0
                    ? "bg-teal-900/40 border-teal-800/50 hover:bg-teal-800/50 text-zinc-100"
                    : "bg-amber-900/40 border-amber-800/50 hover:bg-amber-800/50 text-zinc-100"
              }`}
              data-testid={`moneyline-${market.id}-${idx}`}
            >
              <div className="flex items-center gap-1.5">
                <span className="font-bold">{abbr}</span>
                {isFavorite && (
                  <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-wild-gold/20 text-wild-gold uppercase">
                    FAV
                  </span>
                )}
              </div>
              <span className="font-mono font-bold text-sm text-white">
                {priceInCents}¢
              </span>
            </button>
          );
        })}
      </div>
      
      {/* Odds differential bar */}
      {outcomes.length === 2 && (
        <div className="relative h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div 
            className="absolute left-0 top-0 h-full bg-gradient-to-r from-teal-500 to-teal-400 transition-all duration-300"
            style={{ width: `${probabilities[0]}%` }}
          />
          <div 
            className="absolute right-0 top-0 h-full bg-gradient-to-l from-amber-500 to-amber-400 transition-all duration-300"
            style={{ width: `${probabilities[1]}%` }}
          />
        </div>
      )}
    </div>
  );
}

// Check if league is a soccer league by slug
const SOCCER_LEAGUE_SLUGS = ["soccer", "epl", "lal", "bun", "sea", "fl1", "ucl", "uel", "mls", "premier-league", "la-liga", "bundesliga", "serie-a", "ligue-1", "champions-league", "europa-league"];

function isSoccerLeagueBySlug(leagueSlug: string): boolean {
  if (!leagueSlug) return false;
  const slug = leagueSlug.toLowerCase();
  return SOCCER_LEAGUE_SLUGS.some(s => slug.includes(s));
}

// Legacy label-based check (fallback)
const SOCCER_LEAGUES = ["Premier League", "La Liga", "Bundesliga", "Serie A", "Ligue 1", "Champions League", "Europa League", "MLS", "Soccer"];

function isSoccerLeague(league: string, leagueSlug?: string): boolean {
  // First check by slug (more reliable)
  if (leagueSlug && isSoccerLeagueBySlug(leagueSlug)) return true;
  // Fallback to label check
  return SOCCER_LEAGUES.some(sl => league.toLowerCase().includes(sl.toLowerCase()));
}

// Check if league is a tennis league
const TENNIS_LEAGUE_SLUGS = ["atp", "wta", "tennis"];
const TENNIS_LEAGUES = ["ATP Tennis", "WTA Tennis", "ATP", "WTA", "Tennis"];

function isTennisLeague(league: string, leagueSlug?: string): boolean {
  // First check by slug
  if (leagueSlug && TENNIS_LEAGUE_SLUGS.some(s => leagueSlug.toLowerCase().includes(s))) return true;
  // Fallback to label check
  return TENNIS_LEAGUES.some(tl => league.toLowerCase().includes(tl.toLowerCase()));
}

// Core market types that get the polished UI
const CORE_MARKET_TYPES = ["moneyline", "spreads", "totals"];

// Simplified market row for additional markets - shows question + all outcomes with prices
function SimplifiedMarketRow({
  market,
  onSelect,
  selectedMarketId,
  selectedOutcomeIndex,
  livePrices,
}: {
  market: ParsedMarket;
  onSelect: (market: ParsedMarket, outcomeIndex: number, outcomeLabel: string) => void;
  selectedMarketId?: string;
  selectedOutcomeIndex?: number;
  livePrices?: LivePricesMap;
}) {
  const isThisMarket = selectedMarketId === market.id;
  
  return (
    <div className="space-y-1.5" data-testid={`simplified-market-${market.id}`}>
      <div className="text-sm text-zinc-300">{market.question}</div>
      <div className="flex gap-2">
        {market.outcomes.map((outcome, idx) => {
          // Use live price from WebSocket if available, fall back to Gamma API
          const staticPrice = outcome.price ?? (idx === 0 ? market.bestAsk : market.bestBid) ?? 0;
          const price = getLivePrice(outcome.tokenId, staticPrice, livePrices);
          const priceInCents = Math.round(price * 100);
          const isSelected = isThisMarket && selectedOutcomeIndex === idx;
          
          return (
            <button
              key={idx}
              onClick={() => onSelect(market, idx, outcome.label)}
              className={`flex-1 px-3 py-2 rounded-md border transition-all text-center ${
                isSelected 
                  ? "border-wild-brand bg-wild-brand/20 text-white" 
                  : "border-zinc-700 bg-zinc-800/50 hover:border-zinc-600 hover:bg-zinc-800 text-zinc-200"
              }`}
              data-testid={`outcome-${market.id}-${idx}`}
            >
              <div className="text-xs text-zinc-400 truncate">{outcome.label}</div>
              <div className={`font-mono font-bold ${isSelected ? "text-wild-brand" : "text-wild-gold"}`}>
                {priceInCents}¢
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Additional markets section - simplified view for non-core market types
function AdditionalMarketsSection({
  marketGroups,
  eventTitle,
  onSelectMarket,
  selectedMarketId,
  selectedOutcomeIndex,
  livePrices,
}: {
  marketGroups: MarketGroup[];
  eventTitle: string;
  onSelectMarket: (market: ParsedMarket, eventTitle: string, marketType: string, outcomeIndex: number, outcomeLabel: string) => void;
  selectedMarketId?: string;
  selectedOutcomeIndex?: number;
  livePrices?: LivePricesMap;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Count total additional markets
  const totalMarkets = marketGroups.reduce((sum, g) => sum + g.markets.length, 0);
  
  if (totalMarkets === 0) return null;
  
  const handleSelect = (market: ParsedMarket, outcomeIndex: number, outcomeLabel: string) => {
    onSelectMarket(market, eventTitle, market.sportsMarketType, outcomeIndex, outcomeLabel);
  };
  
  return (
    <div className="border-t border-zinc-800 pt-3 mt-3">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full text-xs text-zinc-400 hover:text-zinc-300 transition-colors"
        data-testid="expand-more-markets"
      >
        <span className="font-medium uppercase tracking-wide">
          More Markets ({totalMarkets})
        </span>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )}
      </button>
      
      {isExpanded && (
        <div className="mt-3 space-y-4">
          {marketGroups.map((group) => (
            <div key={group.type} className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
                  {formatMarketTypeLabel(group.label)}
                </span>
                <span className="text-xs text-zinc-600">
                  {formatVolume(group.volume)} Vol.
                </span>
              </div>
              <div className="space-y-3">
                {group.markets.map((market) => (
                  <SimplifiedMarketRow
                    key={market.id}
                    market={market}
                    onSelect={handleSelect}
                    selectedMarketId={selectedMarketId}
                    selectedOutcomeIndex={selectedOutcomeIndex}
                    livePrices={livePrices}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Market group display with line selector for spreads/totals
function MarketGroupDisplay({
  group,
  eventTitle,
  league,
  leagueSlug,
  onSelectMarket,
  selectedMarketId,
  selectedDirection,
  livePrices
}: {
  group: MarketGroup;
  eventTitle: string;
  league?: string;
  leagueSlug?: string;
  onSelectMarket: (market: ParsedMarket, eventTitle: string, marketType: string, direction?: string, outcomeLabel?: string) => void;
  selectedMarketId?: string;
  selectedDirection?: string;
  livePrices?: LivePricesMap;
}) {
  // Check if this is a soccer moneyline (3-way: Home/Draw/Away)
  const isSoccerMoneyline = league && isSoccerLeague(league, leagueSlug) && group.type === "moneyline" && group.markets.length >= 3;
  
  // Extract unique lines from markets and sort them
  const lines = Array.from(new Set(group.markets.map(m => Math.abs(m.line || 0)))).sort((a, b) => a - b);
  const [selectedLine, setSelectedLine] = useState(lines.length > 0 ? lines[0] : 0);
  
  // Find market matching selected line (or first market if no lines)
  const activeMarket = group.markets.find(m => Math.abs(m.line || 0) === selectedLine) || group.markets[0];
  
  if (!activeMarket) return null;
  
  // Determine if this market is selected and what direction
  const isThisMarketSelected = selectedMarketId === activeMarket.id;
  
  // Handle selection for spreads (home/away direction)
  const handleSpreadSelect = (market: ParsedMarket, direction: "home" | "away") => {
    onSelectMarket(market, eventTitle, group.type, direction);
  };
  
  // Handle selection for totals (over/under direction)  
  const handleTotalsSelect = (market: ParsedMarket, direction: "over" | "under") => {
    onSelectMarket(market, eventTitle, group.type, direction);
  };
  
  // Handle selection for moneyline - pass outcome label for display in BetSlip
  const handleMoneylineSelect = (market: ParsedMarket, outcomeIndex: number) => {
    const direction = outcomeIndex === 0 ? "yes" : "no";
    const outcomeLabel = market.outcomes[outcomeIndex]?.label || market.groupItemTitle;
    onSelectMarket(market, eventTitle, group.type, direction, outcomeLabel);
  };
  
  // Handle selection for soccer 3-way moneyline
  const handleSoccerMoneylineSelect = (market: ParsedMarket, direction: "yes" | "no", outcomeLabel: string) => {
    onSelectMarket(market, eventTitle, group.type, direction, outcomeLabel);
  };
  
  // Compute selected direction only if this market is selected
  const spreadDirection = isThisMarketSelected ? (selectedDirection as "home" | "away" | null) : null;
  const totalsDirection = isThisMarketSelected ? (selectedDirection as "over" | "under" | null) : null;
  const moneylineOutcomeIndex = isThisMarketSelected && selectedDirection 
    ? (selectedDirection === "yes" ? 0 : selectedDirection === "no" ? 1 : null) 
    : null;
  
  // For tennis, use the market's question field which is more descriptive
  // e.g., "Medjedovic vs. Kovacevic: Match O/U 21.5" instead of "Tennis Match Totals"
  const isTennis = league && isTennisLeague(league, leagueSlug);
  const displayLabel = isTennis && activeMarket.question 
    ? activeMarket.question 
    : formatMarketTypeLabel(group.label);
  
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs font-medium text-zinc-400 ${isTennis ? "normal-case" : "uppercase"} tracking-wide truncate`}>
          {displayLabel}
        </span>
        <span className="text-xs text-zinc-600 shrink-0">
          {formatVolume(group.volume)} Vol.
        </span>
      </div>
      
      {group.type === "spreads" && (
        <>
          <SpreadMarketDisplay
            market={activeMarket}
            eventTitle={eventTitle}
            onSelect={handleSpreadSelect}
            selectedDirection={spreadDirection}
            livePrices={livePrices}
          />
          <LineSelector lines={lines} selectedLine={selectedLine} onSelect={setSelectedLine} />
        </>
      )}
      
      {group.type === "totals" && (
        <>
          <TotalsMarketDisplay
            market={activeMarket}
            onSelect={handleTotalsSelect}
            selectedDirection={totalsDirection}
            livePrices={livePrices}
          />
          <LineSelector lines={lines} selectedLine={selectedLine} onSelect={setSelectedLine} />
        </>
      )}
      
      {group.type === "moneyline" && isSoccerMoneyline && (
        <SoccerMoneylineDisplay
          markets={group.markets}
          eventTitle={eventTitle}
          onSelect={handleSoccerMoneylineSelect}
          selectedMarketId={selectedMarketId}
          selectedDirection={selectedDirection}
          livePrices={livePrices}
        />
      )}
      
      {group.type === "moneyline" && !isSoccerMoneyline && (
        <MoneylineMarketDisplay
          market={activeMarket}
          eventTitle={eventTitle}
          onSelect={handleMoneylineSelect}
          selectedOutcomeIndex={moneylineOutcomeIndex}
          livePrices={livePrices}
        />
      )}
      
      {group.type !== "spreads" && group.type !== "totals" && group.type !== "moneyline" && (
        <MoneylineMarketDisplay
          market={activeMarket}
          eventTitle={eventTitle}
          onSelect={handleMoneylineSelect}
          selectedOutcomeIndex={moneylineOutcomeIndex}
          livePrices={livePrices}
        />
      )}
    </div>
  );
}

interface UserPosition {
  tokenId: string;
  size: number;
  avgPrice: number;
  outcomeLabel?: string;
  marketQuestion?: string;
  unrealizedPnl?: number;
}

// New EventCard component using DisplayEvent
function EventCard({ 
  event, 
  onSelectMarket,
  onSelectAdditionalMarket,
  selectedMarketId,
  selectedDirection,
  selectedOutcomeIndex,
  userPositions = [],
  livePrices,
}: { 
  event: DisplayEvent;
  onSelectMarket: (market: ParsedMarket, eventTitle: string, marketType: string, direction?: string, outcomeLabel?: string) => void;
  onSelectAdditionalMarket: (market: ParsedMarket, eventTitle: string, marketType: string, outcomeIndex: number, outcomeLabel: string) => void;
  selectedMarketId?: string;
  selectedDirection?: string;
  selectedOutcomeIndex?: number;
  userPositions?: UserPosition[];
  livePrices?: Map<string, { bestAsk: number; bestBid: number }>;
}) {
  const countdown = getCountdown(event.gameStartTime);
  
  // Separate core markets (polished UI) from additional markets (simplified view)
  const coreMarketGroups = event.marketGroups.filter(g => CORE_MARKET_TYPES.includes(g.type));
  const additionalMarketGroups = event.marketGroups.filter(g => !CORE_MARKET_TYPES.includes(g.type));
  
  // Find positions that match any market in this event
  const eventPositions: UserPosition[] = [];
  for (const group of event.marketGroups) {
    for (const market of group.markets) {
      for (const outcome of market.outcomes) {
        const matchingPos = userPositions.find(p => p.tokenId === outcome.tokenId);
        if (matchingPos) {
          eventPositions.push({
            ...matchingPos,
            outcomeLabel: matchingPos.outcomeLabel || outcome.label,
          });
        }
      }
    }
  }
  
  return (
    <Card className="p-4 space-y-4" data-testid={`event-card-${event.id}`}>
      {/* Position Indicator - Dashboard style */}
      {eventPositions.length > 0 && (
        <div className="bg-wild-trade/10 border border-wild-trade/30 rounded-md overflow-hidden" data-testid="position-indicator">
          <div className="px-3 py-2 border-b border-wild-trade/20 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-wild-trade animate-pulse" />
            <span className="text-[10px] font-bold text-wild-trade uppercase tracking-wider">Your Position</span>
          </div>
          <div className="divide-y divide-zinc-800/50">
            {eventPositions.map((pos, i) => (
              <div key={i} className="px-3 py-2" data-testid={`event-position-${i}`}>
                <div className="flex justify-between items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-white truncate">{pos.marketQuestion || event.title}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] font-mono text-zinc-500">{pos.outcomeLabel || "Yes"}</span>
                      <span className="text-[10px] font-mono text-wild-trade">@{pos.avgPrice.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-mono text-white">{pos.size.toFixed(2)} shares</div>
                    {pos.unrealizedPnl !== undefined && (
                      <div className={`text-[10px] font-mono ${pos.unrealizedPnl >= 0 ? "text-wild-scout" : "text-wild-brand"}`}>
                        {pos.unrealizedPnl >= 0 ? "+" : ""}{pos.unrealizedPnl.toFixed(2)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Event Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-base leading-tight">{event.title}</h3>
          {event.description && (
            <p className="text-sm text-zinc-400 mt-1 line-clamp-2">{event.description}</p>
          )}
          <div className="flex items-center gap-2 text-xs text-zinc-500 mt-1.5">
            <span className="font-medium">{event.league}</span>
            <span>•</span>
            <span>{formatVolume(event.volume)} vol</span>
          </div>
        </div>
        <Badge 
          variant={countdown.isLive ? "destructive" : "secondary"} 
          className={`shrink-0 ${countdown.isLive ? "animate-pulse" : ""}`}
        >
          {countdown.isLive ? (
            <Radio className="w-3 h-3 mr-1" />
          ) : (
            <Clock className="w-3 h-3 mr-1" />
          )}
          {countdown.text}
        </Badge>
      </div>
      
      {/* Core Market Groups - Polished UI */}
      {coreMarketGroups.map((group) => (
        <MarketGroupDisplay
          key={group.type}
          group={group}
          eventTitle={event.title}
          league={event.league}
          leagueSlug={event.leagueSlug}
          onSelectMarket={onSelectMarket}
          selectedMarketId={selectedMarketId}
          selectedDirection={selectedDirection}
          livePrices={livePrices}
        />
      ))}
      
      {/* Additional Markets - Simplified expandable view */}
      {additionalMarketGroups.length > 0 && (
        <AdditionalMarketsSection
          marketGroups={additionalMarketGroups}
          eventTitle={event.title}
          onSelectMarket={onSelectAdditionalMarket}
          selectedMarketId={selectedMarketId}
          selectedOutcomeIndex={selectedOutcomeIndex}
          livePrices={livePrices}
        />
      )}
    </Card>
  );
}

// Extract short display name from futures outcome label
function getShortOutcomeLabel(label: string): string {
  if (!label) return label;
  
  // If already short (20 chars or less with no common phrases), return as-is
  const lower = label.toLowerCase();
  if (label.length <= 20 && 
      !lower.includes("finish") && 
      !lower.includes(" win ") && 
      !lower.includes(" to ") &&
      !lower.includes("in the")) {
    return label;
  }
  
  // Remove "Will " prefix
  let cleaned = label.replace(/^Will /i, "").trim();
  
  // Try to extract the subject (team/player name) before the verb
  // Pattern: Extract everything before common verbs/prepositions
  const verbPattern = /^(.+?)(?:\s+(?:to|will|finish|win|be|make|qualify|reach|place|get|score|have|become|in the|for the))/i;
  const match = cleaned.match(verbPattern);
  if (match && match[1] && match[1].length >= 3) {
    return match[1].trim();
  }
  
  // Fallback: take first few words (up to 25 chars)
  if (cleaned.length > 25) {
    const words = cleaned.split(" ");
    let result = "";
    for (const word of words) {
      if ((result + " " + word).length <= 25) {
        result = result ? result + " " + word : word;
      } else {
        break;
      }
    }
    return result || cleaned.substring(0, 25);
  }
  
  return cleaned;
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
                  className={`flex items-center justify-between gap-2 px-3 py-2 rounded-md border transition-colors ${
                    isSelected 
                      ? "border-wild-brand bg-wild-brand/10" 
                      : "border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/50"
                  }`}
                  data-testid={`futures-outcome-${future.id}-${index}`}
                >
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-sm truncate font-medium">{getShortOutcomeLabel(outcome.label)}</span>
                    <span className="text-xs text-zinc-500">{probability.toFixed(0)}%</span>
                  </div>
                  <span className={`font-mono text-base font-bold shrink-0 ${
                    isSelected ? "text-wild-brand" : "text-wild-gold"
                  }`}>
                    {outcome.odds.toFixed(2)}
                  </span>
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

export function PredictView({ 
  markets, 
  displayEvents,
  futures, 
  isLoading, 
  futuresLoading, 
  onPlaceBet, 
  selectedBet, 
  adminSettings,
  userPositions = [],
  livePrices,
}: PredictViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<PredictSubTab>("matchday");
  const [selectedLeagues, setSelectedLeagues] = useState<Set<string>>(new Set());

  // Load sport market configs for dynamic formatting
  const { data: sportConfigs = [] } = useQuery<SportMarketConfig[]>({
    queryKey: ["/api/admin/sport-market-configs"],
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
  
  const configMap = buildConfigMap(sportConfigs);
  
  // Extract all token IDs from visible events for WebSocket subscription
  const allTokenIds = useMemo(() => {
    const tokenIds: string[] = [];
    for (const event of displayEvents) {
      for (const group of event.marketGroups) {
        for (const market of group.markets) {
          if (market.clobTokenIds) {
            tokenIds.push(...market.clobTokenIds);
          }
          for (const outcome of market.outcomes) {
            if (outcome.tokenId) {
              tokenIds.push(outcome.tokenId);
            }
          }
        }
      }
    }
    // Remove duplicates
    return [...new Set(tokenIds)];
  }, [displayEvents]);
  
  // Subscribe to live prices for visible markets
  // Note: subscribe/unsubscribe are stable callbacks from useLivePrices hook
  const { subscribe, unsubscribe } = livePrices || {};
  useEffect(() => {
    if (subscribe && allTokenIds.length > 0) {
      subscribe(allTokenIds);
    }
    return () => {
      if (unsubscribe && allTokenIds.length > 0) {
        unsubscribe(allTokenIds);
      }
    };
  }, [subscribe, unsubscribe, allTokenIds]);

  // Filter and categorize events
  const filteredEvents = displayEvents.filter(event => {
    if (!isWithin5Days(event.gameStartTime)) return false;
    if (event.status === "ended") return false;
    if (selectedLeagues.size === 0) return true;
    return selectedLeagues.has(event.league);
  });
  
  const liveEvents = filteredEvents.filter(e => e.status === "live");
  const upcomingEvents = filteredEvents
    .filter(e => e.status === "upcoming")
    .sort((a, b) => new Date(a.gameStartTime).getTime() - new Date(b.gameStartTime).getTime());
  
  const availableLeagues = Array.from(
    new Set(displayEvents.map(e => e.league))
  ).sort();
  
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

  const handleSelectMarket = (market: ParsedMarket, eventTitle: string, marketType: string, direction?: string, soccerOutcomeLabel?: string) => {
    // Determine which outcome based on direction
    // For spreads: "home" = index 0, "away" = index 1
    // For totals: "over" = index 0, "under" = index 1
    // For moneyline: "yes" = index 0, "no" = index 1
    let outcomeIndex = 0;
    if (direction === "away" || direction === "under" || direction === "no") {
      outcomeIndex = 1;
    }
    
    const outcome = market.outcomes[outcomeIndex];
    // Use executionPrice for order submission (bestAsk or buffered price for instant fills)
    const execPrice = outcome?.executionPrice || outcome?.price || market.bestAsk || 0.5;
    const odds = execPrice > 0 ? 1 / execPrice : 2;
    
    // Extract CLOB token IDs based on direction
    const yesTokenId = market.clobTokenIds?.[0] || market.outcomes[0]?.tokenId;
    const noTokenId = market.clobTokenIds?.[1] || market.outcomes[1]?.tokenId;
    
    // Use executionPrice for each outcome (what user will actually pay)
    const yesPrice = market.outcomes[0]?.executionPrice || market.outcomes[0]?.price || market.bestAsk || 0.5;
    const noPrice = market.outcomes[1]?.executionPrice || market.outcomes[1]?.price || 0.5;
    
    // Create a descriptive outcome label
    // For soccer 3-way, use the parsed team name passed from SoccerMoneylineDisplay
    let outcomeLabel = soccerOutcomeLabel || market.groupItemTitle;
    if (!soccerOutcomeLabel) {
      if (marketType === "spreads" && market.line !== undefined) {
        const line = market.line;
        if (direction === "home") {
          outcomeLabel = `${getTeamAbbreviation(market.outcomes[0].label)} ${line > 0 ? "+" : ""}${line}`;
        } else {
          outcomeLabel = `${getTeamAbbreviation(market.outcomes[1].label)} ${-line > 0 ? "+" : ""}${-line}`;
        }
      } else if (marketType === "totals" && market.line !== undefined) {
        outcomeLabel = direction === "over" ? `O ${market.line}` : `U ${market.line}`;
      } else if (outcome) {
        outcomeLabel = getTeamAbbreviation(outcome.label);
      }
    }
    
    // Map direction to "yes" | "no" for BetSlip
    const betDirection: "yes" | "no" = outcomeIndex === 0 ? "yes" : "no";
    
    // Pass to parent with all info for bet slip
    onPlaceBet(
      market.id, 
      market.conditionId, 
      odds,
      eventTitle,
      outcomeLabel,
      marketType,
      betDirection,
      yesTokenId,
      noTokenId,
      yesPrice,
      noPrice,
      market.orderMinSize
    );
  };
  
  // Handler for additional markets (simplified view) - uses direct outcome labels
  const handleSelectAdditionalMarket = (market: ParsedMarket, eventTitle: string, marketType: string, outcomeIndex: number, outcomeLabel: string) => {
    const outcome = market.outcomes[outcomeIndex];
    // Use executionPrice for order submission (bestAsk or buffered price for instant fills)
    const execPrice = outcome?.executionPrice || outcome?.price || (outcomeIndex === 0 ? market.bestAsk : 0.5) || 0.5;
    const odds = execPrice > 0 ? 1 / execPrice : 2;
    
    // Extract CLOB token IDs - use the selected outcome's token
    const selectedTokenId = market.clobTokenIds?.[outcomeIndex] || outcome?.tokenId;
    const otherTokenId = market.clobTokenIds?.[outcomeIndex === 0 ? 1 : 0] || market.outcomes[outcomeIndex === 0 ? 1 : 0]?.tokenId;
    
    // Use outcome's token as the outcomeId for bet placement
    const outcomeId = selectedTokenId || outcome?.tokenId || market.conditionId;
    
    // Use executionPrice for each outcome (what user will actually pay)
    const yesPrice = market.outcomes[0]?.executionPrice || market.outcomes[0]?.price || market.bestAsk || 0.5;
    const noPrice = market.outcomes[1]?.executionPrice || market.outcomes[1]?.price || 0.5;
    
    // Map direction to "yes" | "no" for BetSlip
    const betDirection: "yes" | "no" = outcomeIndex === 0 ? "yes" : "no";
    
    // Use the question as market title and outcome label directly
    onPlaceBet(
      market.id, 
      outcomeId, 
      odds,
      market.question || eventTitle,
      outcomeLabel,
      marketType,
      betDirection,
      selectedTokenId,
      otherTokenId,
      yesPrice,
      noPrice,
      market.orderMinSize
    );
  };

  return (
    <SportConfigContext.Provider value={configMap}>
      <div className="flex flex-col h-full animate-fade-in">
        <PriceTicker events={displayEvents} />
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
                {liveEvents.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-bold text-red-400">
                      <Radio className="w-4 h-4 animate-pulse" />
                      LIVE NOW ({liveEvents.length})
                    </div>
                    {liveEvents.map((event) => (
                      <EventCard
                        key={event.id}
                        event={event}
                        onSelectMarket={handleSelectMarket}
                        onSelectAdditionalMarket={handleSelectAdditionalMarket}
                        selectedMarketId={selectedBet?.marketId}
                        selectedDirection={selectedBet?.direction}
                        userPositions={userPositions}
                        livePrices={livePrices?.prices}
                      />
                    ))}
                  </div>
                )}
                
                {upcomingEvents.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-bold text-zinc-400">
                      <Clock className="w-4 h-4" />
                      UPCOMING ({upcomingEvents.length})
                    </div>
                    {upcomingEvents.map((event) => (
                      <EventCard
                        key={event.id}
                        event={event}
                        onSelectMarket={handleSelectMarket}
                        onSelectAdditionalMarket={handleSelectAdditionalMarket}
                        selectedMarketId={selectedBet?.marketId}
                        selectedDirection={selectedBet?.direction}
                        userPositions={userPositions}
                        livePrices={livePrices?.prices}
                      />
                    ))}
                  </div>
                )}
                
                {liveEvents.length === 0 && upcomingEvents.length === 0 && (
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
        
        {/* Powered by Polymarket attribution */}
        <div className="shrink-0 py-3 px-4 border-t border-zinc-800 bg-zinc-950 flex justify-center" data-testid="container-polymarket-attribution">
          <Button
            variant="ghost"
            size="sm"
            asChild
          >
            <a 
              href="https://polymarket.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-zinc-500"
              data-testid="link-polymarket-attribution"
            >
              <span className="text-xs font-medium">Powered by</span>
              <img 
                src="https://polymarket.com/images/brand/icon-white.png" 
                alt="Polymarket" 
                className="h-4 w-4 opacity-60"
                data-testid="img-polymarket-logo"
              />
              <span className="text-xs font-bold tracking-wide">POLYMARKET</span>
            </a>
          </Button>
        </div>
      </div>
    </SportConfigContext.Provider>
  );
}
