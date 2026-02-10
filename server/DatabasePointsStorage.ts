/**
 * DatabasePointsStorage – Drizzle ORM implementation of the PointsStorage interface
 *
 * Extracted from PolyHouse's server/storage.ts. Each method maps to an existing
 * PolyHouse DatabaseStorage method:
 *
 *   getSafeAddress            ← getWalletRecord (read safeAddress field)
 *   setSafeAddress            ← updateWalletSafeStatus
 *   getReferralStats          ← getReferralStats (queries DB for referral %)
 *   updateStoredTradingPoints ← updateStoredWildPoints
 *   setReferralCode           ← setReferralCode
 *   applyReferralCode         ← applyReferralCode
 *
 * All configuration (points name, referral %, enabled state) is read dynamically
 * from the white_label_config table – no hardcoded values.
 */

import { eq } from "drizzle-orm";
import type { PointsStorage, ReferralStats } from "../services/PointsService";

import { db } from "./db";
import { walletRecords, whiteLabelConfig } from "./schema";

// ---------------------------------------------------------------------------
// Types for the white-label config row (mirrors PolyHouse shared/schema.ts)
// ---------------------------------------------------------------------------

interface StoredPointsConfig {
  enabled?: boolean;
  name?: string;
  resetSchedule?: string;
  referralEnabled?: boolean;
  referralPercentage?: number;
}

interface WhiteLabelRow {
  id: number;
  pointsConfig?: StoredPointsConfig | null;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class DatabasePointsStorage implements PointsStorage {
  constructor() {}

  // -----------------------------------------------------------------------
  // White-label config (public – used by points-routes to get current config)
  // -----------------------------------------------------------------------

  async getWhiteLabelConfig(): Promise<WhiteLabelRow | null> {
    const [config] = await db
      .select()
      .from(whiteLabelConfig)
      .limit(1);

    return (config as WhiteLabelRow) ?? null;
  }

  // -----------------------------------------------------------------------
  // Safe address
  // -----------------------------------------------------------------------

  async getSafeAddress(eoaAddress: string): Promise<string | null> {
    const normalizedAddress = eoaAddress.toLowerCase();

    const [record] = await db
      .select()
      .from(walletRecords)
      .where(eq(walletRecords.address, normalizedAddress))
      .limit(1);

    return record?.safeAddress ?? null;
  }

  async setSafeAddress(
    eoaAddress: string,
    safeAddress: string,
    isSafeDeployed: boolean,
  ): Promise<void> {
    const normalizedAddress = eoaAddress.toLowerCase();
    const normalizedSafe = safeAddress.toLowerCase();

    // Ensure wallet record exists (upsert pattern from PolyHouse)
    await this.getOrCreateWalletRecord(normalizedAddress);

    await db
      .update(walletRecords)
      .set({
        safeAddress: normalizedSafe,
        isSafeDeployed,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(walletRecords.address, normalizedAddress));
  }

  // -----------------------------------------------------------------------
  // Referrals
  // From PolyHouse server/storage.ts – getReferralStats, setReferralCode,
  // applyReferralCode
  // -----------------------------------------------------------------------

  async getReferralStats(address: string): Promise<ReferralStats> {
    const normalizedAddress = address.toLowerCase();

    // Get all users referred by this address
    const referrals = await db
      .select()
      .from(walletRecords)
      .where(eq(walletRecords.referredBy, normalizedAddress));

    // Query referral percentage from white-label config in database
    const wlConfig = await this.getWhiteLabelConfig();

    if (!wlConfig?.pointsConfig?.referralEnabled) {
      return {
        referralsCount: referrals.length,
        pointsEarned: 0,
      };
    }

    const percentage = wlConfig.pointsConfig.referralPercentage;

    if (!percentage || percentage === 0) {
      console.warn("[PointsStorage] Referral percentage not configured in admin panel");
      return {
        referralsCount: referrals.length,
        pointsEarned: 0,
      };
    }

    // Calculate referral points as percentage of referred users' stored points
    const totalReferredPoints = referrals.reduce(
      (sum, r) => sum + (r.wildPoints || 0),
      0,
    );
    const pointsEarned = Math.floor(
      totalReferredPoints * (percentage / 100),
    );

    return {
      referralsCount: referrals.length,
      pointsEarned,
    };
  }

  async setReferralCode(address: string, code: string): Promise<void> {
    const normalizedAddress = address.toLowerCase();
    const normalizedCode = code.toUpperCase();

    // Ensure wallet record exists
    await this.getOrCreateWalletRecord(normalizedAddress);

    // Check if code is already taken by another user
    const [existing] = await db
      .select()
      .from(walletRecords)
      .where(eq(walletRecords.referralCode, normalizedCode))
      .limit(1);

    if (existing && existing.address !== normalizedAddress) {
      throw new Error("Referral code already taken");
    }

    await db
      .update(walletRecords)
      .set({
        referralCode: normalizedCode,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(walletRecords.address, normalizedAddress));
  }

  async applyReferralCode(
    address: string,
    referrerCode: string,
  ): Promise<{ success: boolean; error?: string }> {
    const normalizedAddress = address.toLowerCase();
    const code = referrerCode.toUpperCase();

    // Get user record
    const [user] = await db
      .select()
      .from(walletRecords)
      .where(eq(walletRecords.address, normalizedAddress))
      .limit(1);

    if (!user) {
      return { success: false, error: "Wallet not found" };
    }

    // Check if already referred
    if (user.referredBy) {
      return { success: false, error: "You already have a referrer" };
    }

    // Find referrer by code
    const [referrer] = await db
      .select()
      .from(walletRecords)
      .where(eq(walletRecords.referralCode, code))
      .limit(1);

    if (!referrer) {
      return { success: false, error: "Invalid referral code" };
    }

    // Prevent self-referral
    if (referrer.address === normalizedAddress) {
      return { success: false, error: "Cannot use your own referral code" };
    }

    // Apply referral
    await db
      .update(walletRecords)
      .set({
        referredBy: referrer.address,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(walletRecords.address, normalizedAddress));

    return { success: true };
  }

  // -----------------------------------------------------------------------
  // Points persistence
  // From PolyHouse server/storage.ts – updateStoredWildPoints
  // -----------------------------------------------------------------------

  async updateStoredTradingPoints(
    address: string,
    points: number,
  ): Promise<void> {
    const normalizedAddress = address.toLowerCase();

    // Ensure wallet record exists before updating
    await this.getOrCreateWalletRecord(normalizedAddress);

    await db
      .update(walletRecords)
      .set({
        wildPoints: points,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(walletRecords.address, normalizedAddress));
  }

  // -----------------------------------------------------------------------
  // Internal helper – mirrors PolyHouse's getOrCreateWalletRecord
  // -----------------------------------------------------------------------

  private async getOrCreateWalletRecord(normalizedAddress: string) {
    const [existing] = await db
      .select()
      .from(walletRecords)
      .where(eq(walletRecords.address, normalizedAddress))
      .limit(1);

    if (existing) return existing;

    const now = new Date().toISOString();
    const [created] = await db
      .insert(walletRecords)
      .values({
        address: normalizedAddress,
        wildPoints: 0,
        totalBetAmount: 0,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return created;
  }
}
