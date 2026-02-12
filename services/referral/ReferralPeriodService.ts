/**
 * ReferralPeriodService – Core orchestration for the referral system
 *
 * Manages period lifecycle, referral link creation, bonus calculations,
 * and leaderboard aggregation. Delegates to strategy implementations.
 */

import { customAlphabet } from "nanoid";
import { ReferralStorage } from "../../server/ReferralStorage";
import { createStrategy } from "./strategies";
import type {
  StrategyType,
  BonusContext,
  BonusResult,
  LeaderboardEntry,
  ValidationError,
  GrowthMultiplierConfig,
  RevenueShareConfig,
  MilestoneQuestConfig,
  TeamVolumeConfig,
  ResetConfig,
} from "./types";
import type {
  ReferralPeriod,
  ReferralLink,
  ReferralBonus,
  LeaderboardArchive,
} from "../../shared/schema";

// 8-char alphanumeric code (excludes ambiguous chars: 0/O, 1/I/L)
const generateCode = customAlphabet("ABCDEFGHJKMNPQRSTUVWXYZ23456789", 8);

export class ReferralPeriodService {
  private storage: ReferralStorage;

  constructor(storage?: ReferralStorage) {
    this.storage = storage || new ReferralStorage();
  }

  // -----------------------------------------------------------------------
  // Period Lifecycle
  // -----------------------------------------------------------------------

  async createPeriod(input: {
    name: string;
    strategy: StrategyType;
    strategyConfig: Record<string, unknown>;
    resetMode?: string;
    resetConfig?: Record<string, unknown>;
    refereeBenefits?: { signupBonus: number; firstBetMultiplier: number; maxStake: number };
    startsAt: string;
    endsAt?: string;
  }): Promise<ReferralPeriod> {
    // Validate strategy config
    const errors = validateStrategyConfig(input.strategy, input.strategyConfig);
    if (errors.length > 0) {
      throw new Error(`Invalid config: ${errors.map((e) => e.message).join(", ")}`);
    }

    return this.storage.createPeriod({
      name: input.name,
      strategy: input.strategy,
      strategyConfig: input.strategyConfig,
      resetMode: input.resetMode || "manual",
      resetConfig: input.resetConfig || {},
      refereeBenefits: input.refereeBenefits || { signupBonus: 100, firstBetMultiplier: 2.0, maxStake: 10 },
      status: "draft",
      startsAt: input.startsAt,
      endsAt: input.endsAt || null,
    });
  }

  async activatePeriod(periodId: number): Promise<ReferralPeriod> {
    const period = await this.storage.getPeriod(periodId);
    if (!period) throw new Error("Period not found");
    if (period.status !== "draft") throw new Error("Only draft periods can be activated");

    // Check no other active period exists
    const activePeriod = await this.storage.getActivePeriod();
    if (activePeriod) {
      throw new Error(`Another period is already active: "${activePeriod.name}" (ID: ${activePeriod.id})`);
    }

    // Validate config before activation
    const errors = validateStrategyConfig(
      period.strategy as StrategyType,
      period.strategyConfig as Record<string, unknown>,
    );
    if (errors.length > 0) {
      throw new Error(`Cannot activate - invalid config: ${errors.map((e) => e.message).join(", ")}`);
    }

    return this.storage.updatePeriod(periodId, {
      status: "active",
      startsAt: new Date().toISOString(),
    });
  }

  async completePeriod(periodId: number): Promise<ReferralPeriod> {
    const period = await this.storage.getPeriod(periodId);
    if (!period) throw new Error("Period not found");
    if (period.status !== "active") throw new Error("Only active periods can be completed");

    // Archive before completing
    await this.archivePeriod(periodId);

    return this.storage.updatePeriod(periodId, {
      status: "completed",
      completedAt: new Date().toISOString(),
    });
  }

  async cancelPeriod(periodId: number): Promise<ReferralPeriod> {
    const period = await this.storage.getPeriod(periodId);
    if (!period) throw new Error("Period not found");
    if (period.status === "completed" || period.status === "cancelled") {
      throw new Error("Cannot cancel a completed or already cancelled period");
    }

    return this.storage.updatePeriod(periodId, {
      status: "cancelled",
      completedAt: new Date().toISOString(),
    });
  }

  async getActivePeriod(): Promise<ReferralPeriod | null> {
    return this.storage.getActivePeriod();
  }

  async listPeriods(): Promise<ReferralPeriod[]> {
    return this.storage.listPeriods();
  }

