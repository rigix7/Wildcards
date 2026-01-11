import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "./db";
import {
  markets,
  players,
  bets,
  trades,
  walletRecords,
  adminSettings,
  futures,
  type Market,
  type InsertMarket,
  type Player,
  type InsertPlayer,
  type Bet,
  type InsertBet,
  type Trade,
  type InsertTrade,
  type Wallet,
  type AdminSettings,
  type WalletRecord,
  type Futures,
  type InsertFutures,
} from "@shared/schema";

export interface IStorage {
  getMarkets(): Promise<Market[]>;
  getMarket(id: string): Promise<Market | undefined>;
  createMarket(market: InsertMarket): Promise<Market>;
  deleteMarket(id: string): Promise<boolean>;

  getPlayers(): Promise<Player[]>;
  getPlayer(id: string): Promise<Player | undefined>;
  createPlayer(player: InsertPlayer): Promise<Player>;
  updatePlayer(id: string, updates: Partial<Player>): Promise<Player | undefined>;
  deletePlayer(id: string): Promise<boolean>;

  getBets(): Promise<Bet[]>;
  getBet(id: string): Promise<Bet | undefined>;
  createBet(bet: InsertBet): Promise<Bet>;

  getTrades(): Promise<Trade[]>;
  getTrade(id: string): Promise<Trade | undefined>;
  createTrade(trade: InsertTrade): Promise<Trade>;

  getWallet(): Promise<Wallet>;
  updateWallet(updates: Partial<Wallet>): Promise<Wallet>;

  getWalletRecord(address: string): Promise<WalletRecord | undefined>;
  getOrCreateWalletRecord(address: string): Promise<WalletRecord>;
  addWildPoints(address: string, amount: number): Promise<WalletRecord>;

  getAdminSettings(): Promise<AdminSettings>;
  updateAdminSettings(updates: Partial<AdminSettings>): Promise<AdminSettings>;

  getFutures(): Promise<Futures[]>;
  getFuturesById(id: string): Promise<Futures | undefined>;
  createFutures(future: InsertFutures): Promise<Futures>;
  deleteFutures(id: string): Promise<boolean>;

  seedInitialData(): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  private wallet: Wallet = {
    address: "",
    usdcBalance: 0,
    wildBalance: 0,
    totalValue: 0,
  };

  async getMarkets(): Promise<Market[]> {
    return await db.select().from(markets);
  }

  async getMarket(id: string): Promise<Market | undefined> {
    const [market] = await db.select().from(markets).where(eq(markets.id, id));
    return market || undefined;
  }

  async createMarket(market: InsertMarket): Promise<Market> {
    const id = randomUUID();
    const [newMarket] = await db.insert(markets).values({ 
      id,
      title: market.title,
      description: market.description,
      category: market.category,
      sport: market.sport,
      league: market.league,
      startTime: market.startTime,
      endTime: market.endTime,
      status: market.status || "open",
      outcomes: market.outcomes as Array<{ id: string; label: string; odds: number; probability: number }>,
      volume: market.volume || 0,
      liquidity: market.liquidity || 0,
      imageUrl: market.imageUrl,
    }).returning();
    return newMarket;
  }

  async deleteMarket(id: string): Promise<boolean> {
    const result = await db.delete(markets).where(eq(markets.id, id));
    return true;
  }

  async getPlayers(): Promise<Player[]> {
    return await db.select().from(players);
  }

  async getPlayer(id: string): Promise<Player | undefined> {
    const [player] = await db.select().from(players).where(eq(players.id, id));
    return player || undefined;
  }

  async createPlayer(player: InsertPlayer): Promise<Player> {
    const id = randomUUID();
    const [newPlayer] = await db.insert(players).values({ 
      id,
      name: player.name,
      symbol: player.symbol,
      team: player.team,
      sport: player.sport,
      avatarInitials: player.avatarInitials,
      avatarUrl: player.avatarUrl,
      fundingTarget: player.fundingTarget,
      fundingCurrent: player.fundingCurrent || 0,
      fundingPercentage: player.fundingPercentage || 0,
      generation: player.generation || 1,
      status: player.status || "offering",
      priceHistory: player.priceHistory as Array<{ timestamp: string; price: number }> | undefined,
      stats: player.stats as { holders: number; marketCap: number; change24h: number } | undefined,
    }).returning();
    return newPlayer;
  }

