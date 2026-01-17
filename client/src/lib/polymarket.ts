import { apiRequest } from "./queryClient";

// Team data from Gamma API for name → abbreviation lookup
export interface GammaTeam {
  id: number;
  name: string;
  league: string;
  abbreviation: string;
  alias: string | null;
  logo?: string;
  color?: string;
}

// Team lookup map: team name/alias (lowercase) → abbreviation (lowercase)
let teamLookupCache: Map<string, string> | null = null;
let teamLookupPromise: Promise<Map<string, string>> | null = null;

// Fetch teams from Gamma API and build lookup map
async function buildTeamLookup(): Promise<Map<string, string>> {
  if (teamLookupCache) return teamLookupCache;
  
  try {
    const response = await fetch("/api/polymarket/teams");
    if (!response.ok) {
      throw new Error(`Failed to fetch teams: ${response.status}`);
    }
    const teams: GammaTeam[] = await response.json();
    
    const lookup = new Map<string, string>();
    for (const team of teams) {
      const abbrev = team.abbreviation.toLowerCase();
      // Map by full name (e.g., "Houston Rockets")
      if (team.name) {
        lookup.set(team.name.toLowerCase(), abbrev);
        // Also map by nickname (last word, e.g., "Rockets")
        const words = team.name.trim().split(/\s+/);
        if (words.length > 1) {
          const nickname = words[words.length - 1].toLowerCase();
          // Only add if nickname is at least 4 chars to avoid collisions
          if (nickname.length >= 4 && !lookup.has(nickname)) {
            lookup.set(nickname, abbrev);
          }
        }
      }
      // Map by alias (if different from name)
      if (team.alias && team.alias.toLowerCase() !== team.name?.toLowerCase()) {
        lookup.set(team.alias.toLowerCase(), abbrev);
      }
    }
    
    teamLookupCache = lookup;
    return lookup;
  } catch (error) {
    console.error("Error building team lookup:", error);
    return new Map();
  }
}

// Get team abbreviation from name/alias (case-insensitive)
// Returns lowercase abbreviation or null if not found
export async function getTeamAbbreviation(teamName: string): Promise<string | null> {
  // Ensure we only fetch once
  if (!teamLookupPromise) {
    teamLookupPromise = buildTeamLookup();
  }
  const lookup = await teamLookupPromise;
  return lookup.get(teamName.toLowerCase()) || null;
}

// Synchronous lookup (returns null if cache not ready)
export function getTeamAbbreviationSync(teamName: string): string | null {
  if (!teamLookupCache) return null;
  return teamLookupCache.get(teamName.toLowerCase()) || null;
}

// Pre-fetch teams to populate cache (call on app startup)
export function prefetchTeams(): void {
  if (!teamLookupPromise) {
    teamLookupPromise = buildTeamLookup();
  }
}

// Check if team lookup is ready
export function isTeamLookupReady(): boolean {
  return teamLookupCache !== null;
}

// Parse team names from event title (e.g., "Timberwolves vs. Rockets" → ["Timberwolves", "Rockets"])
export function parseTeamsFromTitle(title: string): { team1: string; team2: string } | null {
  // Match patterns like "Team1 vs Team2", "Team1 vs. Team2", "Team1 v Team2"
  const match = title.match(/^(.+?)\s+(?:vs\.?|v)\s+(.+?)$/i);
  if (match) {
    return { team1: match[1].trim(), team2: match[2].trim() };
  }
  return null;
}

// Get abbreviations for both teams in an event title
// Returns { team1: { name, abbrev }, team2: { name, abbrev } } or null
export function getTitleTeamAbbrevs(title: string): { 
  team1: { name: string; abbrev: string | null }; 
  team2: { name: string; abbrev: string | null };
} | null {
  const parsed = parseTeamsFromTitle(title);
  if (!parsed) return null;
  
  return {
    team1: { name: parsed.team1, abbrev: getTeamAbbreviationSync(parsed.team1) },
    team2: { name: parsed.team2, abbrev: getTeamAbbreviationSync(parsed.team2) }
  };
}

