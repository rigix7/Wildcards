import { apiRequest } from "./queryClient";

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

// Legacy type for backwards compatibility
export interface CategorizedTag {
  id: string;
  slug: string;
  label: string;
  sport: string;
  marketType: string;
  seriesId?: string;
  tagIds?: string;
}

export interface PolymarketSport {
  id: string;
  slug: string;
  label: string;
  tags?: string;
  series?: string;
  image?: string;
  resolutionSource?: string;
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

// NFL team name to abbreviation mapping
export const NFL_TEAM_ABBREVIATIONS: Record<string, string> = {
  "49ers": "SF",
  "Bears": "CHI",
  "Bengals": "CIN",
  "Bills": "BUF",
  "Broncos": "DEN",
  "Browns": "CLE",
  "Buccaneers": "TB",
  "Cardinals": "ARI",
  "Chargers": "LAC",
  "Chiefs": "KC",
  "Colts": "IND",
  "Commanders": "WAS",
  "Cowboys": "DAL",
  "Dolphins": "MIA",
  "Eagles": "PHI",
  "Falcons": "ATL",
  "Giants": "NYG",
  "Jaguars": "JAX",
  "Jets": "NYJ",
  "Lions": "DET",
  "Packers": "GB",
  "Panthers": "CAR",
  "Patriots": "NE",
  "Raiders": "LV",
  "Rams": "LAR",
  "Ravens": "BAL",
  "Saints": "NO",
  "Seahawks": "SEA",
  "Steelers": "PIT",
  "Texans": "HOU",
  "Titans": "TEN",
  "Vikings": "MIN",
};

// NBA team name to abbreviation mapping
export const NBA_TEAM_ABBREVIATIONS: Record<string, string> = {
  "76ers": "PHI",
  "Bucks": "MIL",
  "Bulls": "CHI",
  "Cavaliers": "CLE",
  "Celtics": "BOS",
  "Clippers": "LAC",
  "Grizzlies": "MEM",
  "Hawks": "ATL",
  "Heat": "MIA",
  "Hornets": "CHA",
  "Jazz": "UTA",
  "Kings": "SAC",
  "Knicks": "NYK",
  "Lakers": "LAL",
  "Magic": "ORL",
  "Mavericks": "DAL",
  "Nets": "BKN",
  "Nuggets": "DEN",
  "Pacers": "IND",
  "Pelicans": "NOP",
  "Pistons": "DET",
  "Raptors": "TOR",
  "Rockets": "HOU",
  "Spurs": "SAS",
  "Suns": "PHX",
  "Thunder": "OKC",
  "Timberwolves": "MIN",
  "Trail Blazers": "POR",
  "Warriors": "GSW",
  "Wizards": "WAS",
};

// Get team abbreviation from team name
export function getTeamAbbreviation(teamName: string): string {
  // Check NFL teams
  if (NFL_TEAM_ABBREVIATIONS[teamName]) {
    return NFL_TEAM_ABBREVIATIONS[teamName];
  }
  // Check NBA teams
  if (NBA_TEAM_ABBREVIATIONS[teamName]) {
    return NBA_TEAM_ABBREVIATIONS[teamName];
  }
  // Fallback: try partial match or first 3 chars
  for (const [name, abbr] of Object.entries({ ...NFL_TEAM_ABBREVIATIONS, ...NBA_TEAM_ABBREVIATIONS })) {
    if (teamName.toLowerCase().includes(name.toLowerCase())) {
      return abbr;
    }
  }
  // Last resort: first 3 characters uppercase
  return teamName.slice(0, 3).toUpperCase();
}

// Raw Polymarket sports API response type
interface RawPolymarketSport {
  id: number;
  sport: string;
  image?: string;
  resolution?: string;
  ordering?: string;
  tags?: string;
  series?: string;
  createdAt?: string;
}

// Fetch sports directly from Polymarket /sports endpoint
export async function fetchPolymarketSports(): Promise<PolymarketSport[]> {
  try {
    const response = await fetch("/api/polymarket/sports");
    if (!response.ok) {
      throw new Error(`Failed to fetch sports: ${response.status}`);
    }
    const rawSports: RawPolymarketSport[] = await response.json();
    
    return rawSports.map(raw => ({
      id: raw.id.toString(),
      slug: raw.sport,
      label: humanizeSportSlug(raw.sport),
      tags: raw.tags,
      series: raw.series,
      image: raw.image,
      resolutionSource: raw.resolution,
    }));
  } catch (error) {
    console.error("Error fetching Polymarket sports:", error);
    return [];
  }
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

// Legacy alias for backwards compatibility  
export const fetchCategorizedTags = fetchSportsWithMarketTypes;
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

export function gammaEventToDisplayEvent(event: GammaEvent): DisplayEvent | null {
  if (!event.markets?.length) return null;
  
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
        
        return {
          label,
          price: midPrice,
          executionPrice,
          tokenId: clobTokenIds[i],
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
      teamAbbrev: market.teamAbbrev,
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
