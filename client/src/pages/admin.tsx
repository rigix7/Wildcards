import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Plus, Trash2, RefreshCw, Check, X, Link2, Loader2 } from "lucide-react";
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
import { fetchPolymarketSports, type PolymarketSport, type GammaTag } from "@/lib/polymarket";
import type { Market, Player, InsertMarket, InsertPlayer, AdminSettings, Futures } from "@shared/schema";

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
  const [activeSection, setActiveSection] = useState<"matchday" | "futures" | "players">("matchday");
  const [sportsLeagues, setSportsLeagues] = useState<PolymarketSport[]>([]);
  const [loadingLeagues, setLoadingLeagues] = useState(false);
  const [showPlayerForm, setShowPlayerForm] = useState(false);
  const [futuresSlug, setFuturesSlug] = useState("");
  const [fetchingEvent, setFetchingEvent] = useState(false);

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
      const sports = await fetchPolymarketSports();
      setSportsLeagues(sports);
    } catch (error) {
      toast({ title: "Failed to load sports leagues", variant: "destructive" });
    } finally {
      setLoadingLeagues(false);
    }
  };

  useEffect(() => {
    if (activeSection === "matchday" && sportsLeagues.length === 0) {
      loadSportsLeagues();
    }
  }, [activeSection]);

  const handleLeagueToggle = (sportTags: string, checked: boolean) => {
    const currentTags = adminSettings?.activeTagIds || [];
    const tagIds = sportTags.split(",").map(t => t.trim()).filter(Boolean);
    
    if (checked) {
      const combined = [...currentTags, ...tagIds];
      const newTags = Array.from(new Set(combined));
      updateSettingsMutation.mutate({ activeTagIds: newTags });
    } else {
      const newTags = currentTags.filter(id => !tagIds.includes(id));
      updateSettingsMutation.mutate({ activeTagIds: newTags });
    }
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
              
              outcomes.forEach((label: string, i: number) => {
                const prob = parseFloat(prices[i] || "0");
                if (label.toLowerCase() === "yes" || markets.length === 1) {
                  const displayLabel = markets.length > 1 ? market.question?.replace(/^Will /i, "").replace(/\?$/, "") || label : label;
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
        </div>

        {activeSection === "matchday" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center gap-2 flex-wrap">
              <div>
                <h2 className="text-lg font-bold">Match Day - Sports Leagues</h2>
                <p className="text-sm text-zinc-500">
                  Select sports leagues to auto-populate upcoming games in the Predict tab
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
              <div className="text-zinc-500">Loading sports leagues from Polymarket...</div>
            ) : sportsLeagues.length === 0 ? (
              <Card className="p-8 text-center text-zinc-500">
                No sports leagues found. Click "Refresh" to load from Polymarket.
              </Card>
            ) : (
              <div className="grid gap-2">
                {sportsLeagues.map((sport) => {
                  const sportTagIds = (sport.tags || "").split(",").map(t => t.trim()).filter(Boolean);
                  const isActive = sportTagIds.some(id => adminSettings?.activeTagIds?.includes(id));
                  return (
                    <Card
                      key={sport.id}
                      className={`p-4 flex justify-between items-center cursor-pointer transition-colors ${
                        isActive ? "border-wild-brand/50 bg-wild-brand/5" : ""
                      }`}
                      onClick={() => handleLeagueToggle(sport.tags || "", !isActive)}
                      data-testid={`sport-${sport.slug}`}
                    >
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={isActive}
                          onCheckedChange={(checked) => handleLeagueToggle(sport.tags || "", checked as boolean)}
                          data-testid={`checkbox-sport-${sport.slug}`}
                        />
                        <div>
                          <div className="font-bold text-white">{sport.label}</div>
                          <div className="text-sm text-zinc-400">
                            {sport.slug}
                          </div>
                        </div>
                      </div>
                      {isActive && (
                        <Check className="w-5 h-5 text-wild-brand" />
                      )}
                    </Card>
                  );
                })}
              </div>
            )}

            {(adminSettings?.activeTagIds?.length || 0) > 0 && (
              <div className="mt-4 p-4 bg-zinc-900 rounded-md">
                <div className="text-sm text-zinc-400 mb-2">
                  Active Leagues - Games will auto-populate:
                </div>
                <div className="flex flex-wrap gap-2">
                  {sportsLeagues
                    .filter(sport => {
                      const tagIds = (sport.tags || "").split(",").map(t => t.trim());
                      return tagIds.some(id => adminSettings?.activeTagIds?.includes(id));
                    })
                    .map(sport => (
                      <span key={sport.id} className="px-2 py-1 bg-wild-brand/20 text-wild-brand rounded text-sm">
                        {sport.label}
                      </span>
                    ))
                  }
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
      </div>
    </div>
  );
}