export interface GammaTag {
  id: string;
  label: string;
  slug: string;
  sportId?: string;
}

export interface MarketTypeOption {
  id: string;
  type: string;
  label: string;
}

export interface SportWithMarketTypes {
  id: string;
  slug: string;
  label: string;
  sport: string;
  seriesId: string;
  image?: string;
  marketTypes: MarketTypeOption[];
}

export interface GammaOutcome {
  price: string;
  outcome: string;
}

export interface GammaMarket {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  outcomePrices: string;
  outcomes: string;
  volume: string;
  liquidity: string;
  active: boolean;
  closed: boolean;
  // New fields for improved display
  groupItemTitle?: string;
  bestAsk?: number;
  bestBid?: number;
  lastTradePrice?: number;
  gameStartTime?: string;
  oneWeekPriceChange?: number;
  sportsMarketType?: string;
  clobTokenIds?: string;
  line?: number;
  orderMinSize?: number;
  // Official team abbreviation from Polymarket (e.g., "LAL", "MCI")
  teamAbbrev?: string;
}

export interface GammaEvent {
  id: string;
  title: string;
  slug: string;
  description: string;
  startDate: string;
  endDate: string;
  image: string;
  icon: string;
  active: boolean;
  closed: boolean;
  markets: GammaMarket[];
  tags: GammaTag[];
  // Event-level aggregates
  volume?: number;
  volume24hr?: number;
  liquidity?: number;
  // Parent event linking (for "More Markets" child events)
  parentEventId?: number;
}

// Helper to convert sport slug to human-readable label
function humanizeSportSlug(slug: string): string {
  const labels: Record<string, string> = {
    nba: "NBA",
    nfl: "NFL",
    mlb: "MLB",
    nhl: "NHL",
    mls: "MLS",
    epl: "Premier League",
    lal: "La Liga",
    bun: "Bundesliga",
    sea: "Serie A",
    fl1: "Ligue 1",
    ucl: "Champions League",
    uel: "Europa League",
    cbb: "College Basketball",
    cfb: "College Football",
    wnba: "WNBA",
    ipl: "IPL Cricket",
    mma: "UFC/MMA",
    atp: "ATP Tennis",
    wta: "WTA Tennis",
    cs2: "Counter-Strike 2",
    lol: "League of Legends",
    dota2: "Dota 2",
    val: "Valorant",
  };
  return labels[slug.toLowerCase()] || slug.toUpperCase();
}

// Fetch sports with hierarchical market types
// Returns sports with nested market type options (moneyline, spreads, totals)
export async function fetchSportsWithMarketTypes(): Promise<SportWithMarketTypes[]> {
  try {
    const response = await fetch("/api/polymarket/tags");
    if (!response.ok) {
      throw new Error(`Failed to fetch sports: ${response.status}`);
    }
    return response.json();
  } catch (error) {
    console.error("Error fetching sports with market types:", error);
    return [];
  }
}

// Alias for backwards compatibility  
export const fetchGammaTags = fetchSportsWithMarketTypes;

// Parse tag ID to extract series and market type
// Format: "seriesId_marketType" (e.g., "10345_moneyline") or legacy "series_seriesId"
export function parseTagId(tagId: string): { seriesId: string; marketType: string | null } {
  // Legacy format: series_seriesId
  if (tagId.startsWith("series_")) {
    return { seriesId: tagId.replace("series_", ""), marketType: null };
  }
  
  // New format: seriesId_marketType (where marketType can contain underscores)
  // The seriesId is always numeric, so we can extract it from the beginning
  const underscoreIndex = tagId.indexOf("_");
  if (underscoreIndex > 0) {
    const potentialSeriesId = tagId.substring(0, underscoreIndex);
    // Check if it's a numeric series ID
    if (/^\d+$/.test(potentialSeriesId)) {
      const marketType = tagId.substring(underscoreIndex + 1);
      return { seriesId: potentialSeriesId, marketType: marketType || null };
    }
  }
  
  return { seriesId: tagId, marketType: null };
}