  async updatePlayer(id: string, updates: Partial<Player>): Promise<Player | undefined> {
    const [updated] = await db.update(players).set(updates).where(eq(players.id, id)).returning();
    return updated || undefined;
  }

  async deletePlayer(id: string): Promise<boolean> {
    await db.delete(players).where(eq(players.id, id));
    return true;
  }

  async getBets(): Promise<Bet[]> {
    return await db.select().from(bets);
  }

  async getBet(id: string): Promise<Bet | undefined> {
    const [bet] = await db.select().from(bets).where(eq(bets.id, id));
    return bet || undefined;
  }

  async createBet(bet: InsertBet): Promise<Bet> {
    const id = randomUUID();
    const placedAt = new Date().toISOString();
    const [newBet] = await db.insert(bets).values({
      ...bet,
      id,
      placedAt,
      status: "pending",
    }).returning();

    if (bet.walletAddress) {
      await this.addWildPoints(bet.walletAddress, bet.amount);
    }

    return newBet;
  }

  async getTrades(): Promise<Trade[]> {
    return await db.select().from(trades);
  }

  async getTrade(id: string): Promise<Trade | undefined> {
    const [trade] = await db.select().from(trades).where(eq(trades.id, id));
    return trade || undefined;
  }

  async createTrade(trade: InsertTrade): Promise<Trade> {
    const id = randomUUID();
    const timestamp = new Date().toISOString();
    const [newTrade] = await db.insert(trades).values({
      ...trade,
      id,
      timestamp,
    }).returning();

    if (trade.type === "buy") {
      this.wallet.usdcBalance -= trade.total;
    } else {
      this.wallet.usdcBalance += trade.total;
    }
    this.wallet.totalValue = this.wallet.usdcBalance + this.wallet.wildBalance;

    return newTrade;
  }

  async getWallet(): Promise<Wallet> {
    return this.wallet;
  }

  async updateWallet(updates: Partial<Wallet>): Promise<Wallet> {
    this.wallet = { ...this.wallet, ...updates };
    return this.wallet;
  }

  async getWalletRecord(address: string): Promise<WalletRecord | undefined> {
    const normalizedAddress = address.toLowerCase();
    const [record] = await db.select().from(walletRecords).where(eq(walletRecords.address, normalizedAddress));
    return record || undefined;
  }

  async getOrCreateWalletRecord(address: string): Promise<WalletRecord> {
    const normalizedAddress = address.toLowerCase();
    let record = await this.getWalletRecord(normalizedAddress);
    if (!record) {
      const now = new Date().toISOString();
      const [newRecord] = await db.insert(walletRecords).values({
        address: normalizedAddress,
        wildPoints: 0,
        totalBetAmount: 0,
        createdAt: now,
        updatedAt: now,
      }).returning();
      record = newRecord;
    }
    return record;
  }

  async addWildPoints(address: string, amount: number): Promise<WalletRecord> {
    const record = await this.getOrCreateWalletRecord(address);
    const updatedAt = new Date().toISOString();
    const [updated] = await db.update(walletRecords)
      .set({
        wildPoints: record.wildPoints + amount,
        totalBetAmount: record.totalBetAmount + amount,
        updatedAt,
      })
      .where(eq(walletRecords.address, record.address))
      .returning();
    return updated;
  }

  async getAdminSettings(): Promise<AdminSettings> {
    const [settings] = await db.select().from(adminSettings).limit(1);
    if (!settings) {
      const now = new Date().toISOString();
      const [newSettings] = await db.insert(adminSettings).values({
        demoMode: false,
        mockDataEnabled: true,
        activeTagIds: [],
        lastUpdated: now,
      }).returning();
      return newSettings;
    }
    return settings;
  }

