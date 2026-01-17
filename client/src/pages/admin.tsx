import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Plus, Trash2, RefreshCw, Check, X, Link2, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { fetchSportsWithMarketTypes, type SportWithMarketTypes } from "@/lib/polymarket";
import type { Market, Player, InsertMarket, InsertPlayer, AdminSettings, Futures, SportFieldConfig, SportMarketConfig, PolymarketTagRecord } from "@shared/schema";

const playerFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  symbol: z.string().min(1, "Symbol is required").max(6, "Max 6 characters"),
  team: z.string().min(1, "Team is required"),
  sport: z.string().min(1, "Sport is required"),
  fundingTarget: z.number().min(1000, "Minimum 1,000"),
  fundingCurrent: z.number().min(0),
  status: z.enum(["offering", "available", "closed"]),
});

type PlayerFormData = z.infer<typeof playerFormSchema>;

function extractSlugFromInput(input: string): string {
  const trimmed = input.trim();
  
  if (trimmed.includes("polymarket.com")) {
    const match = trimmed.match(/polymarket\.com\/event\/([^/?#]+)/);
    if (match) return match[1];
    const marketMatch = trimmed.match(/polymarket\.com\/([^/?#]+)/);
    if (marketMatch) return marketMatch[1];
  }
  
  return trimmed;
}

export default function AdminPage() {
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState<"tags" | "matchday" | "futures" | "players" | "sportconfig">("tags");
  const [sportsData, setSportsData] = useState<SportWithMarketTypes[]>([]);
  const [loadingLeagues, setLoadingLeagues] = useState(false);
  const [showPlayerForm, setShowPlayerForm] = useState(false);
  const [futuresSlug, setFuturesSlug] = useState("");
  const [fetchingEvent, setFetchingEvent] = useState(false);
  const [expandedSports, setExpandedSports] = useState<Set<string>>(new Set());

  const playerForm = useForm<PlayerFormData>({
    resolver: zodResolver(playerFormSchema),
    defaultValues: {
      name: "",
      symbol: "",
      team: "",
      sport: "Basketball",
      fundingTarget: 100000,
      fundingCurrent: 0,
      status: "offering",
    },
  });

  const { data: markets = [], isLoading: marketsLoading } = useQuery<Market[]>({
    queryKey: ["/api/markets"],
  });

  const { data: players = [], isLoading: playersLoading } = useQuery<Player[]>({
    queryKey: ["/api/players"],
  });

  const { data: futuresList = [], isLoading: futuresLoading } = useQuery<Futures[]>({
    queryKey: ["/api/futures"],
  });

  const { data: adminSettings } = useQuery<AdminSettings>({
    queryKey: ["/api/admin/settings"],
  });

  const { data: polymarketTags = [], isLoading: tagsLoading } = useQuery<PolymarketTagRecord[]>({
    queryKey: ["/api/admin/tags"],
  });

  const syncTagsMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/admin/tags/sync", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tags/enabled"] });
      toast({ title: "Tags synced from Polymarket" });
    },
    onError: () => {
      toast({ title: "Failed to sync tags", variant: "destructive" });
    },
  });

  const toggleTagMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      return apiRequest("PATCH", `/api/admin/tags/${id}/enabled`, { enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tags/enabled"] });
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (updates: Partial<AdminSettings>) => {
      return apiRequest("PATCH", "/api/admin/settings", updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      toast({ title: "Settings saved" });
    },
  });

  const loadSportsLeagues = async () => {
    setLoadingLeagues(true);
    try {
      const sports = await fetchSportsWithMarketTypes();
      setSportsData(sports);
    } catch (error) {
      toast({ title: "Failed to load sports tags", variant: "destructive" });
    } finally {
      setLoadingLeagues(false);
    }
  };

  useEffect(() => {
    if (activeSection === "matchday" && sportsData.length === 0) {
      loadSportsLeagues();
    }
  }, [activeSection]);

  // Toggle a market type tag (format: "seriesId_marketType")
  const handleMarketTypeToggle = (tagId: string, checked: boolean) => {
    const currentTags = adminSettings?.activeTagIds || [];
    
    if (checked) {
      const newTags = Array.from(new Set([...currentTags, tagId]));
      updateSettingsMutation.mutate({ activeTagIds: newTags });
    } else {
      const newTags = currentTags.filter(id => id !== tagId);
      updateSettingsMutation.mutate({ activeTagIds: newTags });
    }
  };

  // Toggle all market types for a sport
  const handleSportToggleAll = (sport: SportWithMarketTypes, checked: boolean) => {
    const currentTags = adminSettings?.activeTagIds || [];
    const sportMarketTypeIds = sport.marketTypes.map(mt => mt.id);
    
    if (checked) {
      const newTags = Array.from(new Set([...currentTags, ...sportMarketTypeIds]));
      updateSettingsMutation.mutate({ activeTagIds: newTags });
    } else {
      const newTags = currentTags.filter(id => !sportMarketTypeIds.includes(id));
      updateSettingsMutation.mutate({ activeTagIds: newTags });
    }
  };

  // Check if any market types are selected for a sport
  const isSportPartiallySelected = (sport: SportWithMarketTypes) => {
    const currentTags = adminSettings?.activeTagIds || [];
    const sportMarketTypeIds = sport.marketTypes.map(mt => mt.id);
    return sportMarketTypeIds.some(id => currentTags.includes(id));
  };

  // Check if all market types are selected for a sport
  const isSportFullySelected = (sport: SportWithMarketTypes) => {
    const currentTags = adminSettings?.activeTagIds || [];
    const sportMarketTypeIds = sport.marketTypes.map(mt => mt.id);
    return sportMarketTypeIds.every(id => currentTags.includes(id));
  };

  // Toggle sport expansion
  const toggleSportExpansion = (sportId: string) => {
    setExpandedSports(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sportId)) {
        newSet.delete(sportId);
      } else {
        newSet.add(sportId);
      }
      return newSet;
    });
  };

  // Get active sports for display (sports with at least one selected market type)
  const getActiveSportsInfo = () => {
    const currentTags = adminSettings?.activeTagIds || [];
    const activeSports: { sport: SportWithMarketTypes; marketTypes: string[] }[] = [];
    
    for (const sport of sportsData) {
      const activeMarketTypes = sport.marketTypes
        .filter(mt => currentTags.includes(mt.id))
        .map(mt => mt.label);
      if (activeMarketTypes.length > 0) {
        activeSports.push({ sport, marketTypes: activeMarketTypes });
      }
    }
    return activeSports;
  };

  const createFuturesMutation = useMutation({
    mutationFn: async (future: {
      polymarketSlug: string;
      polymarketEventId?: string;
      title: string;
      description?: string;
      imageUrl?: string;
      startDate?: string;
      endDate?: string;
      marketData?: {
        question: string;
        outcomes: Array<{ label: string; probability: number; odds: number; marketId?: string; conditionId?: string }>;
        volume: number;
        liquidity: number;
        conditionId: string;
      };
    }) => {
      return apiRequest("POST", "/api/futures", future);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/futures"] });
      toast({ title: "Future event added" });
      setFuturesSlug("");
    },
    onError: () => {
      toast({ title: "Failed to add futures event", variant: "destructive" });
    },
  });

  const deleteFuturesMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/futures/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/futures"] });
      toast({ title: "Future event removed" });
    },
  });

  const handleAddFutures = async () => {
    if (!futuresSlug.trim()) {
      toast({ title: "Please enter a Polymarket event slug or URL", variant: "destructive" });
      return;
    }

    setFetchingEvent(true);
    try {
      const slug = extractSlugFromInput(futuresSlug);
      const response = await fetch(`/api/polymarket/event-by-slug?slug=${encodeURIComponent(slug)}`);
      
      if (!response.ok) {
        toast({ title: "Event not found on Polymarket", variant: "destructive" });
        return;
      }

      const result = await response.json();
      const eventData = result.data;

      if (result.type === "event") {
        const markets = eventData.markets || [];
        let marketData = undefined;
        
        if (markets.length > 0) {
          try {
            const allOutcomes: Array<{ label: string; probability: number; odds: number; marketId?: string; conditionId?: string }> = [];
            let totalVolume = 0;
            let totalLiquidity = 0;
            
            for (const market of markets) {
              const prices = JSON.parse(market.outcomePrices || "[]");
              const outcomes = JSON.parse(market.outcomes || "[]");
              totalVolume += parseFloat(market.volume || "0");
              totalLiquidity += parseFloat(market.liquidity || "0");
              
              outcomes.forEach((outcomeName: string, i: number) => {
                const prob = parseFloat(prices[i] || "0");
                if (outcomeName.toLowerCase() === "yes" || markets.length === 1) {
                  // For multi-market events, use groupItemTitle or extract team name from question
                  // For single markets, use the outcome name directly
                  let displayLabel = outcomeName;
                  if (markets.length > 1) {
                    // Prefer groupItemTitle if available (contains short name like "Arsenal")
                    if (market.groupItemTitle) {
                      displayLabel = market.groupItemTitle;
                    } else {
                      // Extract team/entity name from question by removing common phrases
                      displayLabel = market.question
                        ?.replace(/^Will /i, "")
                        .replace(/ (finish|win|be|make|qualify|reach|place|get|score|have|become).*$/i, "")
                        ?.trim() || outcomeName;
                    }
                  }
                  allOutcomes.push({
                    label: displayLabel,
                    probability: prob,
                    odds: prob > 0 ? Math.round((1 / prob) * 100) / 100 : 99,
                    marketId: market.id,
                    conditionId: market.conditionId,
                  });
                }
              });
            }
            
            allOutcomes.sort((a, b) => b.probability - a.probability);
            
            marketData = {
              question: eventData.title,
              outcomes: allOutcomes,
              volume: totalVolume,
              liquidity: totalLiquidity,
              conditionId: markets[0]?.conditionId || "",
            };
          } catch (e) {
            console.error("Failed to parse market data:", e);
          }
        }

        await createFuturesMutation.mutateAsync({
          polymarketSlug: slug,
          polymarketEventId: eventData.id,
          title: eventData.title,
          description: eventData.description,
          imageUrl: eventData.image,
          startDate: eventData.startDate,
          endDate: eventData.endDate,
          marketData,
        });
      } else if (result.type === "market") {
        let marketData = undefined;
        try {
          const prices = JSON.parse(eventData.outcomePrices || "[]");
          const outcomes = JSON.parse(eventData.outcomes || "[]");
          marketData = {
            question: eventData.question,
            outcomes: outcomes.map((label: string, i: number) => {
              const prob = parseFloat(prices[i] || "0");
              return {
                label,
                probability: prob,
                odds: prob > 0 ? Math.round((1 / prob) * 100) / 100 : 99,
              };
            }),
            volume: parseFloat(eventData.volume || "0"),
            liquidity: parseFloat(eventData.liquidity || "0"),
            conditionId: eventData.conditionId || "",
          };
        } catch (e) {
          console.error("Failed to parse market data:", e);
        }

        await createFuturesMutation.mutateAsync({
          polymarketSlug: slug,
          polymarketEventId: eventData.id,
          title: eventData.question || slug,
          description: eventData.description,
          marketData,
        });
      }
    } catch (error) {
      console.error("Error adding futures:", error);
      toast({ title: "Failed to fetch event details", variant: "destructive" });
    } finally {
      setFetchingEvent(false);
    }
  };

  const createPlayerMutation = useMutation({
    mutationFn: async (player: InsertPlayer) => {
      return apiRequest("POST", "/api/players", player);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      toast({ title: "Player created successfully" });
      setShowPlayerForm(false);
      playerForm.reset();
    },
  });

  const deletePlayerMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/players/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      toast({ title: "Player deleted" });
    },
  });

  const onSubmitPlayer = (data: PlayerFormData) => {
    const fundingPercentage = Math.round((data.fundingCurrent / data.fundingTarget) * 100);
    const avatarInitials = data.name
      .split(" ")
      .map(n => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

    const newPlayer: InsertPlayer = {
      name: data.name,
      symbol: data.symbol.toUpperCase(),
      team: data.team,
      sport: data.sport,
      avatarInitials,
      fundingTarget: data.fundingTarget,
      fundingCurrent: data.fundingCurrent,
      fundingPercentage,
      generation: 1,
      status: data.status,
      stats: data.status === "available" ? {
        holders: Math.floor(Math.random() * 500) + 50,
        marketCap: data.fundingTarget,
        change24h: 0,
      } : undefined,
    };
    createPlayerMutation.mutate(newPlayer);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-black">Admin CMS</h1>
        </div>

        <div className="flex gap-2 mb-6 flex-wrap">
          <Button
            variant={activeSection === "tags" ? "default" : "secondary"}
            onClick={() => setActiveSection("tags")}
            data-testid="button-section-tags"
          >
            Tags ({polymarketTags.filter(t => t.enabled).length})
          </Button>
          <Button
            variant={activeSection === "matchday" ? "default" : "secondary"}
            onClick={() => setActiveSection("matchday")}
            data-testid="button-section-matchday"
          >
            Match Day
          </Button>
          <Button
            variant={activeSection === "futures" ? "default" : "secondary"}
            onClick={() => setActiveSection("futures")}
            data-testid="button-section-futures"
          >
            Futures ({futuresList.length})
          </Button>
          <Button
            variant={activeSection === "players" ? "default" : "secondary"}
            onClick={() => setActiveSection("players")}
            data-testid="button-section-players"
          >
            Demo Players ({players.length})
          </Button>
          <Button
            variant={activeSection === "sportconfig" ? "default" : "secondary"}
            onClick={() => setActiveSection("sportconfig")}
            data-testid="button-section-sportconfig"
          >
            Sport Config
          </Button>
        </div>

        {activeSection === "tags" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center gap-2 flex-wrap">
              <div>
                <h2 className="text-lg font-bold">Tag Management</h2>
                <p className="text-sm text-zinc-500">
                  Enable sports tags to show in both Match Day and Futures views
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => syncTagsMutation.mutate()}
                disabled={syncTagsMutation.isPending}
                data-testid="button-sync-tags"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${syncTagsMutation.isPending ? "animate-spin" : ""}`} />
                Sync from Polymarket
              </Button>
            </div>

            {tagsLoading ? (
              <div className="text-zinc-500">Loading tags...</div>
            ) : polymarketTags.length === 0 ? (
              <Card className="p-8 text-center text-zinc-500">
                No tags found. Click "Sync from Polymarket" to fetch sports tags.
              </Card>
            ) : (
              <div className="space-y-2">
                {polymarketTags
                  .filter(tag => tag.category === "league")
                  .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
                  .map((tag) => (
                    <Card
                      key={tag.id}
                      className={`p-4 flex items-center justify-between cursor-pointer transition-colors ${
                        tag.enabled ? "bg-wild-brand/10 border-wild-brand/30" : ""
                      }`}
                      onClick={() => toggleTagMutation.mutate({ id: tag.id, enabled: !tag.enabled })}
                      data-testid={`tag-${tag.slug}`}
                    >
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={tag.enabled}
                          onClick={(e) => e.stopPropagation()}
                          onCheckedChange={(checked) => toggleTagMutation.mutate({ id: tag.id, enabled: checked as boolean })}
                        />
                        <div>
                          <div className="text-white font-medium">{tag.label}</div>
                          <div className="text-xs text-zinc-500">{tag.slug}</div>
                        </div>
                      </div>
                      {tag.enabled && <Check className="w-4 h-4 text-wild-brand" />}
                    </Card>
                  ))}
              </div>
            )}

            {polymarketTags.filter(t => t.enabled).length > 0 && (
              <div className="mt-4 p-4 bg-zinc-900 rounded-md">
                <div className="text-sm text-zinc-400 mb-2">
                  Enabled Tags - Events will be fetched for:
                </div>
                <div className="flex flex-wrap gap-2">
                  {polymarketTags.filter(t => t.enabled).map((tag) => (
                    <span
                      key={tag.id}
                      className="px-2 py-1 bg-wild-brand/20 text-wild-brand rounded text-xs"
                    >
                      {tag.label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeSection === "matchday" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center gap-2 flex-wrap">
              <div>
                <h2 className="text-lg font-bold">Match Day - Sports Leagues</h2>
                <p className="text-sm text-zinc-500">
                  Select leagues and bet types to show in the Predict tab
                </p>
              </div>
              <Button
                variant="outline"
                onClick={loadSportsLeagues}
                disabled={loadingLeagues}
                data-testid="button-refresh-leagues"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loadingLeagues ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>

            {loadingLeagues ? (
              <div className="text-zinc-500">Loading sports from Polymarket...</div>
            ) : sportsData.length === 0 ? (
              <Card className="p-8 text-center text-zinc-500">
                No sports found. Click "Refresh" to load from Polymarket.
              </Card>
            ) : (
              <div className="space-y-2">
                {sportsData.map((sport) => {
                  const isExpanded = expandedSports.has(sport.id);
                  const isPartial = isSportPartiallySelected(sport);
                  const isFull = isSportFullySelected(sport);
                  
                  return (
                    <Card key={sport.id} className="overflow-hidden">
                      <div
                        className={`p-4 flex items-center justify-between cursor-pointer transition-colors ${
                          isPartial ? "bg-wild-brand/5" : ""
                        }`}
                        onClick={() => toggleSportExpansion(sport.id)}
                        data-testid={`sport-${sport.slug}`}
                      >
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={isFull}
                            className={isPartial && !isFull ? "data-[state=checked]:bg-wild-brand/50" : ""}
                            onClick={(e) => e.stopPropagation()}
                            onCheckedChange={(checked) => handleSportToggleAll(sport, checked as boolean)}
                            data-testid={`checkbox-sport-${sport.slug}`}
                          />
                          {sport.image && (
                            <img 
                              src={sport.image} 
                              alt={sport.label} 
                              className="w-8 h-8 rounded object-cover"
                            />
                          )}
                          <div>
                            <div className="text-white font-medium">{sport.label}</div>
                            <div className="text-xs text-zinc-500">
                              {isPartial ? (
                                <span className="text-wild-brand">
                                  {sport.marketTypes.filter(mt => adminSettings?.activeTagIds?.includes(mt.id)).length} of {sport.marketTypes.length} bet types
                                </span>
                              ) : (
                                `${sport.marketTypes.length} bet types available`
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {isPartial && <Check className="w-4 h-4 text-wild-brand" />}
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-zinc-400" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-zinc-400" />
                          )}
                        </div>
                      </div>
                      
                      {isExpanded && (
                        <div className="border-t border-zinc-800 bg-zinc-900/50 p-3 space-y-2">
                          {sport.marketTypes.map((mt) => {
                            const isActive = adminSettings?.activeTagIds?.includes(mt.id);
                            return (
                              <div
                                key={mt.id}
                                className={`p-2 rounded flex items-center gap-3 cursor-pointer transition-colors ${
                                  isActive ? "bg-wild-brand/10" : "hover:bg-zinc-800"
                                }`}
                                onClick={() => handleMarketTypeToggle(mt.id, !isActive)}
                                data-testid={`market-type-${mt.id}`}
                              >
                                <Checkbox
                                  checked={isActive}
                                  onClick={(e) => e.stopPropagation()}
                                  onCheckedChange={(checked) => handleMarketTypeToggle(mt.id, checked as boolean)}
                                />
                                <div>
                                  <div className="text-sm text-white">{mt.label}</div>
                                  <div className="text-xs text-zinc-500">{mt.type}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}

            {getActiveSportsInfo().length > 0 && (
              <div className="mt-4 p-4 bg-zinc-900 rounded-md">
                <div className="text-sm text-zinc-400 mb-2">
                  Active Selections - Games will auto-populate:
                </div>
                <div className="space-y-2">
                  {getActiveSportsInfo().map(({ sport, marketTypes }) => (
                    <div key={sport.id} className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-white">{sport.label}:</span>
                      {marketTypes.map((mtLabel) => (
                        <span
                          key={mtLabel}
                          className="px-2 py-1 bg-wild-brand/20 text-wild-brand rounded text-xs"
                        >
                          {mtLabel}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeSection === "futures" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold">Futures - Long-term Events</h2>
              <p className="text-sm text-zinc-500">
                Add Polymarket events by slug or URL for long-term betting
              </p>
            </div>

            <Card className="p-4 space-y-4">
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    placeholder="Paste Polymarket event URL or slug (e.g., super-bowl-winner-2026)"
                    value={futuresSlug}
                    onChange={(e) => setFuturesSlug(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddFutures()}
                    data-testid="input-futures-slug"
                  />
                </div>
                <Button
                  onClick={handleAddFutures}
                  disabled={fetchingEvent || !futuresSlug.trim()}
                  data-testid="button-add-futures"
                >
                  {fetchingEvent ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Link2 className="w-4 h-4 mr-2" />
                      Add
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-zinc-600">
                Examples: "super-bowl-winner-2026" or "https://polymarket.com/event/super-bowl-winner-2026"
              </p>
            </Card>

            {futuresLoading ? (
              <div className="text-zinc-500">Loading...</div>
            ) : futuresList.length === 0 ? (
              <Card className="p-8 text-center text-zinc-500">
                No futures events yet. Add one using a Polymarket event link above.
              </Card>
            ) : (
              <div className="space-y-2">
                {futuresList.map((future) => (
                  <Card
                    key={future.id}
                    className="p-4 flex justify-between items-start gap-4"
                    data-testid={`futures-${future.id}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-bold truncate">{future.title}</div>
                      <div className="text-sm text-zinc-500 truncate">
                        Slug: {future.polymarketSlug}
                      </div>
                      {future.marketData?.outcomes && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {future.marketData.outcomes.slice(0, 3).map((outcome, i) => (
                            <span
                              key={i}
                              className="text-xs px-2 py-1 bg-zinc-800 rounded"
                            >
                              {outcome.label}: {(outcome.probability * 100).toFixed(0)}%
                            </span>
                          ))}
                        </div>
                      )}
                      {future.endDate && (
                        <div className="text-xs text-zinc-600 mt-1">
                          Ends: {new Date(future.endDate).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={() => deleteFuturesMutation.mutate(future.id)}
                      disabled={deleteFuturesMutation.isPending}
                      data-testid={`button-delete-futures-${future.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {activeSection === "players" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold">Demo Players</h2>
              <Button
                onClick={() => setShowPlayerForm(!showPlayerForm)}
                data-testid="button-toggle-player-form"
              >
                {showPlayerForm ? (
                  <>
                    <X className="w-4 h-4 mr-2" />
                    Cancel
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Player
                  </>
                )}
              </Button>
            </div>

            {showPlayerForm && (
              <Card className="p-4 space-y-4">
                <h3 className="font-bold text-zinc-300">Create New Player</h3>
                <form onSubmit={playerForm.handleSubmit(onSubmitPlayer)} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Player Name</Label>
                      <Input
                        id="name"
                        placeholder="e.g. LeBron James"
                        {...playerForm.register("name")}
                        data-testid="input-player-name"
                      />
                      {playerForm.formState.errors.name && (
                        <p className="text-xs text-red-500">{playerForm.formState.errors.name.message}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="symbol">Symbol (Token)</Label>
                      <Input
                        id="symbol"
                        placeholder="e.g. LBJ"
                        maxLength={6}
                        {...playerForm.register("symbol")}
                        data-testid="input-player-symbol"
                      />
                      {playerForm.formState.errors.symbol && (
                        <p className="text-xs text-red-500">{playerForm.formState.errors.symbol.message}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="team">Team</Label>
                      <Input
                        id="team"
                        placeholder="e.g. Los Angeles Lakers"
                        {...playerForm.register("team")}
                        data-testid="input-player-team"
                      />
                      {playerForm.formState.errors.team && (
                        <p className="text-xs text-red-500">{playerForm.formState.errors.team.message}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sport">Sport</Label>
                      <Select
                        value={playerForm.watch("sport")}
                        onValueChange={(value) => playerForm.setValue("sport", value)}
                      >
                        <SelectTrigger data-testid="select-player-sport">
                          <SelectValue placeholder="Select sport" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Basketball">Basketball</SelectItem>
                          <SelectItem value="Football">Football</SelectItem>
                          <SelectItem value="Soccer">Soccer</SelectItem>
                          <SelectItem value="Baseball">Baseball</SelectItem>
                          <SelectItem value="Hockey">Hockey</SelectItem>
                          <SelectItem value="Tennis">Tennis</SelectItem>
                          <SelectItem value="Golf">Golf</SelectItem>
                          <SelectItem value="MMA">MMA</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="fundingTarget">Funding Target ($)</Label>
                      <Input
                        id="fundingTarget"
                        type="number"
                        {...playerForm.register("fundingTarget", { valueAsNumber: true })}
                        data-testid="input-funding-target"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="fundingCurrent">Current Funding ($)</Label>
                      <Input
                        id="fundingCurrent"
                        type="number"
                        {...playerForm.register("fundingCurrent", { valueAsNumber: true })}
                        data-testid="input-funding-current"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="status">Status</Label>
                      <Select
                        value={playerForm.watch("status")}
                        onValueChange={(value: "offering" | "available" | "closed") => 
                          playerForm.setValue("status", value)
                        }
                      >
                        <SelectTrigger data-testid="select-player-status">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="offering">Offering (Funding)</SelectItem>
                          <SelectItem value="available">Available (Trading)</SelectItem>
                          <SelectItem value="closed">Closed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={createPlayerMutation.isPending}
                    className="w-full"
                    data-testid="button-submit-player"
                  >
                    {createPlayerMutation.isPending ? "Creating..." : "Create Player"}
                  </Button>
                </form>
              </Card>
            )}

            {playersLoading ? (
              <div className="text-zinc-500">Loading...</div>
            ) : players.length === 0 ? (
              <Card className="p-8 text-center text-zinc-500">
                No players yet. Click "Add Player" to create one.
              </Card>
            ) : (
              <div className="space-y-2">
                {players.map((player) => (
                  <Card
                    key={player.id}
                    className="p-4 flex justify-between items-center gap-2"
                    data-testid={`admin-player-${player.id}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-bold truncate">{player.name}</div>
                      <div className="text-sm text-zinc-500">
                        ${player.symbol} | {player.team} | {player.sport} | {player.status}
                      </div>
                      <div className="text-xs text-zinc-600">
                        Funding: ${player.fundingCurrent.toLocaleString()} / ${player.fundingTarget.toLocaleString()} ({player.fundingPercentage}%)
                      </div>
                    </div>
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={() => deletePlayerMutation.mutate(player.id)}
                      disabled={deletePlayerMutation.isPending}
                      data-testid={`button-delete-player-${player.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {activeSection === "sportconfig" && (
          <SportConfigEditor sportsData={sportsData} toast={toast} />
        )}
      </div>
    </div>
  );
}

interface EnhancedSampleData {
  event: { 
    id: string; 
    title: string; 
    slug?: string;
    description: string; 
    startDate: string; 
    endDate?: string;
    seriesSlug?: string;
  } | null;
  market: {
    id: string;
    conditionId?: string;
    slug?: string;
    question: string;
    groupItemTitle: string;
    sportsMarketType: string;
    subtitle?: string;
    extraInfo?: string;
    participantName?: string;
    teamAbbrev?: string;
    line?: number;
    outcomes: string;
    outcomePrices: string;
    bestAsk?: number;
    bestBid?: number;
    volume?: string;
    liquidity?: string;
    gameStartTime?: string;
    tokens?: unknown;
    spread?: number;
    active?: boolean;
    closed?: boolean;
    clobTokenIds?: string;
  } | null;
  rawMarket?: Record<string, unknown>;
  allMarketTypes: string[];
  availableMarketTypes?: string[];
  eventsSearched?: number;
  message?: string;
}

function SportConfigEditor({ 
  sportsData, 
  toast 
}: { 
  sportsData: SportWithMarketTypes[];
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [selectedSport, setSelectedSport] = useState<string>("");
  const [selectedMarketType, setSelectedMarketType] = useState<string>("");
  const [availableMarketTypes, setAvailableMarketTypes] = useState<{
    type: string;
    label: string;
    count: number;
    sampleQuestion: string;
  }[]>([]);
  const [sampleData, setSampleData] = useState<EnhancedSampleData | null>(null);
  const [loadingMarketTypes, setLoadingMarketTypes] = useState(false);
  const [loadingSample, setLoadingSample] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);
  const [eventsScanned, setEventsScanned] = useState(0);
  
  const [formData, setFormData] = useState({
    titleField: "groupItemTitle",
    buttonLabelField: "outcomes",
    betSlipTitleField: "question",
    useQuestionForTitle: false,
    showLine: false,
    lineFieldPath: "line",
    lineFormatter: "default",
    outcomeStrategy: { type: "default" } as { type: string; fallback?: string; regex?: string; template?: string },
    notes: "",
  });

  const { data: configs = [] } = useQuery<SportMarketConfig[]>({
    queryKey: ["/api/admin/sport-market-configs"],
  });

  const saveConfigMutation = useMutation({
    mutationFn: async (data: {
      sportSlug: string;
      sportLabel: string;
      marketType: string;
      marketTypeLabel?: string;
      titleField: string;
      buttonLabelField: string;
      betSlipTitleField: string;
      useQuestionForTitle: boolean;
      showLine: boolean;
      lineFieldPath?: string;
      lineFormatter?: string;
      outcomeStrategy?: { type: string; fallback?: string; regex?: string; template?: string };
      sampleData?: Record<string, unknown>;
      notes?: string;
    }) => {
      return apiRequest("POST", "/api/admin/sport-market-configs", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sport-market-configs"] });
      toast({ title: "Configuration saved" });
    },
    onError: () => {
      toast({ title: "Failed to save config", variant: "destructive" });
    },
  });

  const deleteConfigMutation = useMutation({
    mutationFn: async ({ sportSlug, marketType }: { sportSlug: string; marketType: string }) => {
      return apiRequest("DELETE", `/api/admin/sport-market-configs/${sportSlug}/${marketType}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sport-market-configs"] });
      toast({ title: "Config deleted" });
    },
  });

  const handleSelectSport = async (sportId: string) => {
    setSelectedSport(sportId);
    setSelectedMarketType("");
    setSampleData(null);
    setAvailableMarketTypes([]);
    
    const sport = sportsData.find(s => s.id === sportId);
    if (!sport) return;

    setLoadingMarketTypes(true);
    try {
      // Use the comprehensive market types discovery endpoint
      const response = await fetch(`/api/admin/sport-market-types/${sport.seriesId}`);
      const data = await response.json();
      setAvailableMarketTypes(data.marketTypes || []);
      setEventsScanned(data.eventsScanned || 0);
    } catch (error) {
      console.error("Failed to fetch market types:", error);
      setAvailableMarketTypes([]);
      setEventsScanned(0);
    } finally {
      setLoadingMarketTypes(false);
    }
  };

  const handleSelectMarketType = async (marketType: string) => {
    setSelectedMarketType(marketType);
    
    const sport = sportsData.find(s => s.id === selectedSport);
    if (!sport) return;

    const existingConfig = configs.find(
      c => c.sportSlug === sport.slug && c.marketType === marketType
    );
    
    if (existingConfig) {
      setFormData({
        titleField: existingConfig.titleField,
        buttonLabelField: existingConfig.buttonLabelField,
        betSlipTitleField: existingConfig.betSlipTitleField,
        useQuestionForTitle: existingConfig.useQuestionForTitle,
        showLine: existingConfig.showLine,
        lineFieldPath: existingConfig.lineFieldPath || "line",
        lineFormatter: existingConfig.lineFormatter || "default",
        outcomeStrategy: existingConfig.outcomeStrategy || { type: "default" },
        notes: existingConfig.notes || "",
      });
    } else {
      // Smart defaults based on market type
      const isSpreads = marketType.includes("spread") || marketType.includes("handicap");
      const isTotals = marketType.includes("total") || marketType.includes("over_under");
      setFormData({
        titleField: "groupItemTitle",
        buttonLabelField: "outcomes",
        betSlipTitleField: "question",
        useQuestionForTitle: false,
        showLine: isSpreads || isTotals,
        lineFieldPath: "line",
        lineFormatter: isSpreads ? "spread" : isTotals ? "total" : "default",
        outcomeStrategy: { type: "default" },
        notes: "",
      });
    }

    setLoadingSample(true);
    try {
      // Use the enhanced v2 sample endpoint for better data
      const response = await fetch(`/api/admin/sport-sample-v2/${sport.seriesId}/${marketType}`);
      const data = await response.json();
      setSampleData(data);
    } catch (error) {
      console.error("Failed to fetch sample data:", error);
    } finally {
      setLoadingSample(false);
    }
  };

  const handleSave = () => {
    const sport = sportsData.find(s => s.id === selectedSport);
    if (!sport || !selectedMarketType) return;

    saveConfigMutation.mutate({
      sportSlug: sport.slug,
      sportLabel: sport.label,
      marketType: selectedMarketType,
      marketTypeLabel: selectedMarketType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      ...formData,
      sampleData: sampleData?.market as Record<string, unknown> | undefined,
    });
  };

  const availableFields = [
    { value: "question", label: "question - Full question text" },
    { value: "groupItemTitle", label: "groupItemTitle - Short market title" },
    { value: "sportsMarketType", label: "sportsMarketType - Market type label" },
    { value: "outcomes", label: "outcomes - Outcome labels" },
    { value: "subtitle", label: "subtitle - Additional context" },
    { value: "extraInfo", label: "extraInfo - Extra market info" },
  ];

  const outcomeStrategies = [
    { value: "default", label: "Default - Use raw outcome labels" },
    { value: "team_abbrev", label: "Team Abbreviation - Parse team abbreviations" },
    { value: "yes_no", label: "Yes/No - Binary outcome mapping" },
    { value: "over_under", label: "Over/Under - O/U with line" },
    { value: "spread", label: "Spread - +/- with line" },
    { value: "regex", label: "Regex - Custom pattern extraction" },
  ];

  const lineFormatters = [
    { value: "default", label: "Default - Show as-is" },
    { value: "spread", label: "Spread - Show as +X.X or -X.X" },
    { value: "total", label: "Total - Show as O/U X.X" },
    { value: "none", label: "None - Hide line" },
  ];

  const getFieldPreview = (fieldName: string) => {
    if (!sampleData?.market) return "N/A";
    const market = sampleData.market as Record<string, unknown>;
    const value = market[fieldName];
    if (value === null || value === undefined) return "null";
    if (typeof value === "string") return value.length > 50 ? value.slice(0, 50) + "..." : value;
    return String(value);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">Sport + Market Type Configuration</h2>
        <p className="text-sm text-zinc-500">
          Configure display settings for each sport and bet type combination
        </p>
      </div>

      <Card className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>1. Select Sport</Label>
            <Select value={selectedSport} onValueChange={handleSelectSport}>
              <SelectTrigger data-testid="select-sport-config">
                <SelectValue placeholder="Choose a sport..." />
              </SelectTrigger>
              <SelectContent>
                {sportsData.map((sport) => {
                  const configCount = configs.filter(c => c.sportSlug === sport.slug).length;
                  return (
                    <SelectItem key={sport.id} value={sport.id}>
                      {sport.label}
                      {configCount > 0 && ` (${configCount} configs)`}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>2. Select Market Type</Label>
            <Select 
              value={selectedMarketType} 
              onValueChange={handleSelectMarketType}
              disabled={!selectedSport || loadingMarketTypes || availableMarketTypes.length === 0}
            >
              <SelectTrigger data-testid="select-market-type">
                <SelectValue placeholder={loadingMarketTypes ? "Loading market types..." : "Choose bet type..."} />
              </SelectTrigger>
              <SelectContent>
                {availableMarketTypes.map((mt) => {
                  const sport = sportsData.find(s => s.id === selectedSport);
                  const hasConfig = sport && configs.some(c => c.sportSlug === sport.slug && c.marketType === mt.type);
                  return (
                    <SelectItem key={mt.type} value={mt.type}>
                      {mt.label} ({mt.count}){hasConfig ? " - configured" : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {eventsScanned > 0 && (
              <p className="text-xs text-zinc-500">
                Found {availableMarketTypes.length} market types from {eventsScanned} events
              </p>
            )}
          </div>
        </div>

        {selectedSport && selectedMarketType && (
          <>
            <div className="border-t border-zinc-800 pt-4">
              <h3 className="font-medium text-zinc-300 mb-3">Field Mappings</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Market Title Field</Label>
                  <Select
                    value={formData.titleField}
                    onValueChange={(v) => setFormData(prev => ({ ...prev, titleField: v }))}
                  >
                    <SelectTrigger data-testid="select-title-field">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableFields.map(f => (
                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="text-xs text-zinc-500 truncate">Preview: {getFieldPreview(formData.titleField)}</div>
                </div>

                <div className="space-y-2">
                  <Label>Button Labels Field</Label>
                  <Select
                    value={formData.buttonLabelField}
                    onValueChange={(v) => setFormData(prev => ({ ...prev, buttonLabelField: v }))}
                  >
                    <SelectTrigger data-testid="select-button-field">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableFields.map(f => (
                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Bet Slip Title</Label>
                  <Select
                    value={formData.betSlipTitleField}
                    onValueChange={(v) => setFormData(prev => ({ ...prev, betSlipTitleField: v }))}
                  >
                    <SelectTrigger data-testid="select-betslip-field">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableFields.map(f => (
                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="border-t border-zinc-800 pt-4">
              <h3 className="font-medium text-zinc-300 mb-3">Line & Outcome Display</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Show Line Number</Label>
                  <div className="flex items-center gap-2 pt-2">
                    <Checkbox
                      checked={formData.showLine}
                      onCheckedChange={(checked) => 
                        setFormData(prev => ({ ...prev, showLine: checked as boolean }))
                      }
                      data-testid="checkbox-show-line"
                    />
                    <span className="text-sm text-zinc-400">
                      Display line (e.g., 246.5, +12.5)
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Line Formatter</Label>
                  <Select
                    value={formData.lineFormatter}
                    onValueChange={(v) => setFormData(prev => ({ ...prev, lineFormatter: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {lineFormatters.map(f => (
                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Outcome Strategy</Label>
                  <Select
                    value={formData.outcomeStrategy.type}
                    onValueChange={(v) => setFormData(prev => ({ 
                      ...prev, 
                      outcomeStrategy: { ...prev.outcomeStrategy, type: v }
                    }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {outcomeStrategies.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-3">
                <Checkbox
                  checked={formData.useQuestionForTitle}
                  onCheckedChange={(checked) => 
                    setFormData(prev => ({ ...prev, useQuestionForTitle: checked as boolean }))
                  }
                  data-testid="checkbox-use-question"
                />
                <span className="text-sm text-zinc-400">
                  Use question field for market title (overrides title field selection)
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Input
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Add notes about this configuration..."
                data-testid="input-notes"
              />
            </div>

            <Button
              onClick={handleSave}
              disabled={saveConfigMutation.isPending}
              className="w-full"
              data-testid="button-save-config"
            >
              {saveConfigMutation.isPending ? "Saving..." : `Save ${selectedMarketType.replace(/_/g, " ")} Configuration`}
            </Button>
          </>
        )}
      </Card>

      {selectedSport && sampleData?.market && (
        <Card className="p-4 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-zinc-300">Sample API Data</h3>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setShowRawJson(!showRawJson)}
            >
              {showRawJson ? "Hide Raw JSON" : "Show Raw JSON"}
            </Button>
          </div>
          
          {showRawJson ? (
            <div className="p-3 bg-zinc-900 rounded text-xs font-mono overflow-x-auto max-h-96 overflow-y-auto">
              <pre>{JSON.stringify(sampleData.rawMarket || sampleData.market, null, 2)}</pre>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2 text-sm">
                {Object.entries(sampleData.market).map(([key, value]) => (
                  <div key={key} className="p-2 bg-zinc-900 rounded">
                    <span className="text-blue-400 font-mono">{key}:</span>{" "}
                    <span className="text-green-400">
                      {typeof value === "object" ? JSON.stringify(value).slice(0, 60) + "..." : String(value).slice(0, 60)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <div className="text-xs text-zinc-500">
            <strong>All market types for this sport:</strong> {availableMarketTypes.map(mt => mt.label).join(", ") || "None found"}
          </div>
          {sampleData?.eventsSearched && (
            <div className="text-xs text-zinc-400">
              Sample from searching {sampleData.eventsSearched} events
            </div>
          )}
        </Card>
      )}

      {configs.length > 0 && (
        <Card className="p-4 space-y-3">
          <h3 className="font-bold text-zinc-300">Saved Configurations ({configs.length})</h3>
          <div className="space-y-2">
            {configs.map((config) => (
              <div
                key={config.id}
                className="p-3 bg-zinc-900 rounded flex justify-between items-start gap-2"
                data-testid={`config-${config.sportSlug}-${config.marketType}`}
              >
                <div className="text-sm min-w-0 flex-1">
                  <div className="font-medium text-white">
                    {config.sportLabel} - {config.marketType.replace(/_/g, " ")}
                  </div>
                  <div className="text-zinc-500 text-xs space-y-0.5">
                    <div>Title: {config.titleField} | Buttons: {config.buttonLabelField}</div>
                    <div className="flex flex-wrap gap-1">
                      {config.showLine && <span className="text-wild-trade">Shows line</span>}
                      {config.useQuestionForTitle && <span className="text-wild-brand">Uses question</span>}
                      {config.outcomeStrategy && (
                        <span className="text-wild-scout">Strategy: {(config.outcomeStrategy as { type: string }).type}</span>
                      )}
                    </div>
                    {config.notes && <div className="text-zinc-600 italic truncate">{config.notes}</div>}
                  </div>
                </div>
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={() => deleteConfigMutation.mutate({ 
                    sportSlug: config.sportSlug, 
                    marketType: config.marketType 
                  })}
                  disabled={deleteConfigMutation.isPending}
                  data-testid={`delete-config-${config.sportSlug}-${config.marketType}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