// Merge child events (with parentEventId) into their parent events
// Child events are "More Markets" events that share the same game
function mergeChildEvents(events: GammaEvent[]): GammaEvent[] {
  // Build a map of parentId -> child events
  const childEventsMap = new Map<string, GammaEvent[]>();
  const parentEvents: GammaEvent[] = [];
  
  for (const event of events) {
    if (event.parentEventId) {
      // This is a child event
      const parentId = event.parentEventId.toString();
      if (!childEventsMap.has(parentId)) {
        childEventsMap.set(parentId, []);
      }
      childEventsMap.get(parentId)!.push(event);
    } else {
      // This is a parent event (or standalone event)
      parentEvents.push(event);
    }
  }
  
  // Merge child markets into parent events
  const mergedEvents: GammaEvent[] = [];
  
  for (const parent of parentEvents) {
    const children = childEventsMap.get(parent.id) || [];
    
    if (children.length === 0) {
      // No children, return parent as-is
      mergedEvents.push(parent);
    } else {
      // Merge all child markets into the parent
      const allMarkets = [...(parent.markets || [])];
      let totalVolume = parent.volume || 0;
      let totalLiquidity = parent.liquidity || 0;
      
      for (const child of children) {
        if (child.markets?.length) {
          allMarkets.push(...child.markets);
        }
        totalVolume += child.volume || 0;
        totalLiquidity += child.liquidity || 0;
      }
      
      mergedEvents.push({
        ...parent,
        markets: allMarkets,
        volume: totalVolume,
        liquidity: totalLiquidity,
      });
    }
    
    // Remove this parent from the map so we don't double-count
    childEventsMap.delete(parent.id);
  }
  
  // Add any orphan child events (whose parent wasn't fetched) as standalone events
  Array.from(childEventsMap.values()).forEach(orphanChildren => {
    mergedEvents.push(...orphanChildren);
  });
  
  return mergedEvents;
}

// Fetch events via server proxy (bypasses CORS)
// Supports new format (seriesId_marketType) and legacy format (series_seriesId)
export async function fetchGammaEvents(tagIds: string[]): Promise<GammaEvent[]> {
  if (!tagIds.length) return [];
  
  try {
    // Group tags by seriesId to avoid duplicate fetches
    const seriesMap = new Map<string, Set<string>>();
    
    for (const tagId of tagIds) {
      const { seriesId, marketType } = parseTagId(tagId);
      if (!seriesMap.has(seriesId)) {
        seriesMap.set(seriesId, new Set());
      }
      if (marketType) {
        seriesMap.get(seriesId)!.add(marketType);
      }
    }
    
    const allEvents: GammaEvent[] = [];
    
    for (const [seriesId, marketTypes] of Array.from(seriesMap.entries())) {
      const url = `/api/polymarket/events?series_id=${seriesId}`;
      const response = await fetch(url);
      
      if (response.ok) {
        const events: GammaEvent[] = await response.json();
        
        // Process each event
        const processedEvents = events.map(event => {
          // If we have specific market types AND markets exist, filter to those types
          // BUT if market doesn't have sportsMarketType field, include it anyway
          if (marketTypes.size > 0 && event.markets?.length) {
            const filteredMarkets = event.markets.filter((market: any) => {
              // If market has no sportsMarketType, include it (show all markets for event)
              if (!market.sportsMarketType) return true;
              // Otherwise filter by requested market types
              return marketTypes.has(market.sportsMarketType);
            });
            return { ...event, markets: filteredMarkets.length > 0 ? filteredMarkets : event.markets };
          }
          return event;
        });
        
        // Only include events with valid markets (must have outcomes/prices)
        const validEvents = processedEvents.filter(event => {
          if (!event.markets?.length) return false;
          const market = event.markets[0];
          try {
            const prices = JSON.parse(market.outcomePrices || "[]");
            return prices.length > 0;
          } catch {
            return false;
          }
        });
        
        allEvents.push(...validEvents);
      }
    }
    
    const uniqueEvents = allEvents.filter((event, index, self) =>
      index === self.findIndex(e => e.id === event.id)
    );
    
    // Merge child events (with parentEventId) into their parent events
    const mergedEvents = mergeChildEvents(uniqueEvents);
    
    return mergedEvents;
  } catch (error) {
    console.error("Error fetching Gamma events:", error);
    return [];
  }
}