  async getPeriod(id: number): Promise<ReferralPeriod | null> {
    return this.storage.getPeriod(id);
  }

  async updatePeriod(
    periodId: number,
    updates: {
      name?: string;
      strategy?: StrategyType;
      strategyConfig?: Record<string, unknown>;
      resetMode?: string;
      resetConfig?: Record<string, unknown>;
      refereeBenefits?: { signupBonus: number; firstBetMultiplier: number; maxStake: number };
      startsAt?: string;
      endsAt?: string;
    },
  ): Promise<ReferralPeriod> {
    const period = await this.storage.getPeriod(periodId);
    if (!period) throw new Error("Period not found");
    if (period.status !== "draft") {
      throw new Error("Only draft periods can be modified");
    }

    // Validate if strategy config is being updated
    if (updates.strategyConfig) {
      const strategy = (updates.strategy || period.strategy) as StrategyType;
      const errors = validateStrategyConfig(strategy, updates.strategyConfig);
      if (errors.length > 0) {
        throw new Error(`Invalid config: ${errors.map((e) => e.message).join(", ")}`);
      }
    }

    return this.storage.updatePeriod(periodId, updates);
  }

  async deletePeriod(periodId: number): Promise<boolean> {
    return this.storage.deletePeriod(periodId);
  }

  // -----------------------------------------------------------------------
  // Ground Rules - Can Modify Period
  // -----------------------------------------------------------------------

  async canModifyPeriod(periodId: number): Promise<{ allowed: boolean; reason?: string }> {
    const period = await this.storage.getPeriod(periodId);
    if (!period) return { allowed: false, reason: "Period not found" };

    if (period.status === "completed" || period.status === "cancelled") {
      return { allowed: false, reason: "Completed/cancelled periods cannot be modified" };
    }

    if (period.status === "active") {
      const bonusCount = await this.storage.getBonusCountForPeriod(periodId);
      if (bonusCount > 10) {
        return {
          allowed: false,
          reason: `${bonusCount} users have active bonuses. Complete this period and start a new one.`,
        };
      }
    }

    return { allowed: true };
  }

  // -----------------------------------------------------------------------
  // Referral Operations
  // -----------------------------------------------------------------------

  async generateReferralCode(): Promise<string> {
    return generateCode();
  }

  async createReferralLink(
    periodId: number,
    referrerAddress: string,
    referredAddress: string,
    referralCode: string,
  ): Promise<ReferralLink> {
    const normalized = {
      referrer: referrerAddress.toLowerCase(),
      referred: referredAddress.toLowerCase(),
    };

    // Self-referral check
    if (normalized.referrer === normalized.referred) {
      throw new Error("Cannot refer yourself");
    }

    // Check if already referred in this period
    const existing = await this.storage.getLinkForReferred(normalized.referred, periodId);
    if (existing) {
      throw new Error("User already has a referrer in this period");
    }

    return this.storage.createLink({
      periodId,
      referrerAddress: normalized.referrer,
      referredAddress: normalized.referred,
      referralCode,
      status: "pending",
      linkedAt: new Date().toISOString(),
    });
  }

  async getReferralsForUser(
    address: string,
    periodId?: number,
  ): Promise<ReferralLink[]> {
    if (periodId) {
      return this.storage.getLinksForReferrer(address, periodId);
    }
    // If no period specified, get from active period
    const active = await this.storage.getActivePeriod();
    if (!active) return [];
    return this.storage.getLinksForReferrer(address, active.id);
  }

  // -----------------------------------------------------------------------
  // Bet Tracking
  // -----------------------------------------------------------------------

  async trackBet(referredAddress: string, betAmount: number): Promise<void> {
    try {
      const activePeriod = await this.storage.getActivePeriod();
      if (!activePeriod) return;

      const link = await this.storage.getLinkForReferred(referredAddress, activePeriod.id);
      if (!link) return;

      const updates: Partial<ReferralLink> = {
        lastBetAt: new Date().toISOString(),
        lifetimeVolume: (link.lifetimeVolume || 0) + betAmount,
      };

      if (!link.firstBetAt) {
        updates.firstBetAt = new Date().toISOString();
        updates.status = "active";
      }

      await this.storage.updateLink(link.id, updates);
    } catch (error) {
      console.error("[ReferralPeriodService] Error tracking bet:", error);
      // Silent failure - never break the bet flow
    }
  }

  // -----------------------------------------------------------------------
  // Bonus Calculation
  // -----------------------------------------------------------------------

