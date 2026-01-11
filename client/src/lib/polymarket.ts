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
  // New format: seriesId_marketType
  const parts = tagId.split("_");
  if (parts.length === 2 && !tagId.startsWith("series_")) {
    return { seriesId: parts[0], marketType: parts[1] };
  }
  // Legacy format: series_seriesId
  if (tagId.startsWith("series_")) {
    return { seriesId: tagId.replace("series_", ""), marketType: null };
  }
  return { seriesId: tagId, marketType: null };
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
    
    return uniqueEvents;
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
