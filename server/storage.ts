import { randomUUID } from "crypto";
import { eq, and } from "drizzle-orm";
import { db } from "./db";
import {
  markets,
  players,
  bets,
  trades,
  walletRecords,
  adminSettings,
  futures,
  sportFieldConfigs,
  sportMarketConfigs,
  polymarketPositions,
  polymarketOrders,
  polymarketTags,
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
  type SportFieldConfig,
  type InsertSportFieldConfig,
  type SportMarketConfig,
  type InsertSportMarketConfig,
  type PolymarketPosition,
  type InsertPolymarketPosition,
  type PolymarketOrder,
  type InsertPolymarketOrder,
  type PolymarketTagRecord,
  type InsertPolymarketTag,
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
  updateWalletSafeStatus(address: string, safeAddress: string, isSafeDeployed: boolean): Promise<WalletRecord>;

  getAdminSettings(): Promise<AdminSettings>;
  updateAdminSettings(updates: Partial<AdminSettings>): Promise<AdminSettings>;

  getFutures(): Promise<Futures[]>;
  getFuturesById(id: string): Promise<Futures | undefined>;
  createFutures(future: InsertFutures): Promise<Futures>;
  deleteFutures(id: string): Promise<boolean>;

  getSportFieldConfigs(): Promise<SportFieldConfig[]>;
  getSportFieldConfig(sportSlug: string): Promise<SportFieldConfig | undefined>;
  createOrUpdateSportFieldConfig(config: InsertSportFieldConfig): Promise<SportFieldConfig>;
  deleteSportFieldConfig(sportSlug: string): Promise<boolean>;

  getSportMarketConfigs(): Promise<SportMarketConfig[]>;
  getSportMarketConfig(sportSlug: string, marketType: string): Promise<SportMarketConfig | undefined>;
  getSportMarketConfigsBySport(sportSlug: string): Promise<SportMarketConfig[]>;
  createOrUpdateSportMarketConfig(config: InsertSportMarketConfig): Promise<SportMarketConfig>;
  deleteSportMarketConfig(sportSlug: string, marketType: string): Promise<boolean>;

  getPolymarketOrders(walletAddress: string): Promise<PolymarketOrder[]>;
  createPolymarketOrder(order: InsertPolymarketOrder): Promise<PolymarketOrder>;
  updatePolymarketOrder(id: number, updates: Partial<PolymarketOrder>): Promise<PolymarketOrder | undefined>;
  
  getPolymarketPositions(walletAddress: string): Promise<PolymarketPosition[]>;
  createPolymarketPosition(position: InsertPolymarketPosition): Promise<PolymarketPosition>;
  updatePolymarketPosition(id: number, updates: Partial<PolymarketPosition>): Promise<PolymarketPosition | undefined>;

  getPolymarketTags(): Promise<PolymarketTagRecord[]>;
  getEnabledPolymarketTags(): Promise<PolymarketTagRecord[]>;
  upsertPolymarketTag(tag: InsertPolymarketTag): Promise<PolymarketTagRecord>;
  setTagEnabled(id: string, enabled: boolean): Promise<PolymarketTagRecord | undefined>;
  updateFuturesTags(id: string, tags: Array<{ id: string; label: string; slug: string }>): Promise<Futures | undefined>;

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

  async updateWalletSafeStatus(address: string, safeAddress: string, isSafeDeployed: boolean): Promise<WalletRecord> {
    const record = await this.getOrCreateWalletRecord(address);
    const updatedAt = new Date().toISOString();
    const [updated] = await db.update(walletRecords)
      .set({
        safeAddress,
        isSafeDeployed,
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

  async getSportFieldConfigs(): Promise<SportFieldConfig[]> {
    return await db.select().from(sportFieldConfigs);
  }

  async getSportFieldConfig(sportSlug: string): Promise<SportFieldConfig | undefined> {
    const [config] = await db.select().from(sportFieldConfigs).where(eq(sportFieldConfigs.sportSlug, sportSlug));
    return config || undefined;
  }

  async createOrUpdateSportFieldConfig(config: InsertSportFieldConfig): Promise<SportFieldConfig> {
    const now = new Date().toISOString();
    const existing = await this.getSportFieldConfig(config.sportSlug);
    
    if (existing) {
      const [updated] = await db
        .update(sportFieldConfigs)
        .set({
          sportLabel: config.sportLabel,
          titleField: config.titleField,
          buttonLabelField: config.buttonLabelField,
          betSlipTitleField: config.betSlipTitleField,
          useQuestionForTitle: config.useQuestionForTitle,
          sampleData: config.sampleData as Record<string, unknown> | undefined,
          updatedAt: now,
        })
        .where(eq(sportFieldConfigs.sportSlug, config.sportSlug))
        .returning();
      return updated;
    }
    
    const [newConfig] = await db.insert(sportFieldConfigs).values({
      sportSlug: config.sportSlug,
      sportLabel: config.sportLabel,
      titleField: config.titleField || "groupItemTitle",
      buttonLabelField: config.buttonLabelField || "outcomes",
      betSlipTitleField: config.betSlipTitleField || "question",
      useQuestionForTitle: config.useQuestionForTitle || false,
      sampleData: config.sampleData as Record<string, unknown> | undefined,
      createdAt: now,
      updatedAt: now,
    }).returning();
    return newConfig;
  }

  async deleteSportFieldConfig(sportSlug: string): Promise<boolean> {
    const result = await db.delete(sportFieldConfigs).where(eq(sportFieldConfigs.sportSlug, sportSlug)).returning();
    return result.length > 0;
  }

  async getSportMarketConfigs(): Promise<SportMarketConfig[]> {
    return await db.select().from(sportMarketConfigs);
  }

  async getSportMarketConfig(sportSlug: string, marketType: string): Promise<SportMarketConfig | undefined> {
    const [config] = await db.select().from(sportMarketConfigs)
      .where(and(
        eq(sportMarketConfigs.sportSlug, sportSlug),
        eq(sportMarketConfigs.marketType, marketType)
      ));
    return config || undefined;
  }

  async getSportMarketConfigsBySport(sportSlug: string): Promise<SportMarketConfig[]> {
    return await db.select().from(sportMarketConfigs)
      .where(eq(sportMarketConfigs.sportSlug, sportSlug));
  }

  async createOrUpdateSportMarketConfig(config: InsertSportMarketConfig): Promise<SportMarketConfig> {
    const now = new Date().toISOString();
    const existing = await this.getSportMarketConfig(config.sportSlug, config.marketType);
    
    if (existing) {
      const [updated] = await db
        .update(sportMarketConfigs)
        .set({
          sportLabel: config.sportLabel,
          marketTypeLabel: config.marketTypeLabel,
          titleField: config.titleField,
          buttonLabelField: config.buttonLabelField,
          betSlipTitleField: config.betSlipTitleField,
          useQuestionForTitle: config.useQuestionForTitle,
          showLine: config.showLine,
          lineFieldPath: config.lineFieldPath,
          lineFormatter: config.lineFormatter,
          outcomeStrategy: config.outcomeStrategy as { type: string; fallback?: string; regex?: string; template?: string } | undefined,
          sampleData: config.sampleData as Record<string, unknown> | undefined,
          notes: config.notes,
          updatedAt: now,
        })
        .where(and(
          eq(sportMarketConfigs.sportSlug, config.sportSlug),
          eq(sportMarketConfigs.marketType, config.marketType)
        ))
        .returning();
      return updated;
    }
    
    const [newConfig] = await db.insert(sportMarketConfigs).values({
      sportSlug: config.sportSlug,
      sportLabel: config.sportLabel,
      marketType: config.marketType,
      marketTypeLabel: config.marketTypeLabel,
      titleField: config.titleField || "groupItemTitle",
      buttonLabelField: config.buttonLabelField || "outcomes",
      betSlipTitleField: config.betSlipTitleField || "question",
      useQuestionForTitle: config.useQuestionForTitle || false,
      showLine: config.showLine || false,
      lineFieldPath: config.lineFieldPath || "line",
      lineFormatter: config.lineFormatter || "default",
      outcomeStrategy: config.outcomeStrategy as { type: string; fallback?: string; regex?: string; template?: string } | undefined,
      sampleData: config.sampleData as Record<string, unknown> | undefined,
      notes: config.notes,
      createdAt: now,
      updatedAt: now,
    }).returning();
    return newConfig;
  }

  async deleteSportMarketConfig(sportSlug: string, marketType: string): Promise<boolean> {
    const result = await db.delete(sportMarketConfigs)
      .where(and(
        eq(sportMarketConfigs.sportSlug, sportSlug),
        eq(sportMarketConfigs.marketType, marketType)
      ))
      .returning();
    return result.length > 0;
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

  async getPolymarketOrders(walletAddress: string): Promise<PolymarketOrder[]> {
    return await db.select().from(polymarketOrders)
      .where(eq(polymarketOrders.walletAddress, walletAddress));
  }

  async createPolymarketOrder(order: InsertPolymarketOrder): Promise<PolymarketOrder> {
    const [newOrder] = await db.insert(polymarketOrders).values(order).returning();
    return newOrder;
  }

  async updatePolymarketOrder(id: number, updates: Partial<PolymarketOrder>): Promise<PolymarketOrder | undefined> {
    const [updated] = await db.update(polymarketOrders)
      .set({ ...updates, updatedAt: new Date().toISOString() })
      .where(eq(polymarketOrders.id, id))
      .returning();
    return updated || undefined;
  }

  async getPolymarketPositions(walletAddress: string): Promise<PolymarketPosition[]> {
    return await db.select().from(polymarketPositions)
      .where(eq(polymarketPositions.walletAddress, walletAddress));
  }

  async createPolymarketPosition(position: InsertPolymarketPosition): Promise<PolymarketPosition> {
    const [newPosition] = await db.insert(polymarketPositions).values(position).returning();
    return newPosition;
  }

  async updatePolymarketPosition(id: number, updates: Partial<PolymarketPosition>): Promise<PolymarketPosition | undefined> {
    const [updated] = await db.update(polymarketPositions)
      .set({ ...updates, updatedAt: new Date().toISOString() })
      .where(eq(polymarketPositions.id, id))
      .returning();
    return updated || undefined;
  }

  async getPolymarketTags(): Promise<PolymarketTagRecord[]> {
    return await db.select().from(polymarketTags);
  }

  async getEnabledPolymarketTags(): Promise<PolymarketTagRecord[]> {
    return await db.select().from(polymarketTags).where(eq(polymarketTags.enabled, true));
  }

  async upsertPolymarketTag(tag: InsertPolymarketTag): Promise<PolymarketTagRecord> {
    const now = new Date().toISOString();
    const existing = await db.select().from(polymarketTags).where(eq(polymarketTags.id, tag.id));
    
    if (existing.length > 0) {
      const [updated] = await db.update(polymarketTags)
        .set({ ...tag, updatedAt: now })
        .where(eq(polymarketTags.id, tag.id))
        .returning();
      return updated;
    } else {
      const [newTag] = await db.insert(polymarketTags)
        .values({ ...tag, createdAt: now, updatedAt: now })
        .returning();
      return newTag;
    }
  }

  async setTagEnabled(id: string, enabled: boolean): Promise<PolymarketTagRecord | undefined> {
    const [updated] = await db.update(polymarketTags)
      .set({ enabled, updatedAt: new Date().toISOString() })
      .where(eq(polymarketTags.id, id))
      .returning();
    return updated || undefined;
  }

  async updateFuturesTags(id: string, tags: Array<{ id: string; label: string; slug: string }>): Promise<Futures | undefined> {
    const [updated] = await db.update(futures)
      .set({ tags })
      .where(eq(futures.id, id))
      .returning();
    return updated || undefined;
  }
}

export const storage = new DatabaseStorage();
