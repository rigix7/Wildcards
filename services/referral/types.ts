/**
 * Referral System Type Definitions
 *
 * Defines the 4 configurable strategies, reset modes, and shared interfaces
 * used across the referral system.
 */

// ---------------------------------------------------------------------------
// Strategy Configurations
// ---------------------------------------------------------------------------

export interface GrowthMultiplierConfig {
  tiers: Array<{
    referrals: number;   // min active referrals to reach this tier
    multiplier: number;  // e.g. 1.10 = 10% bonus on base points
  }>;
  activeDefinition: {
    betWithinDays: number;    // referral must have bet within N days to be "active"
    minLifetimeVolume: number; // minimum lifetime volume to be considered active
  };
}

export interface RevenueShareConfig {
  sharePercentage: number;       // 0-50, % of referred user's points
  durationDays: number | null;   // null = lifetime
  maxPerReferral: number;        // max points earnable per referral (0 = unlimited)
  maxMonthlyTotal: number;       // max total monthly bonus (0 = unlimited)
}

export interface MilestoneQuestConfig {
  durationDays: number;
  referrerMilestones: Array<{
    volume: number;    // volume threshold (0 = signup only)
    reward: number;    // flat bonus points
    label: string;     // e.g. "Referral signed up", "First bet", "$50 volume"
  }>;
  refereeMilestones: Array<{
    volume: number;
    reward: number;
    label: string;
  }>;
}

export interface TeamVolumeConfig {
  resetFrequency: "weekly" | "monthly";
  teamTiers: Array<{
    weeklyVolume: number;   // combined team volume threshold
    multiplier: number;     // bonus multiplier on own points
  }>;
}

export type StrategyType = "growth_multiplier" | "revenue_share" | "milestone_quest" | "team_volume";

export type StrategyConfig =
  | GrowthMultiplierConfig
  | RevenueShareConfig
  | MilestoneQuestConfig
  | TeamVolumeConfig;

// ---------------------------------------------------------------------------
// Reset Modes
// ---------------------------------------------------------------------------

export type ResetMode = "manual" | "scheduled" | "rolling_expiry";

export interface ScheduledResetConfig {
  frequency: "daily" | "weekly" | "monthly";
  dayOfWeek?: number;  // 0-6 (Sunday-Saturday), for weekly
  dayOfMonth?: number; // 1-31, for monthly
  timeUtc: string;     // "00:00" format
  nextResetAt: string; // ISO timestamp
}

export interface RollingExpiryConfig {
  windowDays: number;  // referral links expire after N days
}

export type ResetConfig = {
  mode: ResetMode;
  schedule?: ScheduledResetConfig;
  rolling?: RollingExpiryConfig;
  archiveEnabled: boolean;
};

// ---------------------------------------------------------------------------
// Referee Benefits
// ---------------------------------------------------------------------------

export interface RefereeBenefits {
  signupBonus: number;         // flat points on signup
  firstBetMultiplier: number;  // multiplier on first bet points
  maxStake: number;            // max stake eligible for first bet bonus
}

// ---------------------------------------------------------------------------
// Bonus Calculation Interfaces
// ---------------------------------------------------------------------------

export interface BonusContext {
  referrerAddress: string;
  referredLinks: Array<{
    referredAddress: string;
    status: string;
    lifetimeVolume: number;
    firstBetAt: string | null;
    lastBetAt: string | null;
    linkedAt: string;
  }>;
  periodId: number;
  tradingPointsByAddress: Map<string, number>;
  existingBonuses: number;
}

export interface BonusResult {
  totalBonus: number;
  breakdown: Array<{
    sourceAddress: string | null;
    bonusType: string;
    points: number;
    reason: string;
  }>;
}

// ---------------------------------------------------------------------------
// Leaderboard Types
// ---------------------------------------------------------------------------

export interface LeaderboardEntry {
  rank: number;
  address: string;
  tradingPoints: number;
  bonusPoints: number;
  totalPoints: number;
  referralCount: number;
}

// ---------------------------------------------------------------------------
// Validation Types
// ---------------------------------------------------------------------------

export interface ValidationError {
  field: string;
  message: string;
}