export function parseMarketOutcomes(market: GammaMarket): { id: string; label: string; odds: number; probability: number }[] {
  try {
    const prices = JSON.parse(market.outcomePrices || "[]");
    const outcomes = JSON.parse(market.outcomes || "[]");
    
    return outcomes.map((outcome: string, index: number) => {
      const probability = parseFloat(prices[index] || "0");
      const odds = probability > 0 ? 1 / probability : 99;
      return {
        id: `${market.id}-${index}`,
        label: outcome,
        odds: Math.round(odds * 100) / 100,
        probability: Math.round(probability * 1000) / 1000,
      };
    });
  } catch {
    return [];
  }
}

// Parsed market with structured outcome data
export interface ParsedMarket {
  id: string;
  conditionId: string;
  question: string;
  groupItemTitle: string;
  sportsMarketType: string;
  line?: number;
  bestAsk: number;
  bestBid: number;
  volume: number;
  liquidity: number;
  outcomes: Array<{
    label: string;
    price: number;           // Mid/last trade price (for display)
    executionPrice: number;  // Best ask price for this outcome (for order submission)
    tokenId?: string;
    abbrev?: string;         // Official abbreviation from Polymarket slug (e.g., "SABALEN")
  }>;
  clobTokenIds?: string[];
  orderMinSize?: number;
  // Official team abbreviation from Polymarket (e.g., "LAL", "MCI")
  teamAbbrev?: string;
}

// Grouped markets by type within an event
export interface MarketGroup {
  type: string;
  label: string;
  volume: number;
  markets: ParsedMarket[];
}

// Display-ready event with all market data
export interface DisplayEvent {
  id: string;
  title: string;
  description: string;
  sport: string;
  league: string;       // Human-readable label (e.g., "La Liga", "Premier League")
  leagueSlug: string;   // Raw slug for logic checks (e.g., "lal", "soccer", "epl")
  image: string;
  gameStartTime: string;
  status: "live" | "upcoming" | "ended";
  volume: number;
  liquidity: number;
  marketGroups: MarketGroup[];
}

function getMarketTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    moneyline: "Moneyline",
    totals: "Totals",
    spreads: "Spreads",
    props: "Player Props",
  };
  return labels[type] || type.charAt(0).toUpperCase() + type.slice(1);
}

// Parse team abbreviations from event slug
// Format: {league}-{homeAbbrev}-{awayAbbrev}-{date} (e.g., "sea-udi-int-2026-01-18")
// Returns { homeAbbrev, awayAbbrev } or null if not parseable
function parseTeamAbbrevsFromEventSlug(slug: string): { homeAbbrev: string; awayAbbrev: string } | null {
  if (!slug) return null;
  
  const parts = slug.split("-");
  // Need at least: league + home + away + year + month + day = 6 parts minimum
  if (parts.length < 6) return null;
  
  // Find the date portion (4-digit year followed by 2-digit month and day)
  // The team abbreviations come BEFORE the date
  let dateStartIdx = -1;
  for (let i = 1; i < parts.length - 2; i++) {
    // Check if this looks like a year (4 digits, starts with 20)
    if (/^20\d{2}$/.test(parts[i])) {
      dateStartIdx = i;
      break;
    }
  }
  
  if (dateStartIdx < 3) return null; // Need at least league + 2 teams before date
  
  // Extract team abbreviations (parts 1 and 2 after league at index 0)
  // Format: league-home-away-date... or league-team1-team2-date...
  const homeAbbrev = parts[1].toUpperCase();
  const awayAbbrev = parts[2].toUpperCase();
  
  // Validate abbreviations are reasonable (1-7 chars, letters/numbers only)
  if (!homeAbbrev || !awayAbbrev) return null;
  if (!/^[A-Z0-9]{1,7}$/i.test(homeAbbrev) || !/^[A-Z0-9]{1,7}$/i.test(awayAbbrev)) return null;
  
  return { homeAbbrev, awayAbbrev };
}

