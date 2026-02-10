import { pgTable, text, serial, integer, real, timestamp, jsonb, varchar, boolean, numeric, uniqueIndex } from "drizzle-orm/pg-core";
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
  safeAddress: varchar("safe_address", { length: 42 }),
  isSafeDeployed: boolean("is_safe_deployed").notNull().default(false),
  referralCode: varchar("referral_code", { length: 20 }),
  referredBy: varchar("referred_by", { length: 42 }),
  referralPointsEarned: real("referral_points_earned").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const whiteLabelConfig = pgTable("white_label_config", {
  id: serial("id").primaryKey(),
  themeConfig: jsonb("theme_config").$type<Record<string, unknown>>().default({}),
  apiCredentials: jsonb("api_credentials").$type<Record<string, unknown>>().default({}),
  feeConfig: jsonb("fee_config").$type<{ feeBps: number; feeAddress?: string; wallets?: Array<{ address: string; percentage: number }> }>().default({ feeBps: 0 }),
  pointsConfig: jsonb("points_config").$type<{ enabled: boolean; name: string; resetSchedule: string; referralEnabled: boolean; referralPercentage: number } | null>(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// Bridge transactions - stores bridge addresses for tracking deposit/withdraw status
export const bridgeTransactions = pgTable("bridge_transactions", {
  id: serial("id").primaryKey(),
  userAddress: varchar("user_address", { length: 42 }).notNull(), // User's Safe wallet address
  bridgeAddress: varchar("bridge_address", { length: 64 }).notNull(), // Bridge-generated address (evm/svm/btc)
  type: text("type").notNull(), // "deposit" or "withdraw"
  chainId: text("chain_id").notNull(), // Source chain for deposits, destination chain for withdrawals
  tokenAddress: text("token_address"), // Token address
  chainName: text("chain_name"), // Human-readable chain name
  createdAt: text("created_at").notNull(),
});

export const adminSettings = pgTable("admin_settings", {
  id: serial("id").primaryKey(),
  demoMode: boolean("demo_mode").notNull().default(false),
  mockDataEnabled: boolean("mock_data_enabled").notNull().default(true),
  activeTagIds: jsonb("active_tag_ids").notNull().$type<string[]>().default([]),
  lastUpdated: text("last_updated").notNull(),
});

export const futuresCategories = pgTable("futures_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
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
  categoryId: integer("category_id"),
  tags: jsonb("tags").$type<Array<{ id: string; label: string; slug: string }>>(),
  marketData: jsonb("market_data").$type<{
    question: string;
    outcomes: Array<{ label: string; probability: number; odds: number; marketId?: string; conditionId?: string }>;
    volume: number;
    liquidity: number;
    conditionId: string;
  }>(),
  createdAt: text("created_at").notNull(),
});

export const polymarketTags = pgTable("polymarket_tags", {
  id: varchar("id", { length: 36 }).primaryKey(),
  label: text("label").notNull(),
  slug: text("slug").notNull().unique(),
  category: text("category"), // "sport", "league", "event_type"
  parentTagId: varchar("parent_tag_id", { length: 36 }),
  eventCount: integer("event_count").default(0),
  enabled: boolean("enabled").notNull().default(false),
  sortOrder: integer("sort_order").default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const sportMarketConfigs = pgTable("sport_market_configs", {
  id: serial("id").primaryKey(),
  sportSlug: text("sport_slug").notNull(),
  sportLabel: text("sport_label").notNull(),
  marketType: text("market_type").notNull(),
  marketTypeLabel: text("market_type_label"),
  titleField: text("title_field").notNull().default("groupItemTitle"),
  buttonLabelField: text("button_label_field").notNull().default("outcomes"),
  betSlipTitleField: text("bet_slip_title_field").notNull().default("question"),
  useQuestionForTitle: boolean("use_question_for_title").notNull().default(false),
  showLine: boolean("show_line").notNull().default(false),
  lineFieldPath: text("line_field_path").default("line"),
  lineFormatter: text("line_formatter").default("default"),
  outcomeStrategy: jsonb("outcome_strategy").$type<{
    type: string;
    fallback?: string;
    regex?: string;
    template?: string;
  }>(),
  sampleData: jsonb("sample_data").$type<Record<string, unknown>>(),
  notes: text("notes"),
  createdAt: text("created_at"),
  updatedAt: text("updated_at"),
}, (table) => [
  // Composite unique index on sportSlug + marketType
  uniqueIndex("sport_market_config_unique").on(table.sportSlug, table.marketType)
]);

export const sportFieldConfigs = pgTable("sport_field_configs", {
  id: serial("id").primaryKey(),
  sportSlug: text("sport_slug").notNull().unique(),
  sportLabel: text("sport_label").notNull(),
  titleField: text("title_field").notNull().default("groupItemTitle"),
  buttonLabelField: text("button_label_field").notNull().default("outcomes"),
  betSlipTitleField: text("bet_slip_title_field").notNull().default("question"),
  useQuestionForTitle: boolean("use_question_for_title").notNull().default(false),
  sampleData: jsonb("sample_data").$type<Record<string, unknown>>(),
  createdAt: text("created_at"),
  updatedAt: text("updated_at"),
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

export const insertWhiteLabelConfigSchema = createInsertSchema(whiteLabelConfig).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertWhiteLabelConfig = z.infer<typeof insertWhiteLabelConfigSchema>;
export type WhiteLabelConfig = typeof whiteLabelConfig.$inferSelect;

export const insertBridgeTransactionSchema = createInsertSchema(bridgeTransactions).omit({ id: true, createdAt: true });
export type InsertBridgeTransaction = z.infer<typeof insertBridgeTransactionSchema>;
export type BridgeTransaction = typeof bridgeTransactions.$inferSelect;

export const insertFuturesCategorySchema = createInsertSchema(futuresCategories).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFuturesCategory = z.infer<typeof insertFuturesCategorySchema>;
export type FuturesCategory = typeof futuresCategories.$inferSelect;

export const insertFuturesSchema = createInsertSchema(futures).omit({ id: true, createdAt: true });
export type InsertFutures = z.infer<typeof insertFuturesSchema>;
export type Futures = typeof futures.$inferSelect;

export const insertPolymarketTagSchema = createInsertSchema(polymarketTags).omit({ createdAt: true, updatedAt: true });
export type InsertPolymarketTag = z.infer<typeof insertPolymarketTagSchema>;
export type PolymarketTagRecord = typeof polymarketTags.$inferSelect;

export const insertSportFieldConfigSchema = createInsertSchema(sportFieldConfigs).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSportFieldConfig = z.infer<typeof insertSportFieldConfigSchema>;
export type SportFieldConfig = typeof sportFieldConfigs.$inferSelect;

export const insertSportMarketConfigSchema = createInsertSchema(sportMarketConfigs).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSportMarketConfig = z.infer<typeof insertSportMarketConfigSchema>;
export type SportMarketConfig = typeof sportMarketConfigs.$inferSelect;

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
  safeAddress: z.string().nullable().optional(),
  isSafeDeployed: z.boolean(),
  referralCode: z.string().nullable().optional(),
  referredBy: z.string().nullable().optional(),
  referralPointsEarned: z.number(),
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

// ============ POLYMARKET POSITIONS TABLE ============

export const polymarketPositions = pgTable("polymarket_positions", {
  id: serial("id").primaryKey(),
  walletAddress: varchar("wallet_address", { length: 42 }).notNull(),
  tokenId: text("token_id").notNull(),
  conditionId: text("condition_id"),
  marketId: text("market_id"),
  marketQuestion: text("market_question"),
  outcomeLabel: text("outcome_label"),
  side: text("side").notNull(), // "yes" or "no"
  size: numeric("size", { precision: 20, scale: 6 }).notNull(),
  avgPrice: numeric("avg_price", { precision: 10, scale: 6 }).notNull(),
  currentPrice: numeric("current_price", { precision: 10, scale: 6 }),
  realizedPnl: numeric("realized_pnl", { precision: 20, scale: 6 }).default("0"),
  unrealizedPnl: numeric("unrealized_pnl", { precision: 20, scale: 6 }).default("0"),
  status: text("status").notNull().default("open"), // "open", "closed", "redeemable"
  polymarketOrderId: text("polymarket_order_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const polymarketOrders = pgTable("polymarket_orders", {
  id: serial("id").primaryKey(),
  walletAddress: varchar("wallet_address", { length: 42 }).notNull(),
  tokenId: text("token_id").notNull(),
  side: text("side").notNull(), // "BUY" or "SELL"
  price: numeric("price", { precision: 10, scale: 6 }).notNull(),
  size: numeric("size", { precision: 20, scale: 6 }).notNull(),
  orderType: text("order_type").notNull().default("GTC"), // "GTC", "FOK", "GTD"
  polymarketOrderId: text("polymarket_order_id"),
  status: text("status").notNull().default("pending"), // "pending", "open", "filled", "cancelled", "failed"
  filledSize: numeric("filled_size", { precision: 20, scale: 6 }).default("0"),
  errorMessage: text("error_message"),
  marketQuestion: text("market_question"),
  outcomeLabel: text("outcome_label"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertPolymarketPositionSchema = createInsertSchema(polymarketPositions).omit({ id: true });
export type InsertPolymarketPosition = z.infer<typeof insertPolymarketPositionSchema>;
export type PolymarketPosition = typeof polymarketPositions.$inferSelect;

export const insertPolymarketOrderSchema = createInsertSchema(polymarketOrders).omit({ id: true });
export type InsertPolymarketOrder = z.infer<typeof insertPolymarketOrderSchema>;
export type PolymarketOrder = typeof polymarketOrders.$inferSelect;

// Zod schemas for API validation
export const polymarketPositionSchema = z.object({
  id: z.number(),
  walletAddress: z.string(),
  tokenId: z.string(),
  conditionId: z.string().nullable(),
  marketId: z.string().nullable(),
  marketQuestion: z.string().nullable(),
  outcomeLabel: z.string().nullable(),
  side: z.string(),
  size: z.string(),
  avgPrice: z.string(),
  currentPrice: z.string().nullable(),
  realizedPnl: z.string().nullable(),
  unrealizedPnl: z.string().nullable(),
  status: z.string(),
  polymarketOrderId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const polymarketOrderSchema = z.object({
  id: z.number(),
  walletAddress: z.string(),
  tokenId: z.string(),
  side: z.string(),
  price: z.string(),
  size: z.string(),
  orderType: z.string(),
  polymarketOrderId: z.string().nullable(),
  status: z.string(),
  filledSize: z.string().nullable(),
  errorMessage: z.string().nullable(),
  marketQuestion: z.string().nullable(),
  outcomeLabel: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
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
