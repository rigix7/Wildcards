import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Shield, Lock, Loader2, TrendingUp, Calendar, Radio, Clock, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from "lucide-react";
import { SubTabs } from "@/components/terminal/SubTabs";
import { MarketCardSkeleton } from "@/components/terminal/MarketCard";
import { EmptyState } from "@/components/terminal/EmptyState";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Market, Futures, AdminSettings, FuturesCategory } from "@shared/schema";
import type { DisplayEvent, ParsedMarket, MarketGroup } from "@/lib/polymarket";
import { prefetchTeams } from "@/lib/polymarket";
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
  onPlaceBet: (marketId: string, outcomeId: string, odds: number, marketTitle?: string, outcomeLabel?: string, marketType?: string, direction?: "yes" | "no", yesTokenId?: string, noTokenId?: string, yesPrice?: number, noPrice?: number, orderMinSize?: number, question?: string, isSoccer3Way?: boolean, negRisk?: boolean) => void;
  selectedBet?: { marketId: string; outcomeId: string; direction?: string };
  adminSettings?: AdminSettings;
  userPositions?: { tokenId: string; size: number; avgPrice: number; outcomeLabel?: string; marketQuestion?: string; unrealizedPnl?: number; negRisk?: boolean }[];
  livePrices?: UseLivePricesResult;
  enabledTags?: { id: string; label: string; slug: string }[];
  futuresCategories?: FuturesCategory[];
  onSellPosition?: (position: { tokenId: string; size: number; avgPrice: number; outcomeLabel?: string; marketQuestion?: string; negRisk?: boolean }) => void;
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