// Match a market to its team abbreviation based on market slug or groupItemTitle
function getMarketTeamAbbrev(
  market: GammaMarket,
  eventSlug: string,
  teamAbbrevs: { homeAbbrev: string; awayAbbrev: string } | null
): string | undefined {
  if (!teamAbbrevs) return undefined;
  
  const marketSlug = market.slug?.toLowerCase() || "";
  const groupTitle = market.groupItemTitle?.toLowerCase() || "";
  
  // Check if groupItemTitle contains "draw" - no team abbreviation for draws
  if (groupTitle.includes("draw") || groupTitle.includes("tie")) {
    return undefined;
  }
  
  // Check if market slug ends with a team abbreviation (e.g., "sea-udi-int-2026-01-18-udi")
  const slugParts = marketSlug.split("-");
  if (slugParts.length > 0) {
    const lastPart = slugParts[slugParts.length - 1].toUpperCase();
    if (lastPart === teamAbbrevs.homeAbbrev) return teamAbbrevs.homeAbbrev;
    if (lastPart === teamAbbrevs.awayAbbrev) return teamAbbrevs.awayAbbrev;
  }
  
  // Fuzzy match: check if groupItemTitle contains/starts with the abbreviation
  // This handles cases like "Aryna Sabalenka" matching "SABALEN" from slug
  const homeAbbrevLower = teamAbbrevs.homeAbbrev.toLowerCase();
  const awayAbbrevLower = teamAbbrevs.awayAbbrev.toLowerCase();
  
  // Remove spaces and check if any word in groupTitle starts with abbreviation
  const titleWords = groupTitle.replace(/[^a-z\s]/g, "").split(/\s+/);
  for (const word of titleWords) {
    if (word.startsWith(homeAbbrevLower) || homeAbbrevLower.startsWith(word.slice(0, 4))) {
      return teamAbbrevs.homeAbbrev;
    }
    if (word.startsWith(awayAbbrevLower) || awayAbbrevLower.startsWith(word.slice(0, 4))) {
      return teamAbbrevs.awayAbbrev;
    }
  }
  
  // Last resort: check if any slug segment (before date) matches
  const eventSlugParts = eventSlug.split("-");
  for (let i = slugParts.length - 1; i >= 0; i--) {
    const part = slugParts[i].toUpperCase();
    if (part === teamAbbrevs.homeAbbrev) return teamAbbrevs.homeAbbrev;
    if (part === teamAbbrevs.awayAbbrev) return teamAbbrevs.awayAbbrev;
  }
  
  return undefined;
}

