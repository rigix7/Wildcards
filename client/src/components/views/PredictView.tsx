import { useState, useEffect, useRef, createContext, useContext } from "react";
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
  onPlaceBet: (marketId: string, outcomeId: string, odds: number, marketTitle?: string, outcomeLabel?: string, marketType?: string, direction?: string, yesTokenId?: string, noTokenId?: string) => void;
  selectedBet?: { marketId: string; outcomeId: string; direction?: string };
  adminSettings?: AdminSettings;
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

// Price ticker using DisplayEvents with CSS infinite marquee animation
function PriceTicker({ events }: { events: DisplayEvent[] }) {
  if (events.length === 0) return null;
  
  // Filter to only events within 5 days (same as Match Day view)
  const filteredEvents = events.filter(e => isWithin5Days(e.gameStartTime) && e.status !== "ended");
  
  if (filteredEvents.length === 0) return null;
  
  // Extract ticker items from all events' moneyline markets
  const tickerItems: { title: string; price: number }[] = [];
  
  for (const event of filteredEvents.slice(0, 8)) {
    const moneylineGroup = event.marketGroups.find(g => g.type === "moneyline");
    if (!moneylineGroup) continue;
    
    for (const market of moneylineGroup.markets.slice(0, 3)) {
      const yesPrice = market.bestAsk || market.outcomes[0]?.price || 0;
      tickerItems.push({
        title: `${event.league}: ${market.groupItemTitle}`,
        price: Math.round(yesPrice * 100),
      });
    }
  }
  
  if (tickerItems.length === 0) return null;
  
  // Calculate animation duration based on number of items (faster animation)
  const animationDuration = Math.max(10, tickerItems.length * 2);
  
  return (
    <div className="bg-zinc-900/80 border-b border-zinc-800 overflow-hidden">
      <style>
        {`
          @keyframes marquee {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
          .ticker-content {
            animation: marquee ${animationDuration}s linear infinite;
          }
          .ticker-content:hover {
            animation-play-state: paused;
          }
        `}
      </style>
      <div className="ticker-content flex whitespace-nowrap py-2 px-3 gap-8">
        {[...tickerItems, ...tickerItems].map((item, idx) => (
          <div key={idx} className="flex items-center gap-2 text-xs shrink-0">
            <span className="text-zinc-400">{item.title}</span>
            <span className="text-wild-gold font-mono font-bold">{item.price}¢</span>
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
  selectedDirection
}: {
  market: ParsedMarket;
  eventTitle: string;
  onSelect: (market: ParsedMarket, direction: "home" | "away") => void;
  selectedDirection?: "home" | "away" | null;
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
  
  // Prices: use bestAsk for the market (primary price), and outcome.price as fallback
  const homePrice = Math.round((outcomes[0].price || market.bestAsk) * 100);
  const awayPrice = Math.round((outcomes[1].price || (1 - market.bestAsk)) * 100);
  
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
  selectedDirection
}: {
  market: ParsedMarket;
  onSelect: (market: ParsedMarket, direction: "over" | "under") => void;
  selectedDirection?: "over" | "under" | null;
}) {
  const outcomes = market.outcomes;
  if (outcomes.length < 2) return null;
  
  // Use market.line if available, otherwise try to parse from groupItemTitle
  const line = market.line ?? parseLineFromTitle(market.groupItemTitle) ?? 0;
  
  // Outcomes: ["Over", "Under"] with their prices (use bestAsk with fallback to outcome.price)
  const overPrice = Math.round((outcomes[0].price || market.bestAsk) * 100);
  const underPrice = Math.round((outcomes[1].price || (1 - market.bestAsk)) * 100);
  
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

// Soccer 3-way moneyline display - shows Home/Draw/Away with prices
// Clicking any option opens betslip with Yes/No choice for that specific market
function SoccerMoneylineDisplay({
  markets,
  eventTitle,
  onSelect,
  selectedMarketId,
  selectedDirection
}: {
  markets: ParsedMarket[];
  eventTitle: string;
  onSelect: (market: ParsedMarket, direction: "yes" | "no", outcomeLabel: string) => void;
  selectedMarketId?: string;
  selectedDirection?: string | null;
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
  
  return (
    <div className="flex gap-2">
      {sortedMarkets.map((market, idx) => {
        // Get Yes price (outcome[0] is typically "Yes")
        const yesPrice = market.outcomes[0]?.price || market.bestAsk || 0;
        const priceInCents = Math.round(yesPrice * 100);
        
        // Parse team name from question (e.g., "Will Genoa win?" -> "Genoa")
        // Use groupItemTitle as fallback if question parsing fails
        const label = parseSoccerOutcomeName(market.question, market.groupItemTitle);
        const isDraw = label === "Draw";
        
        const isSelected = selectedMarketId === market.id;
        const isYesSelected = isSelected && selectedDirection === "yes";
        
        // Color: Home (teal), Draw (zinc), Away (red)
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
            ? "bg-red-600 border-red-500" 
            : "bg-red-900/40 border-red-800/50 hover:bg-red-800/50";
        }
        
        return (
          <button
            key={market.id}
            onClick={() => onSelect(market, "yes", label)}
            className={`flex-1 flex flex-col items-center gap-1 px-3 py-2 rounded-md border text-sm transition-all ${colorClass} text-zinc-100`}
            data-testid={`soccer-moneyline-${market.id}`}
          >
            <span className="font-medium text-xs truncate max-w-full">{label}</span>
            <span className="font-mono font-bold text-white">{priceInCents}¢</span>
          </button>
        );
      })}
    </div>
  );
}

// Moneyline market display - shows team buttons with prices
function MoneylineMarketDisplay({
  market,
  eventTitle,
  onSelect,
  selectedOutcomeIndex
}: {
  market: ParsedMarket;
  eventTitle: string;
  onSelect: (market: ParsedMarket, outcomeIndex: number) => void;
  selectedOutcomeIndex?: number | null;
}) {
  const outcomes = market.outcomes;
  
  return (
    <div className="flex flex-wrap gap-2">
      {outcomes.map((outcome, idx) => {
        // Use outcome.price with bestAsk fallback
        const priceInCents = Math.round((outcome.price || market.bestAsk) * 100);
        const abbr = getTeamAbbreviation(outcome.label);
        const isSelected = selectedOutcomeIndex === idx;
        
        return (
          <button
            key={idx}
            onClick={() => onSelect(market, idx)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm transition-all ${
              isSelected 
                ? "border-wild-brand bg-wild-brand/20 text-white" 
                : "border-zinc-700 bg-zinc-800/50 hover:border-zinc-600 hover:bg-zinc-800 text-zinc-200"
            }`}
            data-testid={`moneyline-${market.id}-${idx}`}
          >
            <span className="font-medium">{abbr}</span>
            <span className={`font-mono font-bold ${isSelected ? "text-wild-brand" : "text-wild-gold"}`}>
              {priceInCents}¢
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Check if league is a soccer league
const SOCCER_LEAGUES = ["Premier League", "La Liga", "Bundesliga", "Serie A", "Ligue 1", "Champions League", "Europa League", "MLS"];

function isSoccerLeague(league: string): boolean {
  return SOCCER_LEAGUES.some(sl => league.toLowerCase().includes(sl.toLowerCase()));
}

// Check if league is a tennis league
const TENNIS_LEAGUES = ["ATP Tennis", "WTA Tennis", "ATP", "WTA"];

function isTennisLeague(league: string): boolean {
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
}: {
  market: ParsedMarket;
  onSelect: (market: ParsedMarket, outcomeIndex: number, outcomeLabel: string) => void;
  selectedMarketId?: string;
  selectedOutcomeIndex?: number;
}) {
  const isThisMarket = selectedMarketId === market.id;
  
  return (
    <div className="space-y-1.5" data-testid={`simplified-market-${market.id}`}>
      <div className="text-sm text-zinc-300">{market.question}</div>
      <div className="flex gap-2">
        {market.outcomes.map((outcome, idx) => {
          const price = outcome.price || (idx === 0 ? market.bestAsk : market.bestBid) || 0;
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
}: {
  marketGroups: MarketGroup[];
  eventTitle: string;
  onSelectMarket: (market: ParsedMarket, eventTitle: string, marketType: string, outcomeIndex: number, outcomeLabel: string) => void;
  selectedMarketId?: string;
  selectedOutcomeIndex?: number;
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
  onSelectMarket,
  selectedMarketId,
  selectedDirection
}: {
  group: MarketGroup;
  eventTitle: string;
  league?: string;
  onSelectMarket: (market: ParsedMarket, eventTitle: string, marketType: string, direction?: string, outcomeLabel?: string) => void;
  selectedMarketId?: string;
  selectedDirection?: string;
}) {
  // Check if this is a soccer moneyline (3-way: Home/Draw/Away)
  const isSoccerMoneyline = league && isSoccerLeague(league) && group.type === "moneyline" && group.markets.length >= 3;
  
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
  
  // Handle selection for moneyline
  const handleMoneylineSelect = (market: ParsedMarket, outcomeIndex: number) => {
    const direction = outcomeIndex === 0 ? "yes" : "no";
    onSelectMarket(market, eventTitle, group.type, direction);
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
  const isTennis = league && isTennisLeague(league);
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
        />
      )}
      
      {group.type === "moneyline" && !isSoccerMoneyline && (
        <MoneylineMarketDisplay
          market={activeMarket}
          eventTitle={eventTitle}
          onSelect={handleMoneylineSelect}
          selectedOutcomeIndex={moneylineOutcomeIndex}
        />
      )}
      
      {group.type !== "spreads" && group.type !== "totals" && group.type !== "moneyline" && (
        <MoneylineMarketDisplay
          market={activeMarket}
          eventTitle={eventTitle}
          onSelect={handleMoneylineSelect}
          selectedOutcomeIndex={moneylineOutcomeIndex}
        />
      )}
    </div>
  );
}

// New EventCard component using DisplayEvent
function EventCard({ 
  event, 
  onSelectMarket,
  onSelectAdditionalMarket,
  selectedMarketId,
  selectedDirection,
  selectedOutcomeIndex,
}: { 
  event: DisplayEvent;
  onSelectMarket: (market: ParsedMarket, eventTitle: string, marketType: string, direction?: string, outcomeLabel?: string) => void;
  onSelectAdditionalMarket: (market: ParsedMarket, eventTitle: string, marketType: string, outcomeIndex: number, outcomeLabel: string) => void;
  selectedMarketId?: string;
  selectedDirection?: string;
  selectedOutcomeIndex?: number;
}) {
  const countdown = getCountdown(event.gameStartTime);
  
  // Separate core markets (polished UI) from additional markets (simplified view)
  const coreMarketGroups = event.marketGroups.filter(g => CORE_MARKET_TYPES.includes(g.type));
  const additionalMarketGroups = event.marketGroups.filter(g => !CORE_MARKET_TYPES.includes(g.type));
  
  return (
    <Card className="p-4 space-y-4" data-testid={`event-card-${event.id}`}>
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
          onSelectMarket={onSelectMarket}
          selectedMarketId={selectedMarketId}
          selectedDirection={selectedDirection}
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
  adminSettings 
}: PredictViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<PredictSubTab>("matchday");
  const [selectedLeagues, setSelectedLeagues] = useState<Set<string>>(new Set());

  // Load sport market configs for dynamic formatting
  const { data: sportConfigs = [] } = useQuery<SportMarketConfig[]>({
    queryKey: ["/api/admin/sport-market-configs"],
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
  
  const configMap = buildConfigMap(sportConfigs);

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
    const price = outcome?.price || market.bestAsk || 0.5;
    const odds = price > 0 ? 1 / price : 2;
    
    // Extract CLOB token IDs based on direction
    const yesTokenId = market.clobTokenIds?.[0] || market.outcomes[0]?.tokenId;
    const noTokenId = market.clobTokenIds?.[1] || market.outcomes[1]?.tokenId;
    
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
    
    // Pass to parent with all info for bet slip
    onPlaceBet(
      market.id, 
      market.conditionId, 
      odds,
      eventTitle,
      outcomeLabel,
      marketType,
      direction,
      yesTokenId,
      noTokenId
    );
  };
  
  // Handler for additional markets (simplified view) - uses direct outcome labels
  const handleSelectAdditionalMarket = (market: ParsedMarket, eventTitle: string, marketType: string, outcomeIndex: number, outcomeLabel: string) => {
    const outcome = market.outcomes[outcomeIndex];
    const price = outcome?.price || (outcomeIndex === 0 ? market.bestAsk : market.bestBid) || 0.5;
    const odds = price > 0 ? 1 / price : 2;
    
    // Extract CLOB token IDs - use the selected outcome's token
    const selectedTokenId = market.clobTokenIds?.[outcomeIndex] || outcome?.tokenId;
    const otherTokenId = market.clobTokenIds?.[outcomeIndex === 0 ? 1 : 0] || market.outcomes[outcomeIndex === 0 ? 1 : 0]?.tokenId;
    
    // Use outcome's token as the outcomeId for bet placement
    const outcomeId = selectedTokenId || outcome?.tokenId || market.conditionId;
    
    // Use the question as market title and outcome label directly
    onPlaceBet(
      market.id, 
      outcomeId, 
      odds,
      market.question || eventTitle,
      outcomeLabel,
      marketType,
      outcomeIndex === 0 ? "yes" : "no",
      selectedTokenId,
      otherTokenId
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
      </div>
    </SportConfigContext.Provider>
  );
}