  async calculateBonusForUser(
    address: string,
    periodId: number,
  ): Promise<BonusResult> {
    try {
      const period = await this.storage.getPeriod(periodId);
      if (!period || period.status !== "active") {
        return { totalBonus: 0, breakdown: [] };
      }

      const strategyType = period.strategy as StrategyType;
      const strategyConfig = period.strategyConfig as Record<string, unknown>;
      const resetConfig = period.resetConfig as Record<string, unknown>;

      // Get rolling expiry window if applicable
      const rollingDays =
        period.resetMode === "rolling_expiry" && resetConfig?.rolling
          ? (resetConfig.rolling as { windowDays: number }).windowDays
          : undefined;

      // Get referral links
      const links = await this.storage.getLinksForReferrer(address, periodId, rollingDays);
      if (links.length === 0) {
        return { totalBonus: 0, breakdown: [] };
      }

      // Get trading points for all involved addresses
      const allAddresses = [address, ...links.map((l) => l.referredAddress)];
      const tradingPoints = await this.storage.getTradingPointsForAddresses(allAddresses);

      // Get existing bonuses
      const existingBonuses = await this.storage.getTotalBonusForUser(address, periodId);

      // Build context
      const context: BonusContext = {
        referrerAddress: address.toLowerCase(),
        referredLinks: links.map((l) => ({
          referredAddress: l.referredAddress,
          status: l.status,
          lifetimeVolume: l.lifetimeVolume || 0,
          firstBetAt: l.firstBetAt,
          lastBetAt: l.lastBetAt,
          linkedAt: l.linkedAt,
        })),
        periodId,
        tradingPointsByAddress: tradingPoints,
        existingBonuses,
      };

      // Create strategy and calculate
      const getCompletedMilestones = async (addr: string, pId: number) =>
        this.storage.getCompletedMilestoneKeys(addr, pId);

      const strategy = createStrategy(strategyType, strategyConfig, getCompletedMilestones);
      return strategy.calculateBonus(context);
    } catch (error) {
      console.error("[ReferralPeriodService] Error calculating bonus:", error);
      return { totalBonus: 0, breakdown: [] };
    }
  }

  // -----------------------------------------------------------------------
  // Leaderboard
  // -----------------------------------------------------------------------

  async getLeaderboard(periodId: number, limit: number = 100): Promise<LeaderboardEntry[]> {
    const raw = await this.storage.getLeaderboard(periodId, limit);
    return raw.map((entry, index) => ({
      rank: index + 1,
      address: entry.address,
      tradingPoints: entry.tradingPoints,
      bonusPoints: entry.totalBonus,
      totalPoints: entry.tradingPoints + entry.totalBonus,
      referralCount: entry.referralCount,
    }));
  }

  // -----------------------------------------------------------------------
  // Archiving
  // -----------------------------------------------------------------------

  async archivePeriod(periodId: number): Promise<LeaderboardArchive> {
    const period = await this.storage.getPeriod(periodId);
    if (!period) throw new Error("Period not found");

    const leaderboard = await this.getLeaderboard(periodId, 1000);

    const rankings = leaderboard.map((entry) => ({
      rank: entry.rank,
      address: entry.address,
      points: entry.totalPoints,
      referrals: entry.referralCount,
      bonusPoints: entry.bonusPoints,
    }));

    const totalReferrals = rankings.reduce((sum, r) => sum + r.referrals, 0);
    const totalBonusAwarded = rankings.reduce((sum, r) => sum + r.bonusPoints, 0);

    return this.storage.createArchive({
      periodId,
      periodStart: period.startsAt,
      periodEnd: new Date().toISOString(),
      resetMode: period.resetMode,
      rankings,
      stats: {
        totalUsers: rankings.length,
        totalReferrals,
        totalBonusAwarded,
        topReferrer: rankings.length > 0 ? rankings[0].address : undefined,
      },
    });
  }

  async getArchives(): Promise<LeaderboardArchive[]> {
    return this.storage.getArchives();
  }

  // -----------------------------------------------------------------------
  // Manual Reset
  // -----------------------------------------------------------------------

  async manualReset(
    currentPeriodId: number,
    createNewPeriod: boolean = true,
  ): Promise<{ completed: ReferralPeriod; newPeriod?: ReferralPeriod }> {
    const completed = await this.completePeriod(currentPeriodId);

    if (createNewPeriod) {
      const newPeriod = await this.createPeriod({
        name: `${completed.name} (continued)`,
        strategy: completed.strategy as StrategyType,
        strategyConfig: completed.strategyConfig as Record<string, unknown>,
        resetMode: completed.resetMode,
        resetConfig: completed.resetConfig as Record<string, unknown>,
        startsAt: new Date().toISOString(),
        endsAt: completed.endsAt || undefined,
      });
      return { completed, newPeriod };
    }

    return { completed };
  }
}

