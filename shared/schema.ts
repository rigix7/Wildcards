import { pgTable, text, serial, integer, real, timestamp, jsonb, varchar, boolean, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============ DATABASE TABLES ============

export const markets = pgTable("markets", {
  id: varchar("id", { length: 36 }).primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull(),
  sport: text("sport"),
  league: text("league"),
  startTime: text("start_time").notNull(),
  endTime: text("end_time"),
  status: text("status").notNull().default("open"),
  outcomes: jsonb("outcomes").notNull().$type<Array<{ id: string; label: string; odds: number; probability: number }>>(),
  volume: real("volume").notNull().default(0),
  liquidity: real("liquidity").notNull().default(0),
  imageUrl: text("image_url"),
});

export const players = pgTable("players", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  team: text("team").notNull(),
  sport: text("sport").notNull(),
  avatarInitials: text("avatar_initials").notNull(),
  avatarUrl: text("avatar_url"),
  fundingTarget: real("funding_target").notNull(),
  fundingCurrent: real("funding_current").notNull().default(0),
  fundingPercentage: real("funding_percentage").notNull().default(0),
  generation: integer("generation").notNull().default(1),
  status: text("status").notNull().default("offering"),
  priceHistory: jsonb("price_history").$type<Array<{ timestamp: string; price: number }>>(),
  stats: jsonb("stats").$type<{ holders: number; marketCap: number; change24h: number }>(),
});

export const bets = pgTable("bets", {
  id: varchar("id", { length: 36 }).primaryKey(),
  marketId: varchar("market_id", { length: 36 }).notNull(),
  outcomeId: text("outcome_id").notNull(),
  amount: real("amount").notNull(),
  odds: real("odds").notNull(),
  potentialPayout: real("potential_payout").notNull(),
  status: text("status").notNull().default("pending"),
  placedAt: text("placed_at").notNull(),
  walletAddress: text("wallet_address"),
});

export const trades = pgTable("trades", {
  id: varchar("id", { length: 36 }).primaryKey(),
  playerId: varchar("player_id", { length: 36 }).notNull(),
  playerName: text("player_name").notNull(),
  playerSymbol: text("player_symbol").notNull(),
  type: text("type").notNull(),
  amount: real("amount").notNull(),
  price: real("price").notNull(),
  total: real("total").notNull(),
  timestamp: text("timestamp").notNull(),
  walletAddress: text("wallet_address"),
});

export const walletRecords = pgTable("wallet_records", {
  address: varchar("address", { length: 42 }).primaryKey(),
  wildPoints: real("wild_points").notNull().default(0),
  totalBetAmount: real("total_bet_amount").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const adminSettings = pgTable("admin_settings", {
  id: serial("id").primaryKey(),
  demoMode: boolean("demo_mode").notNull().default(false),
  mockDataEnabled: boolean("mock_data_enabled").notNull().default(true),
  activeTagIds: jsonb("active_tag_ids").notNull().$type<string[]>().default([]),
  lastUpdated: text("last_updated").notNull(),
});

export const futures = pgTable("futures", {
  id: varchar("id", { length: 36 }).primaryKey(),
  polymarketSlug: text("polymarket_slug").notNull(),
  polymarketEventId: text("polymarket_event_id"),
  title: text("title").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  status: text("status").notNull().default("active"),
  marketData: jsonb("market_data").$type<{
    question: string;
    outcomes: Array<{ label: string; probability: number; odds: number }>;
    volume: number;
    liquidity: number;
    conditionId: string;
  }>(),
  createdAt: text("created_at").notNull(),
});

// ============ ZOD SCHEMAS & TYPES ============

export const insertMarketSchema = createInsertSchema(markets).omit({ id: true });
export type InsertMarket = z.infer<typeof insertMarketSchema>;
export type Market = typeof markets.$inferSelect;

export const insertPlayerSchema = createInsertSchema(players).omit({ id: true });
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type Player = typeof players.$inferSelect;

export const insertBetSchema = createInsertSchema(bets).omit({ id: true, placedAt: true, status: true });
export type InsertBet = z.infer<typeof insertBetSchema>;
export type Bet = typeof bets.$inferSelect;

export const insertTradeSchema = createInsertSchema(trades).omit({ id: true, timestamp: true });
export type InsertTrade = z.infer<typeof insertTradeSchema>;
export type Trade = typeof trades.$inferSelect;

export type WalletRecord = typeof walletRecords.$inferSelect;
export type AdminSettings = typeof adminSettings.$inferSelect;

export const insertFuturesSchema = createInsertSchema(futures).omit({ id: true, createdAt: true });
export type InsertFutures = z.infer<typeof insertFuturesSchema>;
export type Futures = typeof futures.$inferSelect;

// ============ LEGACY ZOD SCHEMAS (for API validation) ============

export const marketSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional().nullable(),
  category: z.string(),
  sport: z.string().optional().nullable(),
  league: z.string().optional().nullable(),
  startTime: z.string(),
  endTime: z.string().optional().nullable(),
  status: z.string(),
  outcomes: z.array(z.object({
    id: z.string(),
    label: z.string(),
    odds: z.number(),
    probability: z.number(),
  })),
  volume: z.number(),
  liquidity: z.number(),
  imageUrl: z.string().optional().nullable(),
});

export const betSchema = z.object({
  id: z.string(),
  marketId: z.string(),
  outcomeId: z.string(),
  amount: z.number(),
  odds: z.number(),
  potentialPayout: z.number(),
  status: z.string(),
  placedAt: z.string(),
  walletAddress: z.string().optional().nullable(),
});

export const playerSchema = z.object({
  id: z.string(),
  name: z.string(),
  symbol: z.string(),
  team: z.string(),
  sport: z.string(),
  avatarInitials: z.string(),
  avatarUrl: z.string().optional().nullable(),
  fundingTarget: z.number(),
  fundingCurrent: z.number(),
  fundingPercentage: z.number(),
  generation: z.number(),
  status: z.string(),
  priceHistory: z.array(z.object({
    timestamp: z.string(),
    price: z.number(),
  })).optional().nullable(),
  stats: z.object({
    holders: z.number(),
    marketCap: z.number(),
    change24h: z.number(),
  }).optional().nullable(),
});

export const tradeSchema = z.object({
  id: z.string(),
  playerId: z.string(),
  playerName: z.string(),
  playerSymbol: z.string(),
  type: z.string(),
  amount: z.number(),
  price: z.number(),
  total: z.number(),
  timestamp: z.string(),
  walletAddress: z.string().optional().nullable(),
});

export const walletSchema = z.object({
  address: z.string(),
  usdcBalance: z.number(),
  wildBalance: z.number(),
  totalValue: z.number(),
});

export type Wallet = z.infer<typeof walletSchema>;

export const walletRecordSchema = z.object({
  address: z.string(),
  wildPoints: z.number(),
  totalBetAmount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const polymarketTagSchema = z.object({
  id: z.string(),
  label: z.string(),
  slug: z.string(),
  enabled: z.boolean(),
});

export type PolymarketTag = z.infer<typeof polymarketTagSchema>;

export const adminSettingsSchema = z.object({
  id: z.number().optional(),
  demoMode: z.boolean(),
  mockDataEnabled: z.boolean(),
  activeTagIds: z.array(z.string()),
  lastUpdated: z.string(),
});

// ============ LEGACY USER SCHEMA (keep for compatibility) ============

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
