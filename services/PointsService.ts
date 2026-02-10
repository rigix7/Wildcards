/**
 * PointsService - Unified points system for Wildcards and PolyHouse
 *
 * Extracted from PolyHouse's server/routes.ts (fetchWildPointsFromPolymarket)
 * and server/storage.ts (referral methods). Both products use the exact same
 * points calculation: 1 USDC spent on BUY trades via Polymarket Activity API = 1 point.
 *
 * PolyHouse adds referral bonuses and admin-configurable naming/reset schedules.
 * This service unifies both under a single shared implementation.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PointsConfig {
  enabled: boolean;
  /** Display name for points (e.g. "WILD", "$TOKEN") */
  name: string;
  resetSchedule: "never" | "weekly" | "monthly" | "yearly";
  referralEnabled: boolean;
  /** Percentage of referred users' trading points awarded as bonus (0-100) */
  referralPercentage: number;
}

export interface PointsBreakdown {
  tradingPoints: number;
  referralBonus: number;
  total: number;
}

export interface ReferralStats {
  referralsCount: number;
  pointsEarned: number;
}

export interface ActivityResult {
  wildPoints: number;
  activityCount: number;
  success: boolean;
  /** True if results may be incomplete (hit API limit) */
  partial: boolean;
}

// ---------------------------------------------------------------------------
// Storage interface – callers provide their own persistence layer
// ---------------------------------------------------------------------------

export interface PointsStorage {
  /** Get the stored Safe address for an EOA, if known */
  getSafeAddress(eoaAddress: string): Promise<string | null>;
  /** Persist an EOA → Safe mapping */
  setSafeAddress(eoaAddress: string, safeAddress: string, isSafeDeployed: boolean): Promise<void>;
  /** Get referral stats for an address */
  getReferralStats(address: string): Promise<ReferralStats>;
  /** Persist Polymarket-derived trading points for referral calculations */
  updateStoredTradingPoints(address: string, points: number): Promise<void>;
  /** Set a referral code for an address */
  setReferralCode(address: string, code: string): Promise<void>;
  /** Apply another user's referral code */
  applyReferralCode(address: string, referrerCode: string): Promise<{ success: boolean; error?: string }>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACTIVITY_API_LIMIT = 1000;
const POLYMARKET_ACTIVITY_BASE = "https://data-api.polymarket.com/activity";

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class PointsService {
  constructor(
    private config: PointsConfig,
    private storage: PointsStorage,
  ) {}

  // -------------------------------------------------------------------------
  // Core: Fetch trading points from Polymarket Activity API
  // From PolyHouse server/routes.ts – fetchWildPointsFromPolymarket
  // -------------------------------------------------------------------------

  async calculateTradingPoints(safeAddress: string): Promise<ActivityResult> {
    if (!safeAddress) {
      return { wildPoints: 0, activityCount: 0, success: false, partial: false };
    }

    try {
      const url = `${POLYMARKET_ACTIVITY_BASE}?user=${safeAddress}&type=TRADE&sortBy=TIMESTAMP&sortDirection=DESC&limit=${ACTIVITY_API_LIMIT}`;
      const response = await fetch(url);

      if (!response.ok) {
        console.error(`[PointsService] Polymarket API returned ${response.status} for ${safeAddress}`);
        return { wildPoints: 0, activityCount: 0, success: false, partial: false };
      }

      const activities: Array<{ side?: string; usdcSize?: number }> = await response.json();

      let wildPoints = 0;
      for (const activity of activities) {
        // Only count BUY trades (when user spends USDC)
        if (activity.side === "BUY" && activity.usdcSize) {
          wildPoints += Math.floor(activity.usdcSize);
        }
      }

      const partial = activities.length >= ACTIVITY_API_LIMIT;

      if (partial) {
        console.warn(
          `[PointsService] Hit limit=${ACTIVITY_API_LIMIT} for ${safeAddress} – data may be incomplete`,
        );
      }

      console.log(
        `[PointsService] Calculated ${wildPoints} ${this.config.name} from ${activities.length} activities for ${safeAddress}${partial ? " (PARTIAL)" : ""}`,
      );

      return { wildPoints, activityCount: activities.length, success: true, partial };
    } catch (error) {
      console.error(`[PointsService] Failed to fetch activity for ${safeAddress}:`, error);
      return { wildPoints: 0, activityCount: 0, success: false, partial: false };
    }
  }

  // -------------------------------------------------------------------------
  // Referral bonus calculation
  // From PolyHouse server/storage.ts – getReferralStats
  // -------------------------------------------------------------------------

  async calculateReferralBonus(address: string): Promise<number> {
    if (!this.config.referralEnabled) return 0;

    try {
      const stats = await this.storage.getReferralStats(address);
      return stats.pointsEarned;
    } catch (error) {
      console.warn(`[PointsService] Failed to calculate referral bonus for ${address}:`, error);
      return 0;
    }
  }

  // -------------------------------------------------------------------------
  // Total points (trading + referral)
  // -------------------------------------------------------------------------

  async calculateTotalPoints(safeAddress: string, eoaAddress: string): Promise<PointsBreakdown> {
    const activityResult = await this.calculateTradingPoints(safeAddress);
    const tradingPoints = activityResult.wildPoints;

    // Persist trading points so referral calculations have up-to-date data
    if (activityResult.success) {
      try {
        await this.storage.updateStoredTradingPoints(eoaAddress, tradingPoints);
      } catch (err) {
        console.warn("[PointsService] Failed to persist trading points:", err);
      }
    }

    const referralBonus = await this.calculateReferralBonus(eoaAddress);

    return {
      tradingPoints,
      referralBonus,
      total: tradingPoints + referralBonus,
    };
  }

  // -------------------------------------------------------------------------
  // Referral code management (delegates to storage)
  // -------------------------------------------------------------------------

  async setReferralCode(address: string, code: string): Promise<void> {
    await this.storage.setReferralCode(address, code);
  }

  async applyReferralCode(address: string, referrerCode: string): Promise<{ success: boolean; error?: string }> {
    return this.storage.applyReferralCode(address, referrerCode);
  }

  async getReferralStats(address: string): Promise<ReferralStats> {
    return this.storage.getReferralStats(address);
  }

  // -------------------------------------------------------------------------
  // Safe address management (delegates to storage)
  // -------------------------------------------------------------------------

  async syncSafeAddress(eoaAddress: string, safeAddress: string, isSafeDeployed: boolean): Promise<void> {
    await this.storage.setSafeAddress(eoaAddress, safeAddress, isSafeDeployed);
  }
}