// ---------------------------------------------------------------------------
// Strategy Config Validation
// ---------------------------------------------------------------------------

export function validateStrategyConfig(
  strategy: StrategyType,
  config: Record<string, unknown>,
): ValidationError[] {
  const errors: ValidationError[] = [];

  switch (strategy) {
    case "growth_multiplier": {
      const c = config as unknown as GrowthMultiplierConfig;
      if (!c.tiers || !Array.isArray(c.tiers) || c.tiers.length === 0) {
        errors.push({ field: "tiers", message: "Growth Multiplier requires at least one tier" });
        break;
      }
      for (let i = 0; i < c.tiers.length; i++) {
        const tier = c.tiers[i];
        if (typeof tier.referrals !== "number" || tier.referrals < 0) {
          errors.push({ field: `tiers[${i}].referrals`, message: "Referral count must be non-negative" });
        }
        if (typeof tier.multiplier !== "number" || tier.multiplier < 1.0 || tier.multiplier > 5.0) {
          errors.push({ field: `tiers[${i}].multiplier`, message: "Multiplier must be 1.0-5.0x" });
        }
        if (i > 0 && tier.referrals <= c.tiers[i - 1].referrals) {
          errors.push({ field: `tiers[${i}].referrals`, message: "Referral counts must be ascending" });
        }
        if (i > 0 && tier.multiplier <= c.tiers[i - 1].multiplier) {
          errors.push({ field: `tiers[${i}].multiplier`, message: "Multipliers must be ascending" });
        }
      }
      if (!c.activeDefinition || typeof c.activeDefinition.betWithinDays !== "number") {
        errors.push({ field: "activeDefinition", message: "Active definition with betWithinDays is required" });
      }
      break;
    }

    case "revenue_share": {
      const c = config as unknown as RevenueShareConfig;
      if (typeof c.sharePercentage !== "number" || c.sharePercentage < 0 || c.sharePercentage > 50) {
        errors.push({ field: "sharePercentage", message: "Revenue share must be 0-50%" });
      }
      break;
    }

    case "milestone_quest": {
      const c = config as unknown as MilestoneQuestConfig;
      if (!c.referrerMilestones || !Array.isArray(c.referrerMilestones) || c.referrerMilestones.length === 0) {
        errors.push({ field: "referrerMilestones", message: "At least one referrer milestone required" });
        break;
      }
      for (let i = 0; i < c.referrerMilestones.length; i++) {
        const m = c.referrerMilestones[i];
        if (typeof m.volume !== "number" || m.volume < 0) {
          errors.push({ field: `referrerMilestones[${i}].volume`, message: "Volume must be non-negative" });
        }
        if (typeof m.reward !== "number" || m.reward <= 0) {
          errors.push({ field: `referrerMilestones[${i}].reward`, message: "Reward must be positive" });
        }
        if (i > 0 && m.volume <= c.referrerMilestones[i - 1].volume) {
          errors.push({ field: `referrerMilestones[${i}].volume`, message: "Volume thresholds must be ascending" });
        }
      }
      break;
    }

    case "team_volume": {
      const c = config as unknown as TeamVolumeConfig;
      if (!c.teamTiers || !Array.isArray(c.teamTiers) || c.teamTiers.length === 0) {
        errors.push({ field: "teamTiers", message: "Team Volume requires at least one tier" });
        break;
      }
      for (let i = 0; i < c.teamTiers.length; i++) {
        const tier = c.teamTiers[i];
        if (typeof tier.weeklyVolume !== "number" || tier.weeklyVolume <= 0) {
          errors.push({ field: `teamTiers[${i}].weeklyVolume`, message: "Volume must be positive" });
        }
        if (typeof tier.multiplier !== "number" || tier.multiplier < 1.0 || tier.multiplier > 5.0) {
          errors.push({ field: `teamTiers[${i}].multiplier`, message: "Multiplier must be 1.0-5.0x" });
        }
        if (i > 0 && tier.weeklyVolume <= c.teamTiers[i - 1].weeklyVolume) {
          errors.push({ field: `teamTiers[${i}].weeklyVolume`, message: "Volume thresholds must be ascending" });
        }
      }
      break;
    }

    default:
      errors.push({ field: "strategy", message: `Unknown strategy type: ${strategy}` });
  }

  return errors;
}