export function gammaEventToDisplayEvent(event: GammaEvent): DisplayEvent | null {
  if (!event.markets?.length) return null;
  
  // Parse team abbreviations from event slug (e.g., "sea-udi-int-2026-01-18" -> {homeAbbrev: "UDI", awayAbbrev: "INT"})
  const teamAbbrevs = parseTeamAbbrevsFromEventSlug(event.slug);
  
  // Parse all markets and group by sportsMarketType
  const marketsByType = new Map<string, ParsedMarket[]>();
  let totalVolume = 0;
  let totalLiquidity = 0;
  // Use fallback chain for game start time: prefer startDate, then endDate
  let gameStartTime = event.startDate || event.endDate || "";
  
  for (const market of event.markets) {
    const marketType = market.sportsMarketType || "moneyline";
    const volume = parseFloat(market.volume || "0");
    const liquidity = parseFloat(market.liquidity || "0");
    totalVolume += volume;
    totalLiquidity += liquidity;
    
    // Use gameStartTime from market if available and valid
    if (market.gameStartTime && market.gameStartTime.length > 0) {
      const marketTime = new Date(market.gameStartTime);
      if (!isNaN(marketTime.getTime())) {
        gameStartTime = market.gameStartTime;
      }
    }
    
    // Parse outcomes and prices
    let outcomes: ParsedMarket["outcomes"] = [];
    let clobTokenIds: string[] = [];
    try {
      const prices = JSON.parse(market.outcomePrices || "[]");
      const outcomeLabels = JSON.parse(market.outcomes || "[]");
      if (market.clobTokenIds) {
        clobTokenIds = JSON.parse(market.clobTokenIds);
      }
      
      // Calculate execution prices for each outcome
      // For instant fills, we need the actual ask price to cross the spread
      // SPREAD_BUFFER ensures we're willing to pay slightly above the quoted price
      const SPREAD_BUFFER = 0.02;
      
      outcomes = outcomeLabels.map((label: string, i: number) => {
        const midPrice = parseFloat(prices[i] || "0");
        let executionPrice = midPrice;
        
        if (i === 0) {
          // Outcome 0: Use bestAsk directly if available, else mid + buffer
          if (market.bestAsk && market.bestAsk > 0) {
            executionPrice = market.bestAsk;
          } else if (midPrice > 0) {
            executionPrice = Math.min(midPrice + SPREAD_BUFFER, 0.99);
          }
        } else if (i === 1) {
          // Outcome 1 (binary complement): Use (1 - bestBid) as the effective ask price
          // In binary markets, buying NO at (1-bestBid) is equivalent to selling YES at bestBid
          if (market.bestBid && market.bestBid > 0) {
            // Add buffer to ensure we cross the spread
            executionPrice = Math.min(1 - market.bestBid + SPREAD_BUFFER, 0.99);
          } else if (midPrice > 0) {
            executionPrice = Math.min(midPrice + SPREAD_BUFFER, 0.99);
          }
        } else {
          // Multi-outcome markets: add buffer to mid price
          if (midPrice > 0) {
            executionPrice = Math.min(midPrice + SPREAD_BUFFER, 0.99);
          }
        }
        
        // Determine abbreviation for this outcome
        // For 2-way markets, match outcome labels with slug abbreviations
        let abbrev: string | undefined;
        if (teamAbbrevs && outcomeLabels.length === 2) {
          // Check if this outcome label matches home or away abbreviation
          const labelLower = label.toLowerCase().replace(/[^a-z]/g, "");
          const homeAbbrevLower = teamAbbrevs.homeAbbrev.toLowerCase();
          const awayAbbrevLower = teamAbbrevs.awayAbbrev.toLowerCase();
          
          // Check if label contains/starts with abbreviation
          if (labelLower.includes(homeAbbrevLower) || homeAbbrevLower.includes(labelLower.slice(0, 4))) {
            abbrev = teamAbbrevs.homeAbbrev;
          } else if (labelLower.includes(awayAbbrevLower) || awayAbbrevLower.includes(labelLower.slice(0, 4))) {
            abbrev = teamAbbrevs.awayAbbrev;
          } else {
            // Fallback: first outcome = home, second = away
            abbrev = i === 0 ? teamAbbrevs.homeAbbrev : teamAbbrevs.awayAbbrev;
          }
        }
        
        return {
          label,
          price: midPrice,
          executionPrice,
          tokenId: clobTokenIds[i],
          abbrev,
        };
      });
    } catch {
      continue;
    }
    
    if (outcomes.length === 0) continue;
    
    const parsedMarket: ParsedMarket = {
      id: market.id,
      conditionId: market.conditionId,
      question: market.question,
      groupItemTitle: market.groupItemTitle || market.question,
      sportsMarketType: marketType,
      line: market.line,
      bestAsk: market.bestAsk || outcomes[0]?.price || 0,
      bestBid: market.bestBid || 0,
      volume,
      liquidity,
      outcomes,
      clobTokenIds: clobTokenIds.length > 0 ? clobTokenIds : undefined,
      orderMinSize: market.orderMinSize,
      // Get team abbreviation from market slug parsing (falls back to undefined)
      teamAbbrev: getMarketTeamAbbrev(market, event.slug, teamAbbrevs),
    };
    
    if (!marketsByType.has(marketType)) {
      marketsByType.set(marketType, []);
    }
    marketsByType.get(marketType)!.push(parsedMarket);
  }
  
  if (marketsByType.size === 0) return null;
  
  // Convert map to sorted array of MarketGroups
  const typeOrder = ["moneyline", "totals", "spreads", "props"];
  const marketGroups: MarketGroup[] = [];
  
  for (const type of typeOrder) {
    const markets = marketsByType.get(type);
    if (markets) {
      const groupVolume = markets.reduce((sum, m) => sum + m.volume, 0);
      marketGroups.push({
        type,
        label: getMarketTypeLabel(type),
        volume: groupVolume,
        markets,
      });
      marketsByType.delete(type);
    }
  }
  
  // Add remaining types not in typeOrder
  Array.from(marketsByType.entries()).forEach(([type, markets]) => {
    const groupVolume = markets.reduce((sum: number, m: ParsedMarket) => sum + m.volume, 0);
    marketGroups.push({
      type,
      label: getMarketTypeLabel(type),
      volume: groupVolume,
      markets,
    });
  });
  
  // Determine event status
  const now = new Date();
  const startTime = new Date(gameStartTime);
  const sixHoursMs = 6 * 60 * 60 * 1000;
  const diff = startTime.getTime() - now.getTime();
  
  let status: "live" | "upcoming" | "ended" = "upcoming";
  if (diff <= 0 && diff > -sixHoursMs) {
    status = "live";
  } else if (diff <= -sixHoursMs) {
    status = "ended";
  }
  
  // Extract sport/league from tags
  const sportTag = event.tags?.find(tag => 
    ["nba", "nfl", "mlb", "nhl", "soccer", "football", "basketball", "tennis", "mma", "boxing", "golf", "esports", "epl", "ucl", "lal"].some(
      sport => tag.slug?.toLowerCase().includes(sport) || tag.label?.toLowerCase().includes(sport)
    )
  );
  
  // Get league label (human-readable) and slug (for logic)
  const leagueSlug = sportTag?.slug?.toLowerCase() || "";
  const leagueLabel = sportTag?.label || humanizeSportSlug(leagueSlug) || "Sports";
  
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    sport: sportTag?.label || "Sports",
    league: leagueLabel,
    leagueSlug,
    image: event.image || event.icon,
    gameStartTime,
    status,
    volume: event.volume || totalVolume,
    liquidity: event.liquidity || totalLiquidity,
    marketGroups,
  };
}