// Detect events that are effectively ended based on 100¢ moneyline price
// When any outcome hits 100¢, the game is over but not yet officially resolved
function isEffectivelyEnded(event: DisplayEvent, livePrices?: LivePricesMap): boolean {
  const moneylineGroup = event.marketGroups.find(g => g.type === "moneyline");
  if (!moneylineGroup || moneylineGroup.markets.length === 0) return false;
  
  // Check if any moneyline market/outcome is at 100¢
  // For soccer 3-way, each market represents a team/draw outcome
  for (const market of moneylineGroup.markets) {
    // First check market.bestAsk (used by soccer 3-way markets)
    if (market.bestAsk && market.bestAsk >= 0.995) {
      return true;
    }
    
    // Then check individual outcomes (for 2-way markets and as fallback)
    for (const outcome of market.outcomes) {
      // Use live price if available
      if (livePrices && outcome.tokenId) {
        const liveData = livePrices.get(outcome.tokenId);
        if (liveData && liveData.bestAsk >= 0.995) {
          return true;
        }
      }
      // Fall back to static price or executionPrice
      const staticPrice = outcome.executionPrice || outcome.price || 0;
      if (staticPrice >= 0.995) {
        return true;
      }
    }
  }
  
  return false;
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
// Format: {category} {event}: {team1Abbr} {price} | {team2Abbr} {price}
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
    
    // For 2-way markets (tennis, etc), use the outcome labels directly
    // For 3-way markets (soccer), use individual market groupItemTitle
    const isTwoWayEvent = moneylineGroup.markets.length === 1 && 
                          moneylineGroup.markets[0].outcomes.length === 2;
    
    if (isTwoWayEvent) {
      // 2-way: single market with 2 outcomes (e.g., Player A vs Player B)
      const market = moneylineGroup.markets[0];
      for (let i = 0; i < market.outcomes.length; i++) {
        const outcome = market.outcomes[i];
        const price = outcome.price || 0;
        // Use outcome-level abbrev (from slug parsing), or fall back to outcome label
        const abbrev = outcome.abbrev || outcome.label.slice(0, 7).toUpperCase();
        outcomes.push({
          abbrev,
          price: Math.round(price * 100),
        });
      }
    } else {
      // 3-way: multiple markets (each for a team/draw)
      for (const market of moneylineGroup.markets.slice(0, 3)) {
        const yesPrice = market.bestAsk || market.outcomes[0]?.price || 0;
        // Check if it's a draw
        const fullName = market.groupItemTitle || market.question || "";
        const isDraw = fullName.toLowerCase().includes("draw") || fullName.toLowerCase().includes("tie");
        // Use official teamAbbrev from Polymarket slug (can be up to 7 chars)
        const abbrev = isDraw 
          ? "Draw" 
          : market.teamAbbrev || fullName.slice(0, 3).toUpperCase();
        
        outcomes.push({
          abbrev,
          price: Math.round(yesPrice * 100),
        });
      }
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
    <div className="sticky top-0 z-10 bg-zinc-950 pb-2 pt-1 -mx-3 px-3">
      <div className="flex gap-2 overflow-x-auto pb-1 px-1">
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
            {line}
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

// Parse spread line from question text - returns team name and signed line
// Question format: "Spread: Clippers (-2.5)" or "1H Spread: 76ers (-0.5)"
// Returns: { team: "Clippers", line: -2.5, lineStr: "-2.5" } or null
function parseSpreadFromQuestion(question: string): { team: string; line: number; lineStr: string } | null {
  // Match pattern: "Team Name (±X.X)" where the line is in parentheses
  const match = question.match(/:\s*([^(]+?)\s*\(([+-]?\d+\.?\d*)\)/);
  if (match) {
    const team = match[1].trim();
    const line = parseFloat(match[2]);
    const lineStr = line >= 0 ? `+${line}` : `${line}`;
    return { team, line, lineStr };
  }
  return null;
}

// Get spread line labels for each outcome based on the question
// Returns array of display labels like ["Clippers -2.5", "Raptors +2.5"]
// Uses abbreviations when available for compact display
function getSpreadLabelsForOutcomes(
  outcomes: Array<{ label: string; abbrev?: string }>,
  question: string
): { label: string; abbrev?: string; lineStr: string }[] {
  const parsed = parseSpreadFromQuestion(question);
  if (!parsed) {
    // Fallback: just return team names without lines
    return outcomes.map(o => ({ label: o.label, abbrev: o.abbrev, lineStr: "" }));
  }
  
  const { team: questionTeam, line } = parsed;
  const questionTeamLower = questionTeam.toLowerCase();
  
  // Find which outcome matches the team in the question (they have the negative/stated line)
  // The other team has the opposite line
  return outcomes.map(outcome => {
    const outcomeLower = outcome.label.toLowerCase();
    const isQuestionTeam = outcomeLower.includes(questionTeamLower) || questionTeamLower.includes(outcomeLower);
    
    if (isQuestionTeam) {
      // This team has the line stated in the question
      const lineStr = line >= 0 ? `+${line}` : `${line}`;
      return { label: outcome.label, abbrev: outcome.abbrev, lineStr };
    } else {
      // Other team has the opposite line
      const oppositeLineStr = (-line) >= 0 ? `+${-line}` : `${-line}`;
      return { label: outcome.label, abbrev: outcome.abbrev, lineStr: oppositeLineStr };
    }
  });
}

// Normalize team name for matching (lowercase, remove common words)
function normalizeTeamName(name: string): string {
  return name.toLowerCase().trim();
}

// Reorder spread outcomes to match moneyline order
// Returns reordered outcomes with their original indices preserved
function reorderSpreadToMatchMoneyline(
  spreadOutcomes: Array<{ label: string; abbrev?: string; [key: string]: any }>,
  moneylineOrder: string[] // [team0Name, team1Name] from moneyline
): { outcomes: typeof spreadOutcomes; swapped: boolean } {
  if (spreadOutcomes.length < 2 || moneylineOrder.length < 2) {
    return { outcomes: spreadOutcomes, swapped: false };
  }
  
  const ml0 = normalizeTeamName(moneylineOrder[0]);
  const ml1 = normalizeTeamName(moneylineOrder[1]);
  const spread0 = normalizeTeamName(spreadOutcomes[0].label);
  const spread1 = normalizeTeamName(spreadOutcomes[1].label);
  
  // Check if spread[0] matches moneyline[0] (correct order) or moneyline[1] (needs swap)
  const spread0MatchesMl0 = spread0.includes(ml0) || ml0.includes(spread0);
  const spread0MatchesMl1 = spread0.includes(ml1) || ml1.includes(spread0);
  
  // If spread[0] matches moneyline[1], we need to swap
  if (spread0MatchesMl1 && !spread0MatchesMl0) {
    return { outcomes: [spreadOutcomes[1], spreadOutcomes[0]], swapped: true };
  }
  
  // Otherwise keep original order
  return { outcomes: spreadOutcomes, swapped: false };
}

// Spread market display component - shows two buttons with team name + spread line + price
// Example: "Clippers -2.5  50¢" and "Raptors +2.5  50¢"
// Ordering matches moneyline order for consistency
function SpreadMarketDisplay({
  market,
  onSelect,
  selectedDirection,
  livePrices,
  moneylineOrder
}: {
  market: ParsedMarket;
  onSelect: (market: ParsedMarket, direction: "home" | "away", displayLabel: string) => void;
  selectedDirection?: "home" | "away" | null;
  livePrices?: LivePricesMap;
  moneylineOrder?: string[]; // [leftTeamName, rightTeamName] from moneyline
}) {
  const rawOutcomes = market.outcomes;
  if (rawOutcomes.length < 2) return null;
  
  // Reorder outcomes to match moneyline order if available
  const { outcomes, swapped } = moneylineOrder 
    ? reorderSpreadToMatchMoneyline(rawOutcomes, moneylineOrder)
    : { outcomes: rawOutcomes, swapped: false };
  
  // Get spread labels with signed lines from the question
  const spreadLabels = getSpreadLabelsForOutcomes(outcomes, market.question || "");
  
  // Build display labels: "ABBREV -2.5" or "Team -2.5" (prefer abbreviations for compact display)
  const leftTeamName = spreadLabels[0].abbrev || spreadLabels[0].label;
  const rightTeamName = spreadLabels[1].abbrev || spreadLabels[1].label;
  const leftDisplayLabel = spreadLabels[0].lineStr 
    ? `${leftTeamName} ${spreadLabels[0].lineStr}` 
    : leftTeamName;
  const rightDisplayLabel = spreadLabels[1].lineStr 
    ? `${rightTeamName} ${spreadLabels[1].lineStr}` 
    : rightTeamName;
  
  // Prices: use live prices from WebSocket if available, fall back to market.bestAsk from Gamma API
  const leftStaticPrice = market.bestAsk ?? 0.5;
  const rightStaticPrice = market.bestBid ?? (1 - (market.bestAsk ?? 0.5));
  const leftPrice = Math.round(getLivePrice(outcomes[0].tokenId, leftStaticPrice, livePrices) * 100);
  const rightPrice = Math.round(getLivePrice(outcomes[1].tokenId, rightStaticPrice, livePrices) * 100);
  
  // Map display positions to betting directions
  // If swapped, left button = "away" (original index 1), right button = "home" (original index 0)
  // If not swapped, left button = "home" (original index 0), right button = "away" (original index 1)
  const leftDirection: "home" | "away" = swapped ? "away" : "home";
  const rightDirection: "home" | "away" = swapped ? "home" : "away";
  
  const isLeftSelected = selectedDirection === leftDirection;
  const isRightSelected = selectedDirection === rightDirection;
  
  return (
    <div className="flex gap-2">
      <button
        onClick={() => onSelect(market, leftDirection, leftDisplayLabel)}
        className={`flex-1 flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm transition-all ${
          isLeftSelected 
            ? "bg-teal-600 border border-teal-500 text-white" 
            : "bg-teal-900/40 border border-teal-800/50 hover:bg-teal-800/50 text-zinc-100"
        }`}
        data-testid={`spread-left-${market.id}`}
      >
        <span className="font-bold truncate">{leftDisplayLabel}</span>
        <span className="font-mono font-bold text-white shrink-0">{leftPrice}¢</span>
      </button>
      <button
        onClick={() => onSelect(market, rightDirection, rightDisplayLabel)}
        className={`flex-1 flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm transition-all ${
          isRightSelected 
            ? "bg-amber-600 border border-amber-500 text-white" 
            : "bg-amber-900/40 border border-amber-800/50 hover:bg-amber-800/50 text-zinc-100"
        }`}
        data-testid={`spread-right-${market.id}`}
      >
        <span className="font-bold truncate">{rightDisplayLabel}</span>
        <span className="font-mono font-bold text-white shrink-0">{rightPrice}¢</span>
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
  const overStaticPrice = market.bestAsk ?? 0.5;
  const underStaticPrice = market.bestBid ?? (1 - (market.bestAsk ?? 0.5));
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
    const staticPrice = m.bestAsk ?? 0;
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
          
          // Use official teamAbbrev from Polymarket slug (can be up to 7 chars)
          const displayLabel = isDraw ? "DRAW" : (market.teamAbbrev || fullLabel.slice(0, 3).toUpperCase());
          
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
    const staticPrice = (idx === 0 ? market.bestAsk : market.bestBid) ?? 0.5;
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
          // Use outcome-level abbrev first (for 2-way markets), then market-level, then fallback
          const abbr = outcome.abbrev || market.teamAbbrev || outcome.label.slice(0, 7).toUpperCase();
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

// Core market types that get the polished UI (spreads moved to More Markets for better label display)
const CORE_MARKET_TYPES = ["moneyline", "totals"];

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
      <div className="text-sm text-zinc-300 break-words">{market.question}</div>
      <div className="flex flex-wrap gap-2">
        {market.outcomes.map((outcome, idx) => {
          // Use live price from WebSocket if available, fall back to market.bestAsk from Gamma API
          const staticPrice = (idx === 0 ? market.bestAsk : market.bestBid) ?? 0;
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
  livePrices,
  moneylineOrder
}: {
  group: MarketGroup;
  eventTitle: string;
  league?: string;
  leagueSlug?: string;
  onSelectMarket: (market: ParsedMarket, eventTitle: string, marketType: string, direction?: string, outcomeLabel?: string) => void;
  selectedMarketId?: string;
  selectedDirection?: string;
  livePrices?: LivePricesMap;
  moneylineOrder?: string[]; // [leftTeamName, rightTeamName] for consistent ordering
}) {
  // Check if this is a soccer moneyline (3-way: Home/Draw/Away)
  const isSoccerMoneyline = league && isSoccerLeague(league, leagueSlug) && group.type === "moneyline" && group.markets.length >= 3;
  
  // Extract unique lines from markets and sort them (keep actual values including negatives)
  const lines = Array.from(new Set(group.markets.map(m => m.line || 0))).sort((a, b) => a - b);
  const [selectedLine, setSelectedLine] = useState(lines.length > 0 ? lines[0] : 0);
  
  // Find market matching selected line (or first market if no lines)
  const activeMarket = group.markets.find(m => (m.line || 0) === selectedLine) || group.markets[0];
  
  if (!activeMarket) return null;
  
  // Determine if this market is selected and what direction
  const isThisMarketSelected = selectedMarketId === activeMarket.id;
  
  // Handle selection for spreads (home/away direction + display label for bet slip)
  const handleSpreadSelect = (market: ParsedMarket, direction: "home" | "away", displayLabel: string) => {
    onSelectMarket(market, eventTitle, group.type, direction, displayLabel);
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
            onSelect={handleSpreadSelect}
            selectedDirection={spreadDirection}
            livePrices={livePrices}
            moneylineOrder={moneylineOrder}
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
  negRisk?: boolean;
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
  onSellPosition,
}: { 
  event: DisplayEvent;
  onSelectMarket: (market: ParsedMarket, eventTitle: string, marketType: string, direction?: string, outcomeLabel?: string) => void;
  onSelectAdditionalMarket: (market: ParsedMarket, eventTitle: string, marketType: string, outcomeIndex: number, outcomeLabel: string) => void;
  selectedMarketId?: string;
  selectedDirection?: string;
  selectedOutcomeIndex?: number;
  userPositions?: UserPosition[];
  livePrices?: Map<string, { bestAsk: number; bestBid: number }>;
  onSellPosition?: (position: UserPosition) => void;
}) {
  const countdown = getCountdown(event.gameStartTime);
  
  // Separate core markets (polished UI) from additional markets (simplified view)
  const coreMarketGroups = event.marketGroups.filter(g => CORE_MARKET_TYPES.includes(g.type));
  const baseAdditionalMarketGroups = event.marketGroups.filter(g => !CORE_MARKET_TYPES.includes(g.type));
  
  // DEBUG: Also add soccer 3-way moneylines to More Markets for testing alternate code path
  const isSoccer = event.league && isSoccerLeague(event.league, event.leagueSlug);
  const soccer3WayGroup = coreMarketGroups.find(g => g.type === "moneyline" && isSoccer && g.markets.length >= 3);
  const additionalMarketGroups = soccer3WayGroup 
    ? [...baseAdditionalMarketGroups, { ...soccer3WayGroup, type: "moneyline-test" }]  // Rename type so it renders via SimplifiedMarketRow
    : baseAdditionalMarketGroups;
  
  // Extract moneyline order for consistent spread ordering
  // Find the 2-way moneyline market and get the team order from its outcomes
  const moneylineGroup = coreMarketGroups.find(g => g.type === "moneyline");
  const moneylineOrder: string[] = [];
  if (moneylineGroup && moneylineGroup.markets.length > 0) {
    const mlMarket = moneylineGroup.markets[0];
    if (mlMarket.outcomes.length >= 2) {
      moneylineOrder.push(mlMarket.outcomes[0].label, mlMarket.outcomes[1].label);
    }
  }
  
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
    <Card className="p-4 space-y-4 overflow-hidden" data-testid={`event-card-${event.id}`}>
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
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <div className="text-xs font-mono text-white">{pos.size.toFixed(2)} shares</div>
                      {pos.unrealizedPnl !== undefined && (
                        <div className={`text-[10px] font-mono ${pos.unrealizedPnl >= 0 ? "text-wild-scout" : "text-wild-brand"}`}>
                          {pos.unrealizedPnl >= 0 ? "+" : ""}{pos.unrealizedPnl.toFixed(2)}
                        </div>
                      )}
                    </div>
                    {onSellPosition && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-[10px] h-6 px-2 border-wild-gold/50 text-wild-gold hover:bg-wild-gold/10"
                        onClick={() => onSellPosition(pos)}
                        data-testid={`button-sell-event-position-${i}`}
                      >
                        Sell
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Event Header */}
      <div className="flex items-start justify-between gap-3 min-w-0">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-base leading-tight break-words">{event.title}</h3>
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
          moneylineOrder={moneylineOrder.length >= 2 ? moneylineOrder : undefined}
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
  enabledTags = [],
  futuresCategories = [],
  onSellPosition,
}: PredictViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<PredictSubTab>("matchday");
  const [selectedLeagues, setSelectedLeagues] = useState<Set<string>>(new Set());
  const [selectedFuturesCategory, setSelectedFuturesCategory] = useState<number | null>(null);

  // Prefetch teams from Gamma API for team name → abbreviation lookup
  useEffect(() => {
    prefetchTeams();
  }, []);
  
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
  // Using a stable string representation to avoid re-runs due to array reference changes
  const { subscribe, unsubscribe } = livePrices || {};
  const tokenIdString = useMemo(() => allTokenIds.join(','), [allTokenIds]);
  const subscribedRef = useRef(false);
  
  useEffect(() => {
    if (!subscribe || !tokenIdString || subscribedRef.current) return;
    
    const tokenIds = tokenIdString.split(',').filter(Boolean);
    if (tokenIds.length > 0) {
      subscribe(tokenIds);
      subscribedRef.current = true;
    }
  }, [subscribe, tokenIdString]);
  
  // Cleanup only on unmount
  useEffect(() => {
    return () => {
      if (unsubscribe && subscribedRef.current) {
        subscribedRef.current = false;
      }
    };
  }, [unsubscribe]);

  // Helper to normalize text for tag matching (lowercase, trim)
  const normalizeForMatch = (text: string) => text.toLowerCase().trim();
  
  // Filter and categorize events - match event.league directly
  const filteredEvents = displayEvents.filter(event => {
    if (!isWithin5Days(event.gameStartTime)) return false;
    if (event.status === "ended") return false;
    if (selectedLeagues.size === 0) return true;
    // Match event league directly against selected leagues
    return selectedLeagues.has(event.league);
  });
  
  // Get live prices map for checking effectively-ended events
  const livePricesMap = livePrices?.prices;
  // Create a dependency that changes when live prices update (size or any value changes)
  const livePricesVersion = livePricesMap ? Array.from(livePricesMap.values()).map(p => `${p.tokenId}:${p.bestAsk}`).join(',') : '';
  
  // Filter live events and sort so effectively-ended ones (100¢ prices) go to bottom
  // useMemo ensures re-sorting when live prices update
  const liveEvents = useMemo(() => {
    return filteredEvents
      .filter(e => e.status === "live")
      .sort((a, b) => {
        const aEnded = isEffectivelyEnded(a, livePricesMap);
        const bEnded = isEffectivelyEnded(b, livePricesMap);
        // Push effectively-ended events to the bottom
        if (aEnded && !bEnded) return 1;
        if (!aEnded && bEnded) return -1;
        return 0; // Maintain original order for same category
      });
  }, [filteredEvents, livePricesMap, livePricesVersion]);
  
  const upcomingEvents = useMemo(() => {
    return filteredEvents
      .filter(e => e.status === "upcoming")
      .sort((a, b) => new Date(a.gameStartTime).getTime() - new Date(b.gameStartTime).getTime());
  }, [filteredEvents]);
  
  // Extract leagues from displayEvents for Match Day filter pills
  const availableMatchDayLeagues = useMemo(() => {
    const leagueSet = new Set<string>();
    for (const event of displayEvents) {
      if (event.league) {
        leagueSet.add(event.league);
      }
    }
    return Array.from(leagueSet).sort();
  }, [displayEvents]);
  
  // Use futures categories for filter pills, sorted by sortOrder
  const availableFuturesCategoryNames = useMemo(() => {
    return [...futuresCategories]
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map(cat => cat.name);
  }, [futuresCategories]);
  
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

  // Filter futures by selected category
  const filteredFutures = useMemo(() => {
    if (selectedFuturesCategory === null) return futures;
    if (selectedFuturesCategory === -1) {
      // Show uncategorized futures
      return futures.filter(future => !future.categoryId);
    }
    return futures.filter(future => future.categoryId === selectedFuturesCategory);
  }, [futures, selectedFuturesCategory]);

  const handleFuturesCategoryToggle = (categoryName: string) => {
    if (categoryName === "ALL") {
      setSelectedFuturesCategory(null);
      return;
    }
    if (categoryName === "Uncategorized") {
      setSelectedFuturesCategory(prev => prev === -1 ? null : -1);
      return;
    }
    const category = futuresCategories.find(c => c.name === categoryName);
    if (category) {
      setSelectedFuturesCategory(prev => prev === category.id ? null : category.id);
    }
  };

  const handleSelectMarket = (market: ParsedMarket, eventTitle: string, marketType: string, direction?: string, passedOutcomeLabel?: string) => {
    // Determine which outcome based on direction
    // For spreads: "home" = index 0, "away" = index 1
    // For totals: "over" = index 0, "under" = index 1
    // For moneyline: "yes" = index 0, "no" = index 1
    let outcomeIndex = 0;
    if (direction === "away" || direction === "under" || direction === "no") {
      outcomeIndex = 1;
    }
    
    const outcome = market.outcomes[outcomeIndex];
    // Use executionPrice for order submission, fallback to market.bestAsk
    const execPrice = outcome?.executionPrice || market.bestAsk || 0.5;
    const odds = execPrice > 0 ? 1 / execPrice : 2;
    
    // Extract CLOB token IDs based on direction
    const yesTokenId = market.clobTokenIds?.[0] || market.outcomes[0]?.tokenId;
    const noTokenId = market.clobTokenIds?.[1] || market.outcomes[1]?.tokenId;
    
    // Debug logging for soccer 3-way markets
    console.log("[handleSelectMarket] Market:", market.question?.slice(0, 50));
    console.log("[handleSelectMarket] clobTokenIds:", market.clobTokenIds);
    console.log("[handleSelectMarket] outcomes:", market.outcomes?.map(o => ({ label: o.label, tokenId: o.tokenId?.slice(0, 20) })));
    console.log("[handleSelectMarket] yesTokenId:", yesTokenId?.slice(0, 20), "noTokenId:", noTokenId?.slice(0, 20));
    
    // Use executionPrice for each outcome, fallback to market.bestAsk/bestBid
    const yesPrice = market.outcomes[0]?.executionPrice || market.bestAsk || 0.5;
    const noPrice = market.outcomes[1]?.executionPrice || market.bestBid || 0.5;
    
    // Create a descriptive outcome label
    // For spreads, use the display label passed from SpreadMarketDisplay (e.g., "Clippers -2.5")
    // For soccer 3-way, use the team name passed from SoccerMoneylineDisplay
    let outcomeLabel = passedOutcomeLabel || market.groupItemTitle;
    
    // If no label was passed, generate one based on market type
    if (!passedOutcomeLabel) {
      if (marketType === "totals") {
        const line = Math.abs(market.line ?? parseLineFromTitle(market.groupItemTitle) ?? 0);
        outcomeLabel = direction === "over" ? `O ${line}` : `U ${line}`;
      } else if (outcome) {
        // Use official teamAbbrev from Polymarket slug (can be up to 7 chars)
        outcomeLabel = market.teamAbbrev || outcome.label.slice(0, 3).toUpperCase();
      }
    }
    
    // Map direction to "yes" | "no" for BetSlip
    const betDirection: "yes" | "no" = outcomeIndex === 0 ? "yes" : "no";
    
    // Determine if this is a soccer 3-way market (has Yes/No toggle in BetSlip)
    // Soccer 3-way markets have questions like "Will Sevilla win?" or "Will the match be a draw?"
    const questionLower = (market.question || "").toLowerCase();
    const isSoccer3Way = marketType === "moneyline" && 
      (questionLower.includes("win") || questionLower.includes("draw") || questionLower.includes("tie"));
    
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
      market.orderMinSize,
      market.question,
      isSoccer3Way,
      market.negRisk
    );
  };
  
  // Handler for additional markets (simplified view) - uses direct outcome labels
  // For non-3-way markets, we pass the selected token directly as yesTokenId
  // and always use direction "yes" so BetSlip uses the correct token
  const handleSelectAdditionalMarket = (market: ParsedMarket, eventTitle: string, marketType: string, outcomeIndex: number, outcomeLabel: string) => {
    const outcome = market.outcomes[outcomeIndex];
    // Use the selected outcome's execution price
    const execPrice = outcome?.executionPrice || (outcomeIndex === 0 ? market.bestAsk : market.bestBid) || 0.5;
    const odds = execPrice > 0 ? 1 / execPrice : 2;
    
    // Get the selected outcome's token ID directly
    const selectedTokenId = market.clobTokenIds?.[outcomeIndex] || outcome?.tokenId;
    const otherOutcomeIndex = outcomeIndex === 0 ? 1 : 0;
    const otherTokenId = market.clobTokenIds?.[otherOutcomeIndex] || market.outcomes[otherOutcomeIndex]?.tokenId;
    
    // Use outcome's token as the outcomeId for bet placement
    const outcomeId = selectedTokenId || outcome?.tokenId || market.conditionId;
    
    // For non-3-way markets: pass selected token as yesTokenId, use direction "yes"
    // This ensures BetSlip uses the exact token the user clicked on
    onPlaceBet(
      market.id, 
      outcomeId, 
      odds,
      market.question || eventTitle,
      outcomeLabel,
      marketType,
      "yes", // Always "yes" - no direction toggle for non-3-way markets
      selectedTokenId, // Selected token goes in yesTokenId position
      otherTokenId,
      execPrice, // Use selected outcome's price as yesPrice
      market.outcomes[otherOutcomeIndex]?.executionPrice || 0.5,
      market.orderMinSize,
      market.question,
      false, // Not a soccer 3-way market
      market.negRisk // Pass negRisk for winner-take-all markets
    );
  };

  return (
      <div className="flex flex-col h-full animate-fade-in">
        <PriceTicker events={displayEvents} />
        <SubTabs tabs={subTabs} activeTab={activeSubTab} onTabChange={setActiveSubTab} />
        
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-3">
        {activeSubTab === "matchday" && (
          <div className="space-y-3">
            <LeagueFilters 
              leagues={availableMatchDayLeagues}
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
                        onSellPosition={onSellPosition}
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
                        onSellPosition={onSellPosition}
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
            <LeagueFilters 
              leagues={[...availableFuturesCategoryNames, ...(futures.some(f => !f.categoryId) ? ["Uncategorized"] : [])]}
              selectedLeagues={new Set(
                selectedFuturesCategory === null ? [] : 
                selectedFuturesCategory === -1 ? ["Uncategorized"] : 
                [futuresCategories.find(c => c.id === selectedFuturesCategory)?.name || ""]
              )}
              onToggle={handleFuturesCategoryToggle}
            />
            
            {futuresLoading ? (
              <>
                <MarketCardSkeleton />
                <MarketCardSkeleton />
              </>
            ) : filteredFutures.length > 0 ? (
              filteredFutures.map((future) => (
                <FuturesCard
                  key={future.id}
                  future={future}
                  onPlaceBet={onPlaceBet}
                  selectedOutcome={
                    selectedBet?.marketId === future.id ? selectedBet.outcomeId : undefined
                  }
                />
              ))
            ) : futures.length > 0 ? (
              <EmptyState
                icon={Lock}
                title="No Matching Futures"
                description="No futures match the selected filter. Try selecting 'All' to see all futures."
              />
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
  );
}
