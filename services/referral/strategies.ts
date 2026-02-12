/**
 * Referral Strategy Implementations
 *
 * Four configurable strategies that calculate bonus points for referrers.
 * All strategies implement the ReferralStrategy interface and wrap in
 * try/catch for graceful degradation (return 0 bonus on error).
 */

import type {
  BonusContext,
  BonusResult,
  GrowthMultiplierConfig,
  RevenueShareConfig,
  MilestoneQuestConfig,
  TeamVolumeConfig,
  StrategyType,
} from "./types";

// ---------------------------------------------------------------------------
// Strategy Interface
// ---------------------------------------------------------------------------

export interface ReferralStrategy {
  calculateBonus(context: BonusContext): Promise<BonusResult>;
}

// ---------------------------------------------------------------------------
// Growth Multiplier Strategy
//
// More active referrals = higher multiplier on your own trading points.
// Example: 5 active referrals = 1.5x multiplier on base points.
// ---------------------------------------------------------------------------

export class GrowthMultiplierStrategy implements ReferralStrategy {
  constructor(private config: GrowthMultiplierConfig) {}

  async calculateBonus(context: BonusContext): Promise<BonusResult> {
    try {
      const now = Date.now();
      const betWithinMs = this.config.activeDefinition.betWithinDays * 24 * 60 * 60 * 1000;

      // Count active referrals
      const activeReferrals = context.referredLinks.filter((link) => {
        if (link.status !== "active") return false;
        if (link.lifetimeVolume < this.config.activeDefinition.minLifetimeVolume) return false;
        if (!link.lastBetAt) return false;
        const lastBet = new Date(link.lastBetAt).getTime();
        return now - lastBet < betWithinMs;
      });

      const activeCount = activeReferrals.length;
      if (activeCount === 0) {
        return { totalBonus: 0, breakdown: [] };
      }

      // Find applicable tier (highest tier where referrals >= threshold)
      const sortedTiers = [...this.config.tiers].sort((a, b) => b.referrals - a.referrals);
      const tier = sortedTiers.find((t) => activeCount >= t.referrals);

      if (!tier) {
        return { totalBonus: 0, breakdown: [] };
      }

      // Get referrer's own trading points
      const referrerPoints = context.tradingPointsByAddress.get(context.referrerAddress) || 0;
      const bonusMultiplier = tier.multiplier - 1; // 1.5x -> 0.5 bonus
      const bonusPoints = Number((referrerPoints * bonusMultiplier).toFixed(2));

      if (bonusPoints <= 0) {
        return { totalBonus: 0, breakdown: [] };
      }

      return {
        totalBonus: bonusPoints,
        breakdown: [
          {
            sourceAddress: null,
            bonusType: "growth_multiplier",
            points: bonusPoints,
            reason: `${tier.multiplier}x multiplier (${activeCount} active referrals, tier ${tier.referrals}+)`,
          },
        ],
      };
    } catch (error) {
      console.error("[GrowthMultiplier] Error calculating bonus:", error);
      return { totalBonus: 0, breakdown: [] };
    }
  }
}

// ---------------------------------------------------------------------------
// Revenue Share Strategy
//
// Referrer earns a percentage of each referred user's trading points.
// Example: 15% share -> referred user earns 100pts -> referrer gets 15pts.
// ---------------------------------------------------------------------------

export class RevenueShareStrategy implements ReferralStrategy {
  constructor(private config: RevenueShareConfig) {}

  async calculateBonus(context: BonusContext): Promise<BonusResult> {
    try {
      const breakdown: BonusResult["breakdown"] = [];
      let totalBonus = 0;
      const now = Date.now();

      for (const link of context.referredLinks) {
        if (link.status !== "active") continue;

        // Check duration limit
        if (this.config.durationDays !== null) {
          const linkedTime = new Date(link.linkedAt).getTime();
          const expiryMs = this.config.durationDays * 24 * 60 * 60 * 1000;
          if (now - linkedTime > expiryMs) continue;
        }

        const referredPoints = context.tradingPointsByAddress.get(link.referredAddress) || 0;
        let sharePoints = Number((referredPoints * (this.config.sharePercentage / 100)).toFixed(2));

        // Cap per referral
        if (this.config.maxPerReferral > 0) {
          sharePoints = Math.min(sharePoints, this.config.maxPerReferral);
        }

        if (sharePoints > 0) {
          breakdown.push({
            sourceAddress: link.referredAddress,
            bonusType: "revenue_share",
            points: sharePoints,
            reason: `${this.config.sharePercentage}% of ${link.referredAddress.slice(0, 6)}...${link.referredAddress.slice(-4)}'s points`,
          });
          totalBonus += sharePoints;
        }
      }

      // Cap monthly total
      if (this.config.maxMonthlyTotal > 0) {
        const cappedTotal = Math.min(totalBonus, this.config.maxMonthlyTotal);
        if (cappedTotal < totalBonus) {
          const ratio = cappedTotal / totalBonus;
          for (const item of breakdown) {
            item.points = Number((item.points * ratio).toFixed(2));
          }
          totalBonus = cappedTotal;
        }
      }

      return { totalBonus: Number(totalBonus.toFixed(2)), breakdown };
    } catch (error) {
      console.error("[RevenueShare] Error calculating bonus:", error);
      return { totalBonus: 0, breakdown: [] };
    }
  }
}

