import type { Express } from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import { storage } from "./storage";
import { insertMarketSchema, insertPlayerSchema, insertBetSchema, insertTradeSchema } from "@shared/schema";
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

      const bet = await storage.createBet({
        marketId,
        outcomeId,
        amount,
        odds,
        potentialPayout: amount * odds,
        walletAddress: walletAddress || undefined,
      });
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
      
      if (!BUILDER_CREDENTIALS.key || !BUILDER_CREDENTIALS.secret) {
        return res.status(500).json({ error: "Builder credentials not configured" });
      }
      
      const timestamp = Date.now();
      const bodyString = body ? JSON.stringify(body) : "";
      const signature = buildHmacSignature(
        BUILDER_CREDENTIALS.secret,
        timestamp,
        method || "POST",
        path || "/",
        bodyString
      );
      
      // Make the actual call to Polymarket relayer from server
      const relayerUrl = `https://relayer-v2.polymarket.com${path}`;
      const relayerResponse = await fetch(relayerUrl, {
        method: method || "POST",
        headers: {
          "Content-Type": "application/json",
          "POLY_BUILDER_SIGNATURE": signature,
          "POLY_BUILDER_TIMESTAMP": timestamp.toString(),
          "POLY_BUILDER_API_KEY": BUILDER_CREDENTIALS.key,
          "POLY_BUILDER_PASSPHRASE": BUILDER_CREDENTIALS.passphrase,
        },
        body: bodyString || undefined,
      });
      
      const data = await relayerResponse.json();
      res.status(relayerResponse.status).json(data);
    } catch (error) {
      console.error("Relay error:", error);
      res.status(500).json({ error: "Failed to relay request" });
    }
  });

  // Check if builder credentials are configured (no sensitive data exposed)
  app.get("/api/polymarket/status", async (req, res) => {
    res.json({
      builderConfigured: !!(BUILDER_CREDENTIALS.key && BUILDER_CREDENTIALS.secret),
      relayerUrl: "https://relayer-v2.polymarket.com",
    });
  });

  // Gamma API proxy - bypasses CORS for fetching Polymarket markets
  app.get("/api/polymarket/tags", async (req, res) => {
    try {
      const response = await fetch(`${GAMMA_API_BASE}/tags`);
      if (!response.ok) {
        throw new Error(`Gamma API error: ${response.status}`);
      }
      const tags = await response.json();
      // Filter to sports-related tags
      const sportsTags = tags.filter((tag: { label?: string; slug?: string }) => 
        ["sports", "nba", "nfl", "mlb", "nhl", "soccer", "football", "basketball", "tennis", "mma", "boxing", "golf", "esports"].some(
          keyword => tag.label?.toLowerCase().includes(keyword) || tag.slug?.toLowerCase().includes(keyword)
        )
      );
      res.json(sportsTags);
    } catch (error) {
      console.error("Error fetching Gamma tags:", error);
      res.status(500).json({ error: "Failed to fetch tags" });
    }
  });

  app.get("/api/polymarket/events", async (req, res) => {
    try {
      const tagId = req.query.tag_id as string;
      if (!tagId) {
        return res.status(400).json({ error: "tag_id required" });
      }
      
      const response = await fetch(
        `${GAMMA_API_BASE}/events?tag_id=${tagId}&active=true&closed=false&limit=10`
      );
      
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

  return httpServer;
}
