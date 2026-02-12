/**
 * ReferralStorage – Drizzle ORM data access layer for the referral system
 *
 * Follows the pattern of DatabasePointsStorage. Uses the db import from db.ts
 * and interacts with the 4 new referral tables.
 */

import { eq, and, desc, sql, inArray, gt } from "drizzle-orm";
import { db } from "./db";
import {
  referralPeriods,
  referralLinks,
  referralBonuses,
  leaderboardArchives,
  walletRecords,
  type ReferralPeriod,
  type InsertReferralPeriod,
  type ReferralLink,
  type InsertReferralLink,
  type ReferralBonus,
  type InsertReferralBonus,
  type LeaderboardArchive,
  type InsertLeaderboardArchive,
} from "./schema";

// ---------------------------------------------------------------------------
// Period Operations
// ---------------------------------------------------------------------------

export class ReferralStorage {
  async createPeriod(data: InsertReferralPeriod): Promise<ReferralPeriod> {
    const now = new Date().toISOString();
    const [period] = await db
      .insert(referralPeriods)
      .values({
        ...data,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return period;
  }

  async getPeriod(id: number): Promise<ReferralPeriod | null> {
    const [period] = await db
      .select()
      .from(referralPeriods)
      .where(eq(referralPeriods.id, id))
      .limit(1);
    return period ?? null;
  }

  async getActivePeriod(): Promise<ReferralPeriod | null> {
    const [period] = await db
      .select()
      .from(referralPeriods)
      .where(eq(referralPeriods.status, "active"))
      .limit(1);
    return period ?? null;
  }

  async listPeriods(): Promise<ReferralPeriod[]> {
    return db
      .select()
      .from(referralPeriods)
      .orderBy(desc(referralPeriods.createdAt));
  }

  async updatePeriod(id: number, updates: Partial<ReferralPeriod>): Promise<ReferralPeriod> {
    const [period] = await db
      .update(referralPeriods)
      .set({
        ...updates,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(referralPeriods.id, id))
      .returning();
    return period;
  }

  async deletePeriod(id: number): Promise<boolean> {
    const result = await db
      .delete(referralPeriods)
      .where(and(eq(referralPeriods.id, id), eq(referralPeriods.status, "draft")));
    return (result.rowCount ?? 0) > 0;
  }

  // -----------------------------------------------------------------------
  // Link Operations
  // -----------------------------------------------------------------------

  async createLink(data: InsertReferralLink): Promise<ReferralLink> {
    const [link] = await db.insert(referralLinks).values(data).returning();
    return link;
  }

  async getLinksForReferrer(
    address: string,
    periodId: number,
    excludeExpiredDays?: number,
  ): Promise<ReferralLink[]> {
    const normalizedAddress = address.toLowerCase();
    let links = await db
      .select()
      .from(referralLinks)
      .where(
        and(
          eq(referralLinks.referrerAddress, normalizedAddress),
          eq(referralLinks.periodId, periodId),
        ),
      );

    // Rolling expiry: exclude old links
    if (excludeExpiredDays && excludeExpiredDays > 0) {
      const expiryMs = excludeExpiredDays * 24 * 60 * 60 * 1000;
      const now = Date.now();
      links = links.filter((link) => {
        const linkedTime = new Date(link.linkedAt).getTime();
        return now - linkedTime < expiryMs;
      });
    }

    return links;
  }

  async getLinkForReferred(address: string, periodId: number): Promise<ReferralLink | null> {
    const normalizedAddress = address.toLowerCase();
    const [link] = await db
      .select()
      .from(referralLinks)
      .where(
        and(
          eq(referralLinks.referredAddress, normalizedAddress),
          eq(referralLinks.periodId, periodId),
        ),
      )
      .limit(1);
    return link ?? null;
  }

  async getReferralCountByPeriod(address: string, periodId: number): Promise<number> {
    const normalizedAddress = address.toLowerCase();
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(referralLinks)
      .where(
        and(
          eq(referralLinks.referrerAddress, normalizedAddress),
          eq(referralLinks.periodId, periodId),
        ),
      );
    return result?.count ?? 0;
  }

  async updateLink(id: number, updates: Partial<ReferralLink>): Promise<ReferralLink> {
    const [link] = await db
      .update(referralLinks)
      .set(updates)
      .where(eq(referralLinks.id, id))
      .returning();
    return link;
  }

  async getLinksForPeriod(periodId: number): Promise<ReferralLink[]> {
    return db
      .select()
      .from(referralLinks)
      .where(eq(referralLinks.periodId, periodId));
  }

  // -----------------------------------------------------------------------
  // Bonus Operations
  // -----------------------------------------------------------------------

  async recordBonus(data: InsertReferralBonus): Promise<ReferralBonus> {
    const [bonus] = await db.insert(referralBonuses).values(data).returning();
    return bonus;
  }

  async recordBonusesBatch(data: InsertReferralBonus[]): Promise<ReferralBonus[]> {
    if (data.length === 0) return [];
    return db.insert(referralBonuses).values(data).returning();
  }

  async getBonusesForUser(address: string, periodId: number): Promise<ReferralBonus[]> {
    const normalizedAddress = address.toLowerCase();
    return db
      .select()
      .from(referralBonuses)
      .where(
        and(
          eq(referralBonuses.recipientAddress, normalizedAddress),
          eq(referralBonuses.periodId, periodId),
        ),
      )
      .orderBy(desc(referralBonuses.awardedAt));
  }

  async getTotalBonusForUser(address: string, periodId: number): Promise<number> {
    const normalizedAddress = address.toLowerCase();
    const [result] = await db
      .select({ total: sql<number>`COALESCE(SUM(${referralBonuses.points}), 0)` })
      .from(referralBonuses)
      .where(
        and(
          eq(referralBonuses.recipientAddress, normalizedAddress),
          eq(referralBonuses.periodId, periodId),
        ),
      );
    return result?.total ?? 0;
  }

  async getCompletedMilestoneKeys(address: string, periodId: number): Promise<Set<string>> {
    const normalizedAddress = address.toLowerCase();
    const bonuses = await db
      .select()
      .from(referralBonuses)
      .where(
        and(
          eq(referralBonuses.recipientAddress, normalizedAddress),
          eq(referralBonuses.periodId, periodId),
          eq(referralBonuses.bonusType, "milestone"),
        ),
      );

    const keys = new Set<string>();
    for (const bonus of bonuses) {
      const meta = bonus.metadata as Record<string, unknown> | null;
      if (meta?.milestoneKey) {
        keys.add(meta.milestoneKey as string);
      }
    }
    return keys;
  }

  async getBonusCountForPeriod(periodId: number): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(distinct ${referralBonuses.recipientAddress})::int` })
      .from(referralBonuses)
      .where(eq(referralBonuses.periodId, periodId));
    return result?.count ?? 0;
  }

  // -----------------------------------------------------------------------
  // Leaderboard
  // -----------------------------------------------------------------------

  async getLeaderboard(
    periodId: number,
    limit: number = 100,
  ): Promise<
    Array<{
      address: string;
      referralCount: number;
      totalBonus: number;
      tradingPoints: number;
    }>
  > {
    // Get all referrers with their referral counts for this period
    const referrerStats = await db
      .select({
        address: referralLinks.referrerAddress,
        referralCount: sql<number>`count(*)::int`,
      })
      .from(referralLinks)
      .where(eq(referralLinks.periodId, periodId))
      .groupBy(referralLinks.referrerAddress);

    // Get all bonus totals by user for this period
    const bonusStats = await db
      .select({
        address: referralBonuses.recipientAddress,
        totalBonus: sql<number>`COALESCE(SUM(${referralBonuses.points}), 0)`,
      })
      .from(referralBonuses)
      .where(eq(referralBonuses.periodId, periodId))
      .groupBy(referralBonuses.recipientAddress);

    // Build a map of all addresses
    const addressMap = new Map<
      string,
      { referralCount: number; totalBonus: number; tradingPoints: number }
    >();

    for (const r of referrerStats) {
      const entry = addressMap.get(r.address) || { referralCount: 0, totalBonus: 0, tradingPoints: 0 };
      entry.referralCount = r.referralCount;
      addressMap.set(r.address, entry);
    }

    for (const b of bonusStats) {
      const entry = addressMap.get(b.address) || { referralCount: 0, totalBonus: 0, tradingPoints: 0 };
      entry.totalBonus = Number(b.totalBonus);
      addressMap.set(b.address, entry);
    }

    // Get trading points for all addresses
    const addresses = Array.from(addressMap.keys());
    if (addresses.length > 0) {
      const tradingData = await this.getTradingPointsForAddresses(addresses);
      for (const [addr, pts] of tradingData) {
        const entry = addressMap.get(addr);
        if (entry) entry.tradingPoints = pts;
      }
    }

    // Sort by total (trading + bonus) descending, limit
    return Array.from(addressMap.entries())
      .map(([address, stats]) => ({ address, ...stats }))
      .sort((a, b) => (b.tradingPoints + b.totalBonus) - (a.tradingPoints + a.totalBonus))
      .slice(0, limit);
  }

  // -----------------------------------------------------------------------
  // Trading Points Helper
  // -----------------------------------------------------------------------

  async getTradingPointsForAddresses(addresses: string[]): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (addresses.length === 0) return result;

    const records = await db
      .select({
        address: walletRecords.address,
        wildPoints: walletRecords.wildPoints,
      })
      .from(walletRecords)
      .where(inArray(walletRecords.address, addresses.map((a) => a.toLowerCase())));

    for (const r of records) {
      result.set(r.address, r.wildPoints || 0);
    }

    return result;
  }

  // -----------------------------------------------------------------------
  // Archive Operations
  // -----------------------------------------------------------------------

  async createArchive(data: {
    periodId: number;
    periodStart: string;
    periodEnd: string;
    resetMode: string;
    rankings: Array<{ rank: number; address: string; points: number; referrals: number; bonusPoints: number }>;
    stats: { totalUsers: number; totalReferrals: number; totalBonusAwarded: number; topReferrer?: string };
  }): Promise<LeaderboardArchive> {
    const now = new Date().toISOString();
    const [archive] = await db
      .insert(leaderboardArchives)
      .values({
        periodId: data.periodId,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        resetMode: data.resetMode,
        rankings: data.rankings,
        stats: data.stats,
        createdAt: now,
      } as typeof leaderboardArchives.$inferInsert)
      .returning();
    return archive;
  }

  async getArchives(): Promise<LeaderboardArchive[]> {
    return db
      .select()
      .from(leaderboardArchives)
      .orderBy(desc(leaderboardArchives.createdAt));
  }

  async getArchiveByPeriod(periodId: number): Promise<LeaderboardArchive | null> {
    const [archive] = await db
      .select()
      .from(leaderboardArchives)
      .where(eq(leaderboardArchives.periodId, periodId))
      .limit(1);
    return archive ?? null;
  }
}
