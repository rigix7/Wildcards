import type { Express } from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import { storage } from "./storage";
import { insertMarketSchema, insertPlayerSchema, insertBetSchema, insertTradeSchema, insertFuturesSchema } from "@shared/schema";
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
  app.get("/api/wallet/:address", async (req, res) => {
    try {
      const { address } = req.params;
      if (!address) {
        return res.status(400).json({ error: "Address required" });
      }
      const record = await storage.getOrCreateWalletRecord(address);
      res.json(record);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch wallet record" });
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
          const eventsUrl = `${GAMMA_API_BASE}/events?series_id=${seriesId}&active=true&closed=false&limit=20`;
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
      
      if (!tagId && !seriesId) {
        return res.status(400).json({ error: "tag_id or series_id required" });
      }
      
      // Prefer series_id for more specific results (actual game matches)
      let url = `${GAMMA_API_BASE}/events?active=true&closed=false&limit=15`;
      if (seriesId) {
        url += `&series_id=${seriesId}`;
      } else if (tagId) {
        url += `&tag_id=${tagId}`;
      }
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Gamma API error: ${response.status}`);
      }
      
      const events = await response.json();
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