// ---------------------------------------------------------------------------
// Milestone Quest Strategy
//
// Flat bonus awarded when referrals hit volume thresholds.
// Example: Signup = 25pts, First bet = 100pts, $50 volume = 200pts.
// Each milestone is awarded only once per referral.
// ---------------------------------------------------------------------------

export class MilestoneQuestStrategy implements ReferralStrategy {
  constructor(
    private config: MilestoneQuestConfig,
    private getCompletedMilestones: (address: string, periodId: number) => Promise<Set<string>>,
  ) {}

  async calculateBonus(context: BonusContext): Promise<BonusResult> {
    try {
      const breakdown: BonusResult["breakdown"] = [];
      let totalBonus = 0;

      // Check referrer milestones for each referred user
      const completedKeys = await this.getCompletedMilestones(context.referrerAddress, context.periodId);

      for (const link of context.referredLinks) {
        for (let i = 0; i < this.config.referrerMilestones.length; i++) {
          const milestone = this.config.referrerMilestones[i];
          const key = `referrer:${link.referredAddress}:${i}`;

          if (completedKeys.has(key)) continue;

          // Check if milestone is reached
          const reached =
            milestone.volume === 0
              ? true // signup milestone always reached
              : link.lifetimeVolume >= milestone.volume;

          if (reached) {
            breakdown.push({
              sourceAddress: link.referredAddress,
              bonusType: "milestone",
              points: milestone.reward,
              reason: `${milestone.label} (${link.referredAddress.slice(0, 6)}...${link.referredAddress.slice(-4)})`,
            });
            totalBonus += milestone.reward;
          }
        }
      }

      return { totalBonus: Number(totalBonus.toFixed(2)), breakdown };
    } catch (error) {
      console.error("[MilestoneQuest] Error calculating bonus:", error);
      return { totalBonus: 0, breakdown: [] };
    }
  }
}

// ---------------------------------------------------------------------------
// Team Volume Strategy
//
// Combined volume of all referrals determines a multiplier on own points.
// Example: Team volume > $2000/week = 1.25x multiplier.
// ---------------------------------------------------------------------------

export class TeamVolumeStrategy implements ReferralStrategy {
  constructor(private config: TeamVolumeConfig) {}

  async calculateBonus(context: BonusContext): Promise<BonusResult> {
    try {
      // Calculate team volume
      const teamVolume = context.referredLinks
        .filter((l) => l.status === "active")
        .reduce((sum, link) => sum + link.lifetimeVolume, 0);

      if (teamVolume === 0) {
        return { totalBonus: 0, breakdown: [] };
      }

      // Find applicable tier (highest tier where volume >= threshold)
      const sortedTiers = [...this.config.teamTiers].sort((a, b) => b.weeklyVolume - a.weeklyVolume);
      const tier = sortedTiers.find((t) => teamVolume >= t.weeklyVolume);

      if (!tier) {
        return { totalBonus: 0, breakdown: [] };
      }

      // Get referrer's own trading points
      const referrerPoints = context.tradingPointsByAddress.get(context.referrerAddress) || 0;
      const bonusMultiplier = tier.multiplier - 1;
      const bonusPoints = Number((referrerPoints * bonusMultiplier).toFixed(2));

      if (bonusPoints <= 0) {
        return { totalBonus: 0, breakdown: [] };
      }

      return {
        totalBonus: bonusPoints,
        breakdown: [
          {
            sourceAddress: null,
            bonusType: "team_volume",
            points: bonusPoints,
            reason: `${tier.multiplier}x team multiplier ($${teamVolume.toFixed(2)} combined volume)`,
          },
        ],
      };
    } catch (error) {
      console.error("[TeamVolume] Error calculating bonus:", error);
      return { totalBonus: 0, breakdown: [] };
    }
  }
}

// ---------------------------------------------------------------------------
// Strategy Factory
// ---------------------------------------------------------------------------

export function createStrategy(
  type: StrategyType,
  config: Record<string, unknown>,
  getCompletedMilestones?: (address: string, periodId: number) => Promise<Set<string>>,
): ReferralStrategy {
  switch (type) {
    case "growth_multiplier":
      return new GrowthMultiplierStrategy(config as unknown as GrowthMultiplierConfig);
    case "revenue_share":
      return new RevenueShareStrategy(config as unknown as RevenueShareConfig);
    case "milestone_quest":
      if (!getCompletedMilestones) {
        throw new Error("MilestoneQuestStrategy requires getCompletedMilestones callback");
      }
      return new MilestoneQuestStrategy(
        config as unknown as MilestoneQuestConfig,
        getCompletedMilestones,
      );
    case "team_volume":
      return new TeamVolumeStrategy(config as unknown as TeamVolumeConfig);
    default:
      throw new Error(`Unknown strategy type: ${type}`);
  }
}