  async updateAdminSettings(updates: Partial<AdminSettings>): Promise<AdminSettings> {
    const current = await this.getAdminSettings();
    const [updated] = await db.update(adminSettings)
      .set({
        ...updates,
        lastUpdated: new Date().toISOString(),
      })
      .where(eq(adminSettings.id, current.id))
      .returning();
    return updated;
  }

  async getFutures(): Promise<Futures[]> {
    return await db.select().from(futures);
  }

  async getFuturesById(id: string): Promise<Futures | undefined> {
    const [future] = await db.select().from(futures).where(eq(futures.id, id));
    return future || undefined;
  }

  async createFutures(future: InsertFutures): Promise<Futures> {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const [newFuture] = await db.insert(futures).values({
      id,
      polymarketSlug: future.polymarketSlug,
      polymarketEventId: future.polymarketEventId,
      title: future.title,
      description: future.description,
      imageUrl: future.imageUrl,
      startDate: future.startDate,
      endDate: future.endDate,
      status: future.status || "active",
      marketData: future.marketData as {
        question: string;
        outcomes: Array<{ label: string; probability: number; odds: number }>;
        volume: number;
        liquidity: number;
        conditionId: string;
      } | undefined,
      createdAt,
    }).returning();
    return newFuture;
  }

  async deleteFutures(id: string): Promise<boolean> {
    await db.delete(futures).where(eq(futures.id, id));
    return true;
  }

  async seedInitialData(): Promise<void> {
    // Only seed demo players for the Scout feature (not real markets)
    const existingPlayers = await this.getPlayers();
    if (existingPlayers.length > 0) return;

    const samplePlayers: InsertPlayer[] = [
      {
        name: "Bronny Jr.",
        symbol: "BRON",
        team: "USC Trojans",
        sport: "Basketball",
        avatarInitials: "BJ",
        fundingTarget: 100000,
        fundingCurrent: 82000,
        fundingPercentage: 82,
        generation: 1,
        status: "offering",
      },
      {
        name: "Victor Wembanyama",
        symbol: "WEMBY",
        team: "San Antonio Spurs",
        sport: "Basketball",
        avatarInitials: "VW",
        fundingTarget: 150000,
        fundingCurrent: 45000,
        fundingPercentage: 30,
        generation: 1,
        status: "offering",
      },
      {
        name: "Caitlin Clark",
        symbol: "CCLARK",
        team: "Iowa Hawkeyes",
        sport: "Basketball",
        avatarInitials: "CC",
        fundingTarget: 80000,
        fundingCurrent: 80000,
        fundingPercentage: 100,
        generation: 1,
        status: "available",
        stats: {
          holders: 487,
          marketCap: 125000,
          change24h: 12.5,
        },
      },
      {
        name: "Kylian Mbappé",
        symbol: "KM",
        team: "Real Madrid",
        sport: "Soccer",
        avatarInitials: "KM",
        fundingTarget: 200000,
        fundingCurrent: 200000,
        fundingPercentage: 100,
        generation: 1,
        status: "available",
        stats: {
          holders: 1250,
          marketCap: 450000,
          change24h: -3.2,
        },
      },
      {
        name: "Paolo Banchero",
        symbol: "PB",
        team: "Orlando Magic",
        sport: "Basketball",
        avatarInitials: "PB",
        fundingTarget: 75000,
        fundingCurrent: 75000,
        fundingPercentage: 100,
        generation: 2,
        status: "available",
        stats: {
          holders: 312,
          marketCap: 89000,
          change24h: 5.8,
        },
      },
      {
        name: "Shohei Ohtani",
        symbol: "SHOHEI",
        team: "Los Angeles Dodgers",
        sport: "Baseball",
        avatarInitials: "SO",
        fundingTarget: 180000,
        fundingCurrent: 180000,
        fundingPercentage: 100,
        generation: 1,
        status: "available",
        stats: {
          holders: 892,
          marketCap: 320000,
          change24h: 8.1,
        },
      },
    ];

    for (const player of samplePlayers) {
      await this.createPlayer(player);
    }

    console.log("Database seeded with demo players for Scout feature");
  }
}

export const storage = new DatabaseStorage();
