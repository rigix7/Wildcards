import type { Express } from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import { storage } from "./storage";
import { insertMarketSchema, insertPlayerSchema, insertBetSchema, insertTradeSchema, insertFuturesSchema, insertSportFieldConfigSchema, insertSportMarketConfigSchema } from "@shared/schema";
import { buildHmacSignature, type BuilderApiKeyCreds } from "@polymarket/builder-signing-sdk";

// Polymarket Builder credentials (server-side only)
const BUILDER_CREDENTIALS: BuilderApiKeyCreds = {
  key: process.env.POLYMARKET_BUILDER_API_KEY || "",
  secret: process.env.POLYMARKET_BUILDER_SECRET || "",
  passphrase: process.env.POLYMARKET_BUILDER_PASSPHRASE || "",
};

const GAMMA_API_BASE = "https://gamma-api.polymarket.com";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Health check endpoint for deployment
  app.get("/api/health", (req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Seed initial data on startup
  await storage.seedInitialData();

  app.get("/api/markets", async (req, res) => {
    try {
      const markets = await storage.getMarkets();
      res.json(markets);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch markets" });
    }
  });

  app.get("/api/markets/:id", async (req, res) => {
    try {
      const market = await storage.getMarket(req.params.id);
      if (!market) {
        return res.status(404).json({ error: "Market not found" });
      }
      res.json(market);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch market" });
    }
  });

  app.post("/api/markets", async (req, res) => {
    try {
      const parsed = insertMarketSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      const market = await storage.createMarket(parsed.data);
      res.status(201).json(market);
    } catch (error) {
      res.status(500).json({ error: "Failed to create market" });
    }
  });

  app.delete("/api/markets/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteMarket(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Market not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete market" });
    }
  });

  app.get("/api/players", async (req, res) => {
    try {
      const players = await storage.getPlayers();
      res.json(players);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch players" });
    }
  });

  app.get("/api/players/:id", async (req, res) => {
    try {
      const player = await storage.getPlayer(req.params.id);
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }
      res.json(player);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch player" });
    }
  });

  app.post("/api/players", async (req, res) => {
    try {
      const parsed = insertPlayerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      const player = await storage.createPlayer(parsed.data);
      res.status(201).json(player);
    } catch (error) {
      res.status(500).json({ error: "Failed to create player" });
    }
  });

  app.post("/api/players/fund", async (req, res) => {
    try {
      const { playerId, amount } = req.body;
      if (!playerId || !amount) {
        return res.status(400).json({ error: "playerId and amount required" });
      }

      const player = await storage.getPlayer(playerId);
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      const wallet = await storage.getWallet();
      if (wallet.wildBalance < amount) {
        return res.status(400).json({ error: "Insufficient WILD balance" });
      }

      const newFunding = player.fundingCurrent + amount;
      const newPercentage = Math.min(100, Math.round((newFunding / player.fundingTarget) * 100));
      const newStatus = newPercentage >= 100 ? "available" : player.status;

      const updatedStats = newStatus === "available" ? {
        holders: (player.stats?.holders || 0) + Math.floor(Math.random() * 50) + 10,
        marketCap: newFunding,
        change24h: player.stats?.change24h || 0,
      } : (player.stats || { holders: 0, marketCap: 0, change24h: 0 });

      const updated = await storage.updatePlayer(playerId, {
        fundingCurrent: newFunding,
        fundingPercentage: newPercentage,
        status: newStatus as "offering" | "available" | "closed",
        stats: updatedStats,
      });

      const newWildBalance = wallet.wildBalance - amount;
      await storage.updateWallet({
        wildBalance: newWildBalance,
        totalValue: wallet.usdcBalance + newWildBalance,
      });

      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to fund player" });
    }
  });

  app.delete("/api/players/:id", async (req, res) => {
    try {
      const deleted = await storage.deletePlayer(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Player not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete player" });
    }
  });

  app.get("/api/bets", async (req, res) => {
    try {
      const bets = await storage.getBets();
      res.json(bets);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch bets" });
    }
  });

  app.post("/api/bets", async (req, res) => {
    try {
      const { marketId, outcomeId, amount, odds, walletAddress } = req.body;
      if (!marketId || !outcomeId || !amount || !odds) {
        return res.status(400).json({ error: "marketId, outcomeId, amount, and odds required" });
      }

      // Record bet locally
      const bet = await storage.createBet({
        marketId,
        outcomeId,
        amount,
        odds,
        potentialPayout: amount * odds,
        walletAddress: walletAddress || undefined,
      });

      // Award WILD points: 1 WILD per $1 bet
      if (walletAddress) {
        await storage.addWildPoints(walletAddress, amount);
      }

      res.status(201).json(bet);
    } catch (error) {
      res.status(500).json({ error: "Failed to create bet" });
    }
  });

  app.get("/api/trades", async (req, res) => {
    try {
      const trades = await storage.getTrades();
      res.json(trades);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch trades" });
    }
  });

  app.post("/api/trades", async (req, res) => {
    try {
      const { playerId, type, amount } = req.body;
      if (!playerId || !type || !amount) {
        return res.status(400).json({ error: "playerId, type, and amount required" });
      }

      const player = await storage.getPlayer(playerId);
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      const marketCap = player.stats?.marketCap || 10000;
      const price = marketCap / 1000;
      const total = price * (amount / 100);

      const wallet = await storage.getWallet();
      if (type === "buy" && wallet.usdcBalance < total) {
        return res.status(400).json({ error: "Insufficient USDC balance" });
      }

      const trade = await storage.createTrade({
        playerId,
        playerName: player.name,
        playerSymbol: player.symbol,
        type,
        amount,
        price,
        total,
      });
      res.status(201).json(trade);
    } catch (error) {
      res.status(500).json({ error: "Failed to create trade" });
    }
  });

  app.get("/api/wallet", async (req, res) => {
    try {
      const wallet = await storage.getWallet();
      res.json(wallet);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch wallet" });
    }
  });

  // Get wallet record (WILD points) by address
  // Uses calculated WILD points from order history as source of truth
  app.get("/api/wallet/:address", async (req, res) => {
    try {
      const { address } = req.params;
      if (!address) {
        return res.status(400).json({ error: "Address required" });
      }
      const record = await storage.getOrCreateWalletRecord(address);
      
      // Calculate WILD points from order history (more reliable than stored value)
      const calculatedWildPoints = await storage.getCalculatedWildPoints(address);
      
      // Return record with calculated WILD points as source of truth
      res.json({
        ...record,
        wildPoints: calculatedWildPoints,
        storedWildPoints: record.wildPoints, // Keep stored value for debugging
      });
    } catch (error) {
      console.error("Failed to fetch wallet record:", error);
      res.status(500).json({ error: "Failed to fetch wallet record" });
    }
  });

  // Update Safe deployment status for wallet
  app.post("/api/wallet/:address/safe", async (req, res) => {
    try {
      const { address } = req.params;
      const { safeAddress, isSafeDeployed } = req.body;
      
      // Validate inputs
      if (!address || typeof address !== "string" || !address.startsWith("0x")) {
        return res.status(400).json({ error: "Valid EOA address required" });
      }
      if (!safeAddress || typeof safeAddress !== "string" || !safeAddress.startsWith("0x")) {
        return res.status(400).json({ error: "Valid Safe address required" });
      }
      
      const normalizedAddress = address.toLowerCase();
      const normalizedSafeAddress = safeAddress.toLowerCase();
      const deployed = typeof isSafeDeployed === "boolean" ? isSafeDeployed : true;
      
      const record = await storage.updateWalletSafeStatus(normalizedAddress, normalizedSafeAddress, deployed);
      res.json(record);
    } catch (error) {
      console.error("Failed to update Safe status:", error);
      res.status(500).json({ error: "Failed to update Safe status" });
    }
  });

  // Polymarket relayer proxy - server handles all credential management
  // Client sends request details, server makes authenticated call to Polymarket
  app.post("/api/polymarket/relay", async (req, res) => {
    try {
      const { method, path, body } = req.body;
      const httpMethod = (method || "POST").toUpperCase();
      
      if (!BUILDER_CREDENTIALS.key || !BUILDER_CREDENTIALS.secret) {
        console.log("Builder credentials check - key:", !!BUILDER_CREDENTIALS.key, "secret:", !!BUILDER_CREDENTIALS.secret);
        return res.status(500).json({ error: "Builder credentials not configured" });
      }
      
      const timestamp = Date.now();
      const bodyString = (httpMethod === "GET" || !body) ? "" : JSON.stringify(body);
      const signature = buildHmacSignature(
        BUILDER_CREDENTIALS.secret,
        timestamp,
        httpMethod,
        path || "/",
        bodyString
      );
      
      // Make the actual call to Polymarket relayer from server
      const relayerUrl = `https://relayer-v2.polymarket.com${path}`;
      console.log(`Relay request: ${httpMethod} ${relayerUrl}`);
      
      const fetchOptions: RequestInit = {
        method: httpMethod,
        headers: {
          "Content-Type": "application/json",
          "POLY_BUILDER_SIGNATURE": signature,
          "POLY_BUILDER_TIMESTAMP": timestamp.toString(),
          "POLY_BUILDER_API_KEY": BUILDER_CREDENTIALS.key,
          "POLY_BUILDER_PASSPHRASE": BUILDER_CREDENTIALS.passphrase,
        },
      };
      
      // Only include body for non-GET requests
      if (httpMethod !== "GET" && bodyString) {
        fetchOptions.body = bodyString;
      }
      
      const relayerResponse = await fetch(relayerUrl, fetchOptions);
      const text = await relayerResponse.text();
      
      console.log(`Relay response: ${relayerResponse.status} - ${text.substring(0, 200)}`);
      
      // Try to parse as JSON, otherwise return raw text as error
      try {
        const data = text ? JSON.parse(text) : {};
        res.status(relayerResponse.status).json(data);
      } catch {
        // Response is not JSON (likely HTML error page)
        res.status(relayerResponse.status).json({ 
          error: "Polymarket API error", 
          status: relayerResponse.status,
          message: text.substring(0, 500) 
        });
      }
    } catch (error) {
      console.error("Relay error:", error);
      res.status(500).json({ error: "Failed to relay request" });
    }
  });

  // Builder signing endpoint - for RelayClient remote signing
  // Returns HMAC signature and headers for builder authentication
  app.post("/api/polymarket/sign", async (req, res) => {
    try {
      const { method, path, body } = req.body;

      if (!BUILDER_CREDENTIALS.key || !BUILDER_CREDENTIALS.secret || !BUILDER_CREDENTIALS.passphrase) {
        return res.status(500).json({ error: "Builder credentials not configured" });
      }

      if (!method || !path) {
        return res.status(400).json({ error: "Missing required parameters: method, path" });
      }

      const sigTimestamp = Date.now().toString();
      const bodyString = typeof body === "string" ? body : (body ? JSON.stringify(body) : "");

      const signature = buildHmacSignature(
        BUILDER_CREDENTIALS.secret,
        parseInt(sigTimestamp),
        method,
        path,
        bodyString
      );

      res.json({
        POLY_BUILDER_SIGNATURE: signature,
        POLY_BUILDER_TIMESTAMP: sigTimestamp,
        POLY_BUILDER_API_KEY: BUILDER_CREDENTIALS.key,
        POLY_BUILDER_PASSPHRASE: BUILDER_CREDENTIALS.passphrase,
      });
    } catch (error) {
      console.error("Signing error:", error);
      res.status(500).json({ error: "Failed to sign message" });
    }
  });

  // Check if builder credentials are configured (no sensitive data exposed)
  app.get("/api/polymarket/status", async (req, res) => {
    res.json({
      builderConfigured: !!(BUILDER_CREDENTIALS.key && BUILDER_CREDENTIALS.secret),
      relayerUrl: "https://relayer-v2.polymarket.com",
    });
  });

  // Fetch sports leagues from Polymarket /sports endpoint
  app.get("/api/polymarket/sports", async (req, res) => {
    try {
      const response = await fetch(`${GAMMA_API_BASE}/sports`);
      if (!response.ok) {
        throw new Error(`Gamma API error: ${response.status}`);
      }
      const sports = await response.json();
      res.json(sports);
    } catch (error) {
      console.error("Error fetching Polymarket sports:", error);
      res.status(500).json({ error: "Failed to fetch sports" });
    }
  });

  // Fetch teams from Gamma API for team name → abbreviation lookup
  // Used to accurately match team names in questions to outcome labels
  app.get("/api/polymarket/teams", async (req, res) => {
    try {
      const { league } = req.query;
      let url = `${GAMMA_API_BASE}/teams?limit=500`;
      if (league) {
        url += `&league=${league}`;
      }
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Gamma API error: ${response.status}`);
      }
      const teams = await response.json();
      res.json(teams);
    } catch (error) {
      console.error("Error fetching Polymarket teams:", error);
      res.status(500).json({ error: "Failed to fetch teams" });
    }
  });

  // Fetch sports with hierarchical market types for granular selection
  // Returns sports with nested market type options fetched dynamically from each league's events
  app.get("/api/polymarket/tags", async (req, res) => {
    try {
      const response = await fetch(`${GAMMA_API_BASE}/sports`);
      if (!response.ok) {
        throw new Error(`Gamma API error: ${response.status}`);
      }
      const sports = await response.json();
      
      // Sport labels for display
      const sportLabels: Record<string, string> = {
        nba: "NBA Basketball",
        nfl: "NFL Football",
        mlb: "MLB Baseball",
        nhl: "NHL Hockey",
        mls: "MLS Soccer",
        epl: "Premier League",
        lal: "La Liga",
        bun: "Bundesliga",
        sea: "Serie A",
        fl1: "Ligue 1",
        ucl: "Champions League",
        uel: "Europa League",
        wnba: "WNBA",
        ncaab: "NCAA Basketball",
        ncaaf: "NCAA Football",
        cbb: "College Basketball",
        cfb: "College Football",
        mma: "UFC/MMA",
        atp: "ATP Tennis",
        wta: "WTA Tennis",
        ipl: "IPL Cricket",
        acn: "Africa Cup of Nations",
        f1: "Formula 1",
        nascar: "NASCAR",
        golf: "Golf",
        boxing: "Boxing",
        "cs2": "Counter-Strike 2",
        lol: "League of Legends",
        dota2: "Dota 2",
        val: "Valorant",
      };
      
      // Available market types with human-readable labels
      const marketTypeLabels: Record<string, string> = {
        moneyline: "Moneyline (Winner)",
        spreads: "Spreads",
        totals: "Totals (Over/Under)",
        first_half_moneyline: "1st Half Moneyline",
        first_half_spreads: "1st Half Spreads",
        first_half_totals: "1st Half Totals",
        points: "Player Points",
        rebounds: "Player Rebounds",
        assists: "Player Assists",
        threes: "Player 3-Pointers",
        steals: "Player Steals",
        blocks: "Player Blocks",
        passing_yards: "Passing Yards",
        rushing_yards: "Rushing Yards",
        receiving_yards: "Receiving Yards",
        touchdowns: "Touchdowns",
        strikeouts: "Pitcher Strikeouts",
        hits: "Player Hits",
        home_runs: "Home Runs",
        goals: "Goals",
        shots: "Shots",
        saves: "Saves",
      };
      
      interface RawSport {
        id: number;
        sport: string;
        tags?: string;
        series?: string;
        image?: string;
      }
      
      interface RawMarket {
        sportsMarketType?: string;
        question?: string;
      }
      
      interface RawEvent {
        markets?: RawMarket[];
      }
      
      // Fetch actual market types from each sport's events
      const categorizedSports = await Promise.all(sports.map(async (sport: RawSport) => {
        const seriesId = sport.series || String(sport.id);
        const foundMarketTypes = new Set<string>();
        
        try {
          const eventsUrl = `${GAMMA_API_BASE}/events?series_id=${seriesId}&active=true&closed=false&limit=500`;
          const eventsResponse = await fetch(eventsUrl);
          
          if (eventsResponse.ok) {
            const events: RawEvent[] = await eventsResponse.json();
            
            // Extract unique sportsMarketType values from all markets
            for (const event of events) {
              if (event.markets) {
                for (const market of event.markets) {
                  if (market.sportsMarketType) {
                    foundMarketTypes.add(market.sportsMarketType);
                  }
                }
              }
            }
          }
        } catch (err) {
          console.error(`Error fetching events for sport ${sport.sport}:`, err);
        }
        
        // If no market types found from events, provide defaults based on sport type
        if (foundMarketTypes.size === 0) {
          foundMarketTypes.add("moneyline");
        }
        
        // Convert found market types to structured options
        const marketTypes = Array.from(foundMarketTypes).map(mt => ({
          id: `${seriesId}_${mt}`,
          type: mt,
          label: marketTypeLabels[mt] || mt.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
        }));
        
        return {
          id: `series_${seriesId}`,
          slug: sport.sport,
          label: sportLabels[sport.sport] || sport.sport.toUpperCase(),
          sport: sport.sport.toUpperCase(),
          seriesId,
          image: sport.image,
          marketTypes,
        };
      }));
      
      res.json(categorizedSports);
    } catch (error) {
      console.error("Error fetching sports tags:", error);
      res.status(500).json({ error: "Failed to fetch tags" });
    }
  });

  app.get("/api/polymarket/events", async (req, res) => {
    try {
      const tagId = req.query.tag_id as string;
      const seriesId = req.query.series_id as string;
      const tagSlug = req.query.tag as string;
      
      if (!tagId && !seriesId && !tagSlug) {
        return res.status(400).json({ error: "tag_id, series_id, or tag required" });
      }
      
      // Prefer series_id for more specific results (actual game matches)
      // Fetch 500 events to ensure we capture all games including live ones - Polymarket API returns events in non-chronological order
      let url = `${GAMMA_API_BASE}/events?active=true&closed=false&limit=500`;
      if (seriesId) {
        url += `&series_id=${seriesId}`;
      } else if (tagSlug) {
        url += `&tag=${tagSlug}`;
      } else if (tagId) {
        url += `&tag_id=${tagId}`;
      }
      
      console.log(`[Gamma API] Fetching events: ${url}`);
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Gamma API error: ${response.status}`);
      }
      
      const events = await response.json();
      
      // Debug logging for NBA events (series_id 10345)
      if (seriesId === "10345") {
        console.log(`[NBA Debug] Received ${events.length} events from Gamma API`);
        events.slice(0, 3).forEach((event: any, idx: number) => {
          const market = event.markets?.[0];
          console.log(`[NBA Debug] Event ${idx}: "${event.title?.substring(0, 50)}..." startDate=${event.startDate} gameStartTime=${market?.gameStartTime || 'N/A'}`);
        });
      }
      
      res.json(events);
    } catch (error) {
      console.error("Error fetching Gamma events:", error);
      res.status(500).json({ error: "Failed to fetch events" });
    }
  });

  app.get("/api/admin/settings", async (req, res) => {
    try {
      const settings = await storage.getAdminSettings();
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch admin settings" });
    }
  });

  app.patch("/api/admin/settings", async (req, res) => {
    try {
      const partialSchema = z.object({
        demoMode: z.boolean().optional(),
        mockDataEnabled: z.boolean().optional(),
        activeTagIds: z.array(z.string()).optional(),
      });
      
      const parsed = partialSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid settings data" });
      }
      
      const settings = await storage.updateAdminSettings(parsed.data);
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: "Failed to update admin settings" });
    }
  });

  // Sport Field Config endpoints for admin UI
  app.get("/api/admin/sport-configs", async (req, res) => {
    try {
      const configs = await storage.getSportFieldConfigs();
      res.json(configs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch sport configs" });
    }
  });

  app.get("/api/admin/sport-configs/:sportSlug", async (req, res) => {
    try {
      const config = await storage.getSportFieldConfig(req.params.sportSlug);
      if (!config) {
        return res.status(404).json({ error: "Sport config not found" });
      }
      res.json(config);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch sport config" });
    }
  });

  app.post("/api/admin/sport-configs", async (req, res) => {
    try {
      const parsed = insertSportFieldConfigSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      const config = await storage.createOrUpdateSportFieldConfig(parsed.data);
      res.status(201).json(config);
    } catch (error) {
      res.status(500).json({ error: "Failed to create sport config" });
    }
  });

  app.put("/api/admin/sport-configs/:sportSlug", async (req, res) => {
    try {
      const data = { ...req.body, sportSlug: req.params.sportSlug };
      const parsed = insertSportFieldConfigSchema.safeParse(data);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      const config = await storage.createOrUpdateSportFieldConfig(parsed.data);
      res.json(config);
    } catch (error) {
      res.status(500).json({ error: "Failed to update sport config" });
    }
  });

  app.delete("/api/admin/sport-configs/:sportSlug", async (req, res) => {
    try {
      const deleted = await storage.deleteSportFieldConfig(req.params.sportSlug);
      if (!deleted) {
        return res.status(404).json({ error: "Sport config not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete sport config" });
    }
  });

  // Fetch sample market data for a sport (for admin preview)
  app.get("/api/admin/sport-sample/:seriesId", async (req, res) => {
    try {
      const { seriesId } = req.params;
      const url = `${GAMMA_API_BASE}/events?active=true&closed=false&limit=1&series_id=${seriesId}`;
      console.log(`[Sample Data] Fetching: ${url}`);
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Gamma API error: ${response.status}`);
      }
      
      const events = await response.json();
      if (!events || events.length === 0) {
        return res.json({ sample: null, message: "No active events found for this sport" });
      }
      
      // Return first event with its markets as sample data
      const event = events[0];
      const sampleMarket = event.markets?.[0] || null;
      
      res.json({
        event: {
          id: event.id,
          title: event.title,
          description: event.description,
          startDate: event.startDate,
          gameStartTime: sampleMarket?.gameStartTime,
        },
        market: sampleMarket ? {
          id: sampleMarket.id,
          question: sampleMarket.question,
          groupItemTitle: sampleMarket.groupItemTitle,
          sportsMarketType: sampleMarket.sportsMarketType,
          line: sampleMarket.line,
          outcomes: sampleMarket.outcomes,
          outcomePrices: sampleMarket.outcomePrices,
          bestAsk: sampleMarket.bestAsk,
          bestBid: sampleMarket.bestBid,
        } : null,
        allMarketTypes: event.markets?.map((m: any) => m.sportsMarketType).filter(Boolean) || [],
      });
    } catch (error) {
      console.error("Error fetching sample data:", error);
      res.status(500).json({ error: "Failed to fetch sample data" });
    }
  });

  // Enhanced sample endpoint that returns full market data for a specific market type
  app.get("/api/admin/sport-sample/:seriesId/:marketType", async (req, res) => {
    try {
      const { seriesId, marketType } = req.params;
      const url = `${GAMMA_API_BASE}/events?active=true&closed=false&limit=5&series_id=${seriesId}`;
      console.log(`[Sample Data] Fetching for marketType ${marketType}: ${url}`);
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Gamma API error: ${response.status}`);
      }
      
      const events = await response.json();
      if (!events || events.length === 0) {
        return res.json({ sample: null, message: "No active events found for this sport" });
      }
      
      // Find a market matching the requested market type
      let matchingMarket = null;
      let matchingEvent = null;
      
      for (const event of events) {
        const market = event.markets?.find((m: any) => m.sportsMarketType === marketType);
        if (market) {
          matchingMarket = market;
          matchingEvent = event;
          break;
        }
      }
      
      if (!matchingMarket) {
        // Return first event with all available market types
        const event = events[0];
        return res.json({
          sample: null,
          message: `No markets found with type "${marketType}"`,
          availableMarketTypes: event.markets?.map((m: any) => m.sportsMarketType).filter(Boolean) || [],
        });
      }
      
      // Return full market data for configuration
      res.json({
        event: {
          id: matchingEvent.id,
          title: matchingEvent.title,
          slug: matchingEvent.slug,
          description: matchingEvent.description,
          startDate: matchingEvent.startDate,
          seriesSlug: matchingEvent.seriesSlug,
        },
        market: {
          id: matchingMarket.id,
          conditionId: matchingMarket.conditionId,
          slug: matchingMarket.slug,
          question: matchingMarket.question,
          groupItemTitle: matchingMarket.groupItemTitle,
          sportsMarketType: matchingMarket.sportsMarketType,
          subtitle: matchingMarket.subtitle,
          extraInfo: matchingMarket.extraInfo,
          line: matchingMarket.line,
          outcomes: matchingMarket.outcomes,
          outcomePrices: matchingMarket.outcomePrices,
          bestAsk: matchingMarket.bestAsk,
          bestBid: matchingMarket.bestBid,
          volume: matchingMarket.volume,
          liquidity: matchingMarket.liquidity,
          gameStartTime: matchingMarket.gameStartTime,
          tokens: matchingMarket.tokens,
          spread: matchingMarket.spread,
          active: matchingMarket.active,
          closed: matchingMarket.closed,
        },
        allMarketTypes: events.flatMap((e: any) => 
          e.markets?.map((m: any) => m.sportsMarketType).filter(Boolean) || []
        ).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i),
      });
    } catch (error) {
      console.error("Error fetching sample data:", error);
      res.status(500).json({ error: "Failed to fetch sample data" });
    }
  });

  // Comprehensive market type discovery - fetches more events to find ALL available market types
  app.get("/api/admin/sport-market-types/:seriesId", async (req, res) => {
    try {
      const { seriesId } = req.params;
      const foundMarketTypes = new Map<string, { count: number; sampleQuestion: string }>();
      
      // Fetch more events (up to 500) to discover all market types
      const url = `${GAMMA_API_BASE}/events?series_id=${seriesId}&active=true&closed=false&limit=500`;
      console.log(`[Market Types Discovery] Fetching: ${url}`);
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Gamma API error: ${response.status}`);
      }
      
      const events = await response.json();
      
      // Extract all unique market types with sample questions
      for (const event of events) {
        if (event.markets) {
          for (const market of event.markets) {
            if (market.sportsMarketType) {
              const existing = foundMarketTypes.get(market.sportsMarketType);
              if (existing) {
                existing.count++;
              } else {
                foundMarketTypes.set(market.sportsMarketType, {
                  count: 1,
                  sampleQuestion: market.question || market.groupItemTitle || "",
                });
              }
            }
          }
        }
      }
      
      // Market type labels
      const marketTypeLabels: Record<string, string> = {
        moneyline: "Moneyline (Winner)",
        spreads: "Spreads",
        totals: "Totals (Over/Under)",
        first_half_moneyline: "1st Half Moneyline",
        first_half_spreads: "1st Half Spreads",
        first_half_totals: "1st Half Totals",
        points: "Player Points",
        rebounds: "Player Rebounds",
        assists: "Player Assists",
        threes: "Player 3-Pointers",
        steals: "Player Steals",
        blocks: "Player Blocks",
        passing_yards: "Passing Yards",
        rushing_yards: "Rushing Yards",
        receiving_yards: "Receiving Yards",
        touchdowns: "Touchdowns",
        strikeouts: "Pitcher Strikeouts",
        hits: "Player Hits",
        home_runs: "Home Runs",
        goals: "Goals",
        shots: "Shots",
        saves: "Saves",
        both_teams_to_score: "Both Teams To Score",
        map_handicap: "Map Handicap",
        map_participant_win_total: "Map Participant Win Total",
        child_moneyline: "Child Moneyline",
        tennis_first_set_winner: "Tennis First Set Winner",
        tennis_match_totals: "Tennis Match Totals",
        tennis_first_set_totals: "Tennis First Set Totals",
        tennis_set_totals: "Tennis Set Totals",
        tennis_set_handicap: "Tennis Set Handicap",
        round_over_under_match: "Round Over/Under Match",
        round_handicap_match: "Round Handicap Match",
        kill_handicap_match: "Kill Handicap Match",
        tower_handicap_match: "Tower Handicap Match",
        cricket_toss_winner: "Cricket Toss Winner",
        cricket_completed_match: "Cricket Completed Match",
        cricket_team_top_batter: "Cricket Team Top Batter",
        cricket_most_sixes: "Cricket Most Sixes",
      };
      
      // Convert to sorted array (by count, descending)
      const marketTypes = Array.from(foundMarketTypes.entries())
        .map(([type, data]) => ({
          type,
          label: marketTypeLabels[type] || type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
          count: data.count,
          sampleQuestion: data.sampleQuestion,
        }))
        .sort((a, b) => b.count - a.count);
      
      res.json({
        seriesId,
        eventsScanned: events.length,
        marketTypes,
      });
    } catch (error) {
      console.error("Error discovering market types:", error);
      res.status(500).json({ error: "Failed to discover market types" });
    }
  });

  // Enhanced sample endpoint that searches more thoroughly
  app.get("/api/admin/sport-sample-v2/:seriesId/:marketType", async (req, res) => {
    try {
      const { seriesId, marketType } = req.params;
      
      // Fetch more events (up to 500) to find a matching market
      const url = `${GAMMA_API_BASE}/events?active=true&closed=false&limit=500&series_id=${seriesId}`;
      console.log(`[Sample Data V2] Fetching for marketType ${marketType}: ${url}`);
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Gamma API error: ${response.status}`);
      }
      
      const events = await response.json();
      if (!events || events.length === 0) {
        return res.json({ sample: null, message: "No active events found for this sport" });
      }
      
      // Find a market matching the requested market type, preferring ones with higher liquidity
      let matchingMarket = null;
      let matchingEvent = null;
      let bestLiquidity = 0;
      
      for (const event of events) {
        if (event.markets) {
          for (const market of event.markets) {
            if (market.sportsMarketType === marketType) {
              const liquidity = parseFloat(market.liquidity) || 0;
              if (!matchingMarket || liquidity > bestLiquidity) {
                matchingMarket = market;
                matchingEvent = event;
                bestLiquidity = liquidity;
              }
            }
          }
        }
      }
      
      // Collect all available market types across all events
      const allMarketTypes = new Set<string>();
      for (const event of events) {
        if (event.markets) {
          for (const market of event.markets) {
            if (market.sportsMarketType) {
              allMarketTypes.add(market.sportsMarketType);
            }
          }
        }
      }
      
      if (!matchingMarket) {
        return res.json({
          sample: null,
          message: `No markets found with type "${marketType}" in ${events.length} events`,
          availableMarketTypes: Array.from(allMarketTypes),
        });
      }
      
      // Return comprehensive market data for configuration
      res.json({
        event: {
          id: matchingEvent.id,
          title: matchingEvent.title,
          slug: matchingEvent.slug,
          description: matchingEvent.description,
          startDate: matchingEvent.startDate,
          endDate: matchingEvent.endDate,
          seriesSlug: matchingEvent.seriesSlug,
        },
        market: {
          id: matchingMarket.id,
          conditionId: matchingMarket.conditionId,
          slug: matchingMarket.slug,
          question: matchingMarket.question,
          groupItemTitle: matchingMarket.groupItemTitle,
          sportsMarketType: matchingMarket.sportsMarketType,
          subtitle: matchingMarket.subtitle,
          extraInfo: matchingMarket.extraInfo,
          participantName: matchingMarket.participantName,
          teamAbbrev: matchingMarket.teamAbbrev,
          line: matchingMarket.line,
          outcomes: matchingMarket.outcomes,
          outcomePrices: matchingMarket.outcomePrices,
          bestAsk: matchingMarket.bestAsk,
          bestBid: matchingMarket.bestBid,
          volume: matchingMarket.volume,
          liquidity: matchingMarket.liquidity,
          gameStartTime: matchingMarket.gameStartTime,
          tokens: matchingMarket.tokens,
          spread: matchingMarket.spread,
          active: matchingMarket.active,
          closed: matchingMarket.closed,
          clobTokenIds: matchingMarket.clobTokenIds,
        },
        // Include full raw market for debugging/exploration
        rawMarket: matchingMarket,
        availableMarketTypes: Array.from(allMarketTypes),
        eventsSearched: events.length,
      });
    } catch (error) {
      console.error("Error fetching sample data v2:", error);
      res.status(500).json({ error: "Failed to fetch sample data" });
    }
  });

  // Sport Market Config endpoints (sport + marketType composite key)
  app.get("/api/admin/sport-market-configs", async (req, res) => {
    try {
      const configs = await storage.getSportMarketConfigs();
      res.json(configs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch sport market configs" });
    }
  });

  app.get("/api/admin/sport-market-configs/:sportSlug", async (req, res) => {
    try {
      const configs = await storage.getSportMarketConfigsBySport(req.params.sportSlug);
      res.json(configs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch sport market configs" });
    }
  });

  app.get("/api/admin/sport-market-configs/:sportSlug/:marketType", async (req, res) => {
    try {
      const config = await storage.getSportMarketConfig(req.params.sportSlug, req.params.marketType);
      if (!config) {
        return res.status(404).json({ error: "Config not found" });
      }
      res.json(config);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch sport market config" });
    }
  });

  app.post("/api/admin/sport-market-configs", async (req, res) => {
    try {
      const parsed = insertSportMarketConfigSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      const config = await storage.createOrUpdateSportMarketConfig(parsed.data);
      res.status(201).json(config);
    } catch (error) {
      res.status(500).json({ error: "Failed to create sport market config" });
    }
  });

  app.put("/api/admin/sport-market-configs/:sportSlug/:marketType", async (req, res) => {
    try {
      const data = { 
        ...req.body, 
        sportSlug: req.params.sportSlug,
        marketType: req.params.marketType,
      };
      const parsed = insertSportMarketConfigSchema.safeParse(data);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      const config = await storage.createOrUpdateSportMarketConfig(parsed.data);
      res.json(config);
    } catch (error) {
      res.status(500).json({ error: "Failed to update sport market config" });
    }
  });

  app.delete("/api/admin/sport-market-configs/:sportSlug/:marketType", async (req, res) => {
    try {
      const deleted = await storage.deleteSportMarketConfig(req.params.sportSlug, req.params.marketType);
      if (!deleted) {
        return res.status(404).json({ error: "Config not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete sport market config" });
    }
  });

  // ============================================================
  // $WILD POINTS MANAGEMENT
  // ============================================================

  app.get("/api/admin/wild-points", async (req, res) => {
    try {
      const wallets = await storage.getAllWalletsWithWildPoints();
      res.json(wallets);
    } catch (error) {
      console.error("Error fetching wild points:", error);
      res.status(500).json({ error: "Failed to fetch wild points" });
    }
  });

  // ============================================================
  // POLYMARKET TAG MANAGEMENT
  // ============================================================

  app.get("/api/admin/tags", async (req, res) => {
    try {
      const tags = await storage.getPolymarketTags();
      res.json(tags);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tags" });
    }
  });

  app.get("/api/admin/tags/enabled", async (req, res) => {
    try {
      const tags = await storage.getEnabledPolymarketTags();
      res.json(tags);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch enabled tags" });
    }
  });

  app.post("/api/admin/tags/sync", async (req, res) => {
    try {
      const GAMMA_API = "https://gamma-api.polymarket.com";
      
      // Sports keywords - same list used by Match Day for consistency
      const SPORTS_KEYWORDS = [
        "nba", "nfl", "mlb", "nhl", "soccer", "football", "basketball", 
        "tennis", "mma", "boxing", "golf", "esports", "epl", "ucl", 
        "la-liga", "serie-a", "bundesliga", "ligue-1", "champions-league",
        "atp", "wta", "f1", "nascar", "ufc", "pga", "hockey", "baseball",
        "ncaa", "college-football", "college-basketball", "cfb", "cbb",
        "premier-league", "world-cup", "fifa", "sports"
      ];
      
      // Helper to check if an event has sports-related tags
      const isSportsEvent = (tags: Array<{ slug?: string; label?: string }>) => {
        if (!tags || !Array.isArray(tags)) return false;
        return tags.some(tag => 
          SPORTS_KEYWORDS.some(keyword => 
            tag.slug?.toLowerCase().includes(keyword) || 
            tag.label?.toLowerCase().includes(keyword)
          )
        );
      };
      
      // Fetch Match Day events from Gamma API
      const eventsResponse = await fetch(
        `${GAMMA_API}/events?active=true&closed=false&limit=200`
      );
      if (!eventsResponse.ok) {
        throw new Error(`Gamma API events error: ${eventsResponse.status}`);
      }
      const allEvents = await eventsResponse.json() as Array<{
        id: string;
        tags: Array<{ id: string; label: string; slug: string }>;
      }>;
      
      // Filter to only sports events
      const sportsEvents = allEvents.filter(event => isSportsEvent(event.tags));
      
      // Get Futures from database
      const futures = await storage.getFutures();
      
      // Extract unique sports-related tags from Match Day events
      const tagMap = new Map<string, { id: string; label: string; slug: string; eventCount: number }>();
      
      for (const event of sportsEvents) {
        if (event.tags && Array.isArray(event.tags)) {
          // Only include tags that match sports keywords
          const sportsTags = event.tags.filter(tag =>
            SPORTS_KEYWORDS.some(keyword =>
              tag.slug?.toLowerCase().includes(keyword) ||
              tag.label?.toLowerCase().includes(keyword)
            )
          );
          for (const tag of sportsTags) {
            if (tag.id && tag.slug) {
              const existing = tagMap.get(tag.id);
              tagMap.set(tag.id, {
                id: tag.id,
                label: tag.label || tag.slug,
                slug: tag.slug,
                eventCount: (existing?.eventCount || 0) + 1,
              });
            }
          }
        }
      }
      
      // Extract tags from Futures (filtered by sports keywords)
      for (const future of futures) {
        if (future.tags && Array.isArray(future.tags)) {
          const futureTags = future.tags as Array<{ id: string; label: string; slug: string }>;
          // Only include sports-related tags from futures
          const sportsTags = futureTags.filter(tag =>
            SPORTS_KEYWORDS.some(keyword =>
              tag.slug?.toLowerCase().includes(keyword) ||
              tag.label?.toLowerCase().includes(keyword)
            )
          );
          for (const tag of sportsTags) {
            if (tag.id && tag.slug) {
              const existing = tagMap.get(tag.id);
              tagMap.set(tag.id, {
                id: tag.id,
                label: tag.label || tag.slug,
                slug: tag.slug,
                eventCount: (existing?.eventCount || 0) + 1,
              });
            }
          }
        }
      }
      
      // Get existing tags to preserve enabled state (before clearing)
      const existingTags = await storage.getPolymarketTags();
      const existingMap = new Map(existingTags.map(t => [t.id, t]));
      
      // Clear all existing tags before inserting fresh sports-only set
      await storage.clearAllPolymarketTags();
      
      // Insert extracted sports tags
      const upsertedTags = [];
      let sortOrder = 0;
      for (const tag of Array.from(tagMap.values())) {
        const existing = existingMap.get(tag.id);
        const upserted = await storage.upsertPolymarketTag({
          id: tag.id,
          label: tag.label,
          slug: tag.slug,
          category: "league",
          parentTagId: null,
          eventCount: tag.eventCount,
          enabled: existing?.enabled ?? false,
          sortOrder: sortOrder++,
        });
        upsertedTags.push(upserted);
      }
      
      res.json({ synced: upsertedTags.length, tags: upsertedTags });
    } catch (error) {
      console.error("Tag sync error:", error);
      res.status(500).json({ error: "Failed to sync tags from Polymarket" });
    }
  });

  app.patch("/api/admin/tags/:id/enabled", async (req, res) => {
    try {
      const { enabled } = req.body;
      if (typeof enabled !== "boolean") {
        return res.status(400).json({ error: "enabled must be a boolean" });
      }
      const updated = await storage.setTagEnabled(req.params.id, enabled);
      if (!updated) {
        return res.status(404).json({ error: "Tag not found" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update tag" });
    }
  });

  // Futures CRUD endpoints
  app.get("/api/futures", async (req, res) => {
    try {
      const futuresList = await storage.getFutures();
      res.json(futuresList);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch futures" });
    }
  });

  app.post("/api/futures", async (req, res) => {
    try {
      const parsed = insertFuturesSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      const future = await storage.createFutures(parsed.data);
      res.status(201).json(future);
    } catch (error) {
      res.status(500).json({ error: "Failed to create futures" });
    }
  });

  app.delete("/api/futures/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteFutures(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Futures not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete futures" });
    }
  });

  // Update futures category assignment
  app.patch("/api/futures/:id/category", async (req, res) => {
    try {
      const { categoryId } = req.body;
      const updated = await storage.updateFuturesCategory(req.params.id, categoryId);
      if (!updated) {
        return res.status(404).json({ error: "Futures not found" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update futures category" });
    }
  });

  // ============================================================
  // FUTURES CATEGORIES CRUD
  // ============================================================

  app.get("/api/futures-categories", async (req, res) => {
    try {
      const categories = await storage.getFuturesCategories();
      res.json(categories);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch futures categories" });
    }
  });

  app.post("/api/futures-categories", async (req, res) => {
    try {
      const { name, slug, sortOrder } = req.body;
      if (!name || !slug) {
        return res.status(400).json({ error: "name and slug are required" });
      }
      const category = await storage.createFuturesCategory({ name, slug, sortOrder: sortOrder ?? 0 });
      res.status(201).json(category);
    } catch (error: any) {
      if (error.code === "23505") {
        return res.status(400).json({ error: "Category slug already exists" });
      }
      res.status(500).json({ error: "Failed to create futures category" });
    }
  });

  app.patch("/api/futures-categories/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid category ID" });
      }
      const updates = req.body;
      const updated = await storage.updateFuturesCategory2(id, updates);
      if (!updated) {
        return res.status(404).json({ error: "Category not found" });
      }
      res.json(updated);
    } catch (error: any) {
      if (error.code === "23505") {
        return res.status(400).json({ error: "Category slug already exists" });
      }
      res.status(500).json({ error: "Failed to update futures category" });
    }
  });

  app.delete("/api/futures-categories/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid category ID" });
      }
      const deleted = await storage.deleteFuturesCategory(id);
      if (!deleted) {
        return res.status(404).json({ error: "Category not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete futures category" });
    }
  });

  // ============================================================
  // POLYMARKET CLOB ORDER PLACEMENT
  // ============================================================
  
  const CLOB_API_BASE = "https://clob.polymarket.com";
  
  // POST order to Polymarket CLOB - receives signed order from client
  // Server adds Builder API credentials and forwards to CLOB
  // Builder signing endpoint for Polymarket RelayClient remote signing pattern
  // This endpoint provides HMAC signatures using Builder credentials (kept server-side)
  // The client uses RelayClient with remoteBuilderConfig pointing to this endpoint
  app.post("/api/polymarket/sign", async (req, res) => {
    try {
      const { method, path, body } = req.body;
      
      if (!method || !path) {
        return res.status(400).json({ error: "method and path required" });
      }
      
      if (!BUILDER_CREDENTIALS.key || !BUILDER_CREDENTIALS.secret) {
        console.error("[Sign] Builder credentials not configured");
        return res.status(500).json({ error: "Builder credentials not configured" });
      }
      
      const timestamp = Date.now().toString();
      const bodyString = typeof body === "string" ? body : (body ? JSON.stringify(body) : "");
      
      const signature = buildHmacSignature(
        BUILDER_CREDENTIALS.secret,
        parseInt(timestamp),
        method.toUpperCase(),
        path,
        bodyString
      );
      
      console.log(`[Sign] Created HMAC for ${method} ${path}`);
      
      // Return headers for RelayClient to use
      res.json({
        POLY_BUILDER_SIGNATURE: signature,
        POLY_BUILDER_TIMESTAMP: timestamp,
        POLY_BUILDER_API_KEY: BUILDER_CREDENTIALS.key,
        POLY_BUILDER_PASSPHRASE: BUILDER_CREDENTIALS.passphrase,
      });
    } catch (error) {
      console.error("[Sign] Error:", error);
      res.status(500).json({ error: "Signing failed" });
    }
  });

  // Store order records in database (order submission happens client-side via SDK)
  // This endpoint only stores the order for tracking purposes
  app.post("/api/polymarket/orders", async (req, res) => {
    try {
      const { order, walletAddress, polymarketOrderId, status, marketQuestion, outcomeLabel } = req.body;
      
      if (!order || !walletAddress) {
        return res.status(400).json({ error: "order and walletAddress required" });
      }
      
      // Handle both new FOK orders (amount) and legacy limit orders (price/size)
      const orderAmount = order.amount ?? (order.price && order.size ? order.price * order.size : 0);
      const orderPrice = order.price ?? "0";
      const orderSize = order.size ?? orderAmount.toString();
      
      console.log(`[Orders] Storing order for wallet ${walletAddress}`);
      console.log(`[Orders] Details: tokenID=${order.tokenID}, amount=${orderAmount}, side=${order.side}, orderType=${order.orderType}, status=${status}`);
      
      // Store order in our database for tracking
      const now = new Date().toISOString();
      try {
        await storage.createPolymarketOrder({
          walletAddress,
          tokenId: order.tokenID,
          side: order.side,
          price: orderPrice.toString(),
          size: orderSize.toString(),
          orderType: order.orderType || "FOK",
          polymarketOrderId: polymarketOrderId || null,
          status: status || "submitted",
          errorMessage: null,
          marketQuestion: marketQuestion || null,
          outcomeLabel: outcomeLabel || null,
          createdAt: now,
          updatedAt: now,
        });
      } catch (dbError) {
        console.error("[Orders] Failed to store order in DB:", dbError);
        return res.status(500).json({ error: "Failed to store order" });
      }
      
      // Award WILD points only for filled/matched orders (actual execution)
      // Normalize status to handle case variations from Polymarket SDK
      const normalizedStatus = (status || "").toLowerCase().trim();
      const isFilledOrder = ["filled", "matched", "executed", "completed", "success"].includes(normalizedStatus);
      
      if (walletAddress && isFilledOrder) {
        const stakeAmount = Math.floor(orderAmount);
        await storage.addWildPoints(walletAddress, stakeAmount);
        console.log(`[Orders] Awarded ${stakeAmount} WILD points to ${walletAddress} (status: ${status} -> ${normalizedStatus})`);
      } else {
        console.log(`[Orders] No WILD points awarded - status: "${status}" normalized to "${normalizedStatus}" (accepted: filled/matched/executed/completed/success)`);
      }
      
      res.json({
        success: true,
        stored: true,
        orderID: polymarketOrderId,
      });
    } catch (error) {
      console.error("[Orders] Storage error:", error);
      res.status(500).json({ error: "Failed to store order" });
    }
  });
  
  // Get orders for a wallet address
  app.get("/api/polymarket/orders/:address", async (req, res) => {
    try {
      const { address } = req.params;
      if (!address) {
        return res.status(400).json({ error: "address required" });
      }
      
      const orders = await storage.getPolymarketOrders(address);
      res.json(orders);
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });
  
  // Get positions from Polymarket Data API for a wallet
  // Uses public Data API endpoint (no auth required)
  app.get("/api/polymarket/positions/:address", async (req, res) => {
    try {
      const { address } = req.params;
      if (!address) {
        return res.status(400).json({ error: "address required" });
      }
      
      // Use public Data API endpoint (no authentication required)
      const dataApiUrl = `https://data-api.polymarket.com/positions?user=${address}`;
      
      console.log(`[Positions] Fetching from Data API for ${address}`);
      
      const response = await fetch(dataApiUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Positions] Data API error: ${response.status} - ${errorText}`);
        
        // Fall back to local database positions
        const localPositions = await storage.getPolymarketPositions(address);
        return res.json(localPositions);
      }
      
      const data = await response.json();
      // Data API returns positions directly as array or wrapped in object
      const rawPositions = Array.isArray(data) ? data : (data.positions || []);
      console.log(`[Positions] Found ${rawPositions.length} positions for ${address}`);
      
      // Log raw position data for debugging
      for (const p of rawPositions.slice(0, 5)) {
        console.log(`[Positions] Raw: title="${p.title?.substring(0, 40)}", curPrice=${p.curPrice}, redeemable=${p.redeemable}, size=${p.size}`);
      }
      
      // Transform API response to match client-expected format
      // Win/loss detection:
      // - redeemable=true indicates market is resolved (applies to ALL resolved positions)
      // - Must ALSO check curPrice to determine win vs loss:
      //   - curPrice=1 means user's outcome won → claimable
      //   - curPrice=0 means user's outcome lost → not claimable
      const positions = rawPositions.map((p: any) => {
        const size = parseFloat(p.size) || 0;
        const curPrice = parseFloat(p.curPrice) || 0;
        const redeemable = p.redeemable === true;
        
        // Determine status based on BOTH redeemable flag AND current price
        // Status values: open, pending, claimable, lost, closed
        // - pending: User won (price >= 0.99) but Polymarket hasn't enabled redemption yet
        // - claimable: User won AND can claim now (redeemable=true)
        let status = "open";
        if (size === 0) {
          status = "closed"; // No position
        } else if (redeemable && curPrice >= 0.99) {
          // Market resolved AND user's outcome won → can claim winnings
          status = "claimable";
        } else if (redeemable && curPrice <= 0.01) {
          // Market resolved BUT user's outcome lost → no claim available
          status = "lost";
        } else if (curPrice <= 0.01) {
          // Market resolved to NO but redeemable not set yet
          status = "lost";
        } else if (curPrice >= 0.99 && !redeemable) {
          // User won (price at 100¢) but redemption not yet enabled
          status = "pending";
        } else if (curPrice >= 0.99) {
          // Fallback: high price means claimable
          status = "claimable";
        }
        // Otherwise: market is unresolved (price between 0.01-0.99)
        
        return {
          tokenId: p.asset || p.tokenId,
          conditionId: p.conditionId,
          marketQuestion: p.title || p.marketQuestion,
          outcomeLabel: p.outcome || p.outcomeLabel,
          side: p.side || "BUY",
          size,
          avgPrice: parseFloat(p.avgPrice) || 0,
          currentPrice: curPrice,
          unrealizedPnl: parseFloat(p.cashPnl) || parseFloat(p.unrealizedPnl) || 0,
          status,
        };
      });
      
      res.json(positions);
    } catch (error) {
      console.error("Error fetching positions:", error);
      // Fall back to local positions
      const localPositions = await storage.getPolymarketPositions(req.params.address);
      res.json(localPositions);
    }
  });
  
  // Redeem winning positions after market resolution
  app.post("/api/polymarket/redeem", async (req, res) => {
    try {
      const { walletAddress, conditionId, outcomeSlot } = req.body;
      
      if (!walletAddress || !conditionId) {
        return res.status(400).json({ error: "walletAddress and conditionId required" });
      }
      
      if (!BUILDER_CREDENTIALS.key || !BUILDER_CREDENTIALS.secret) {
        return res.status(500).json({ error: "Builder credentials not configured" });
      }
      
      // Build redeem request for Polymarket relayer
      const path = "/redeem";
      const body = {
        user: walletAddress,
        conditionId,
        outcomeSlot: outcomeSlot || 0,
      };
      const timestamp = Date.now();
      const bodyString = JSON.stringify(body);
      const signature = buildHmacSignature(
        BUILDER_CREDENTIALS.secret,
        timestamp,
        "POST",
        path,
        bodyString
      );
      
      console.log(`[Relayer] Redeeming position for ${walletAddress}, condition ${conditionId}`);
      
      const relayerResponse = await fetch(`https://relayer-v2.polymarket.com${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "POLY_BUILDER_SIGNATURE": signature,
          "POLY_BUILDER_TIMESTAMP": timestamp.toString(),
          "POLY_BUILDER_API_KEY": BUILDER_CREDENTIALS.key,
          "POLY_BUILDER_PASSPHRASE": BUILDER_CREDENTIALS.passphrase,
        },
        body: bodyString,
      });
      
      const responseText = await relayerResponse.text();
      console.log(`[Relayer] Redeem response: ${relayerResponse.status} - ${responseText.substring(0, 500)}`);
      
      let responseData;
      try {
        responseData = responseText ? JSON.parse(responseText) : {};
      } catch {
        responseData = { message: responseText };
      }
      
      if (!relayerResponse.ok) {
        return res.status(relayerResponse.status).json({
          success: false,
          error: responseData.error || responseData.message || "Redeem failed",
        });
      }
      
      res.json({
        success: true,
        ...responseData,
      });
    } catch (error) {
      console.error("[Relayer] Redeem error:", error);
      res.status(500).json({ error: "Failed to redeem position" });
    }
  });
  
  // Withdraw USDC from Safe wallet
  app.post("/api/polymarket/withdraw", async (req, res) => {
    try {
      const { walletAddress, amount, toAddress } = req.body;
      
      if (!walletAddress || !amount || !toAddress) {
        return res.status(400).json({ error: "walletAddress, amount, and toAddress required" });
      }
      
      if (!BUILDER_CREDENTIALS.key || !BUILDER_CREDENTIALS.secret) {
        return res.status(500).json({ error: "Builder credentials not configured" });
      }
      
      // Build withdrawal request for Polymarket relayer
      const path = "/withdraw";
      const body = {
        user: walletAddress,
        amount: amount.toString(),
        toAddress,
      };
      const timestamp = Date.now();
      const bodyString = JSON.stringify(body);
      const signature = buildHmacSignature(
        BUILDER_CREDENTIALS.secret,
        timestamp,
        "POST",
        path,
        bodyString
      );
      
      console.log(`[Relayer] Withdrawing ${amount} USDC from ${walletAddress} to ${toAddress}`);
      
      const relayerResponse = await fetch(`https://relayer-v2.polymarket.com${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "POLY_BUILDER_SIGNATURE": signature,
          "POLY_BUILDER_TIMESTAMP": timestamp.toString(),
          "POLY_BUILDER_API_KEY": BUILDER_CREDENTIALS.key,
          "POLY_BUILDER_PASSPHRASE": BUILDER_CREDENTIALS.passphrase,
        },
        body: bodyString,
      });
      
      const responseText = await relayerResponse.text();
      console.log(`[Relayer] Withdraw response: ${relayerResponse.status} - ${responseText.substring(0, 500)}`);
      
      let responseData;
      try {
        responseData = responseText ? JSON.parse(responseText) : {};
      } catch {
        responseData = { message: responseText };
      }
      
      if (!relayerResponse.ok) {
        return res.status(relayerResponse.status).json({
          success: false,
          error: responseData.error || responseData.message || "Withdrawal failed",
        });
      }
      
      res.json({
        success: true,
        txHash: responseData.transactionHash || responseData.txHash,
        ...responseData,
      });
    } catch (error) {
      console.error("[Relayer] Withdraw error:", error);
      res.status(500).json({ error: "Failed to withdraw" });
    }
  });

  // Fetch Polymarket event by slug - for adding futures
  app.get("/api/polymarket/event-by-slug", async (req, res) => {
    try {
      const slug = req.query.slug as string;
      if (!slug) {
        return res.status(400).json({ error: "slug parameter required" });
      }

      // Try fetching as event slug first
      let response = await fetch(`${GAMMA_API_BASE}/events/slug/${encodeURIComponent(slug)}`);
      
      if (response.ok) {
        const event = await response.json();
        return res.json({ type: "event", data: event });
      }

      // Try fetching as market slug
      response = await fetch(`${GAMMA_API_BASE}/markets/slug/${encodeURIComponent(slug)}`);
      
      if (response.ok) {
        const market = await response.json();
        return res.json({ type: "market", data: market });
      }

      // Try fetching by event ID (if numeric)
      if (/^\d+$/.test(slug)) {
        response = await fetch(`${GAMMA_API_BASE}/events/${slug}`);
        if (response.ok) {
          const event = await response.json();
          return res.json({ type: "event", data: event });
        }
      }

      res.status(404).json({ error: "Event or market not found" });
    } catch (error) {
      console.error("Error fetching by slug:", error);
      res.status(500).json({ error: "Failed to fetch event" });
    }
  });

  return httpServer;
}