// Legacy function for backward compatibility
export function gammaEventToMarket(event: GammaEvent): {
  id: string;
  title: string;
  description: string;
  category: string;
  sport: string;
  league: string;
  startTime: string;
  status: string;
  outcomes: { id: string; label: string; odds: number; probability: number }[];
  volume: number;
  liquidity: number;
  polymarketId: string;
  conditionId: string;
} | null {
  if (!event.markets?.length) return null;
  
  const market = event.markets[0];
  const outcomes = parseMarketOutcomes(market);
  
  if (outcomes.length === 0) return null;
  
  const sportTag = event.tags?.find(tag => 
    ["nba", "nfl", "mlb", "nhl", "soccer", "football", "basketball", "tennis", "mma", "boxing", "golf", "esports"].some(
      sport => tag.slug?.toLowerCase().includes(sport) || tag.label?.toLowerCase().includes(sport)
    )
  );
  
  return {
    id: event.id,
    title: event.title,
    description: event.description || market.question,
    category: "sports",
    sport: sportTag?.label || "Sports",
    league: sportTag?.slug?.toUpperCase() || "LIVE",
    startTime: event.startDate || new Date().toISOString(),
    status: event.active && !event.closed ? "open" : "closed",
    outcomes,
    volume: parseFloat(market.volume || "0"),
    liquidity: parseFloat(market.liquidity || "0"),
    polymarketId: market.id,
    conditionId: market.conditionId,
  };
}

// Relay request to Polymarket via server (server handles credentials)
export async function relayToPolymarket(path: string, method: string = "POST", body?: unknown) {
  return apiRequest<unknown>("POST", "/api/polymarket/relay", { method, path, body });
}

// Check if Polymarket builder is configured
export async function checkPolymarketStatus(): Promise<{ builderConfigured: boolean; relayerUrl: string }> {
  const response = await fetch("/api/polymarket/status");
  return response.json();
}

// ============================================================
// RelayClient integration for Safe wallet deployment
// ============================================================

import { RelayClient, RelayerTxType } from "@polymarket/builder-relayer-client";
import { deriveSafe } from "@polymarket/builder-relayer-client/dist/builder/derive";
import { getContractConfig } from "@polymarket/builder-relayer-client/dist/config";
import { BuilderConfig } from "@polymarket/builder-signing-sdk";
import { createWalletClient, custom, type WalletClient } from "viem";
import { polygon } from "viem/chains";

const RELAYER_URL = "https://relayer-v2.polymarket.com/";
const CHAIN_ID = 137;

let relayClientInstance: RelayClient | null = null;
let lastEoaAddress: string | null = null;
let cachedSafeAddress: string | null = null;

function deriveSafeAddress(eoaAddress: string): string {
  const config = getContractConfig(CHAIN_ID);
  return deriveSafe(eoaAddress, config.SafeContracts.SafeFactory);
}

export async function getRelayClient(
  eoaAddress: `0x${string}`,
  provider: unknown
): Promise<{ client: RelayClient; safeAddress: string }> {
  const safeAddress = deriveSafeAddress(eoaAddress);
  
  if (relayClientInstance && lastEoaAddress === eoaAddress) {
    return { client: relayClientInstance, safeAddress };
  }

  const walletClient = createWalletClient({
    account: eoaAddress,
    chain: polygon,
    transport: custom(provider as Parameters<typeof custom>[0]),
  }) as WalletClient;

  const signingUrl = `${window.location.origin}/api/polymarket/sign`;
  console.log("Using signing URL:", signingUrl);
  
  const builderConfig = new BuilderConfig({
    remoteBuilderConfig: {
      url: signingUrl,
    },
  });

  relayClientInstance = new RelayClient(
    RELAYER_URL,
    CHAIN_ID,
    walletClient,
    builderConfig,
    RelayerTxType.SAFE
  );
  lastEoaAddress = eoaAddress;
  cachedSafeAddress = safeAddress;

  return { client: relayClientInstance, safeAddress };
}

export function clearRelayClient(): void {
  relayClientInstance = null;
  lastEoaAddress = null;
  cachedSafeAddress = null;
}

export async function deploySafeWithProvider(
  eoaAddress: `0x${string}`,
  provider: unknown
): Promise<{ success: boolean; safeAddress?: string; error?: string }> {
  try {
    const { client, safeAddress } = await getRelayClient(eoaAddress, provider);
    console.log("Derived Safe address:", safeAddress);
    
    const isDeployed = await client.getDeployed(safeAddress);
    console.log("Already deployed:", isDeployed);
    
    if (isDeployed) {
      return { success: true, safeAddress };
    }
    
    console.log("Deploying Safe wallet...");
    const response = await client.deploy();
    const result = await response?.wait();
    
    console.log("Deploy result:", result);
    
    return { 
      success: true, 
      safeAddress: result?.proxyAddress || safeAddress 
    };
  } catch (error) {
    console.error("Deploy Safe error:", error);
    
    let errorMessage = "Failed to activate wallet";
    if (error instanceof Error) {
      const errorStr = error.message.toLowerCase();
      if (errorStr.includes("401") || errorStr.includes("unauthorized") || errorStr.includes("invalid authorization")) {
        errorMessage = "Authentication failed. Please verify your Polymarket Builder API credentials (Key, Secret, and Passphrase) are configured correctly.";
      } else if (errorStr.includes("invalid remote url")) {
        errorMessage = "Configuration error. Please refresh and try again.";
      } else {
        errorMessage = error.message;
      }
    }
    
    return { 
      success: false, 
      error: errorMessage
    };
  }
}

export async function checkSafeWithProvider(
  eoaAddress: `0x${string}`,
  provider: unknown
): Promise<{ deployed: boolean; safeAddress: string }> {
  try {
    const { client, safeAddress } = await getRelayClient(eoaAddress, provider);
    const deployed = await client.getDeployed(safeAddress);
    
    return { deployed, safeAddress };
  } catch (error) {
    console.error("Check Safe error:", error);
    return { deployed: false, safeAddress: "" };
  }
}
