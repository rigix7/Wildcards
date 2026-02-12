/**
 * referral-routes – Express API endpoints for the referral system
 *
 * Public endpoints:
 *   GET  /api/referral/active-period          – Current active period info
 *   GET  /api/referral/my-code/:address       – Get/generate user's referral code
 *   POST /api/referral/track-signup           – Apply referral code
 *   GET  /api/referral/:address/bonus         – Bonus breakdown for user
 *   GET  /api/referral/:address/referrals     – Users referred by address
 *   GET  /api/referral/leaderboard            – Active period leaderboard
 *   GET  /api/referral/leaderboard/:periodId  – Specific period leaderboard
 *   GET  /api/referral/archives               – Historical archives
 *
 * Admin endpoints (behind requireAdminAuth):
 *   POST   /api/admin/referral/periods             – Create period
 *   GET    /api/admin/referral/periods             – List periods
 *   GET    /api/admin/referral/periods/:id         – Get period
 *   PATCH  /api/admin/referral/periods/:id         – Update draft period
 *   PATCH  /api/admin/referral/periods/:id/activate – Activate period
 *   PATCH  /api/admin/referral/periods/:id/complete – Complete period
 *   DELETE /api/admin/referral/periods/:id         – Delete draft period
 *   POST   /api/admin/referral/reset              – Manual reset
 */

import type { Express, Request, Response } from "express";
import { requireAdminAuth } from "./admin-routes";
import { ReferralPeriodService } from "../services/referral/ReferralPeriodService";
import { ReferralStorage } from "./ReferralStorage";
import { DatabasePointsStorage } from "./DatabasePointsStorage";
import type { StrategyType } from "../services/referral/types";

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function isValidAddress(value: unknown): value is string {
  return typeof value === "string" && ADDRESS_RE.test(value);
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerReferralRoutes(app: Express): void {
  const storage = new ReferralStorage();
  const pointsStorage = new DatabasePointsStorage();
  const service = new ReferralPeriodService(storage);

  // =======================================================================
  // PUBLIC ENDPOINTS
  // =======================================================================

  // -----------------------------------------------------------------------
  // GET /api/referral/active-period
  // -----------------------------------------------------------------------
  app.get("/api/referral/active-period", async (_req: Request, res: Response) => {
    try {
      const period = await service.getActivePeriod();
      if (!period) {
        return res.json({ active: false, period: null });
      }

      res.json({
        active: true,
        period: {
          id: period.id,
          name: period.name,
          strategy: period.strategy,
          resetMode: period.resetMode,
          startsAt: period.startsAt,
          endsAt: period.endsAt,
          refereeBenefits: period.refereeBenefits,
        },
      });
    } catch (error) {
      console.error("[ReferralRoutes] Failed to get active period:", error);
      res.status(500).json({ error: "Failed to get active period" });
    }
  });

  // -----------------------------------------------------------------------
  // GET /api/referral/my-code/:address
  // -----------------------------------------------------------------------
  app.get("/api/referral/my-code/:address", async (req: Request, res: Response) => {
    try {
      const { address } = req.params;
      if (!isValidAddress(address)) {
        return res.status(400).json({ error: "Valid Ethereum address required" });
      }

      const normalizedAddress = address.toLowerCase();

      // Check if user already has a code in walletRecords
      const wlConfig = await pointsStorage.getWhiteLabelConfig();
      const existingRecord = await getWalletReferralCode(normalizedAddress);

      if (existingRecord) {
        const referralCount = await storage.getReferralCountByPeriod(
          normalizedAddress,
          (await service.getActivePeriod())?.id || 0,
        );
        return res.json({
          code: existingRecord,
          referralCount,
          shareUrl: `${req.protocol}://${req.get("host")}?ref=${existingRecord}`,
        });
      }

      // Generate new code
      const code = await service.generateReferralCode();

      // Store in walletRecords for compatibility
      try {
        await pointsStorage.setReferralCode(normalizedAddress, code);
      } catch (err) {
        // Code collision or already has a code - fetch the existing one
        const existing = await getWalletReferralCode(normalizedAddress);
        if (existing) {
          return res.json({
            code: existing,
            referralCount: 0,
            shareUrl: `${req.protocol}://${req.get("host")}?ref=${existing}`,
          });
        }
      }

      res.json({
        code,
        referralCount: 0,
        shareUrl: `${req.protocol}://${req.get("host")}?ref=${code}`,
      });
    } catch (error) {
      console.error("[ReferralRoutes] Failed to get referral code:", error);
      res.status(500).json({ error: "Failed to get referral code" });
    }
  });

  // -----------------------------------------------------------------------
  // POST /api/referral/track-signup
  // -----------------------------------------------------------------------
  app.post("/api/referral/track-signup", async (req: Request, res: Response) => {
    try {
      const { referralCode, refereeAddress } = req.body;

      if (!referralCode || typeof referralCode !== "string") {
        return res.status(400).json({ error: "referralCode is required" });
      }
      if (!isValidAddress(refereeAddress)) {
        return res.status(400).json({ error: "Valid refereeAddress required" });
      }

      const normalizedReferee = refereeAddress.toLowerCase();
      const code = referralCode.toUpperCase();

      // Find referrer by code in walletRecords
      const referrer = await findReferrerByCode(code);
      if (!referrer) {
        return res.status(404).json({ error: "Invalid referral code" });
      }

      if (referrer === normalizedReferee) {
        return res.status(400).json({ error: "Cannot refer yourself" });
      }

      // Apply to walletRecords for backward compatibility
      try {
        await pointsStorage.applyReferralCode(normalizedReferee, code);
      } catch {
        // May fail if already referred - continue to create link anyway
      }

      // Create referral link in active period
      const activePeriod = await service.getActivePeriod();
      if (activePeriod) {
        try {
          await service.createReferralLink(
            activePeriod.id,
            referrer,
            normalizedReferee,
            code,
          );
        } catch (err) {
          // May fail if already linked in this period
          console.warn("[ReferralRoutes] Link creation:", (err as Error).message);
        }
      }

      res.json({ success: true });
    } catch (error) {
      console.error("[ReferralRoutes] Failed to track signup:", error);
      res.status(500).json({ error: "Failed to track signup" });
    }
  });

  // -----------------------------------------------------------------------
  // GET /api/referral/:address/bonus
  // -----------------------------------------------------------------------
  app.get("/api/referral/:address/bonus", async (req: Request, res: Response) => {
    try {
      const { address } = req.params;
      if (!isValidAddress(address)) {
        return res.status(400).json({ error: "Valid Ethereum address required" });
      }

      const activePeriod = await service.getActivePeriod();
      if (!activePeriod) {
        return res.json({ bonus: 0, breakdown: [], periodActive: false });
      }

      const result = await service.calculateBonusForUser(
        address.toLowerCase(),
        activePeriod.id,
      );

      res.json({
        bonus: result.totalBonus,
        breakdown: result.breakdown,
        periodActive: true,
        periodId: activePeriod.id,
        strategy: activePeriod.strategy,
      });
    } catch (error) {
      console.error("[ReferralRoutes] Failed to get bonus:", error);
      res.status(500).json({ error: "Failed to get bonus" });
    }
  });

  // -----------------------------------------------------------------------
  // GET /api/referral/:address/referrals
  // -----------------------------------------------------------------------
  app.get("/api/referral/:address/referrals", async (req: Request, res: Response) => {
    try {
      const { address } = req.params;
      if (!isValidAddress(address)) {
        return res.status(400).json({ error: "Valid Ethereum address required" });
      }

      const activePeriod = await service.getActivePeriod();
      if (!activePeriod) {
        return res.json({ referrals: [], periodActive: false });
      }

      const links = await service.getReferralsForUser(
        address.toLowerCase(),
        activePeriod.id,
      );

      res.json({
        referrals: links.map((l) => ({
          address: l.referredAddress,
          status: l.status,
          linkedAt: l.linkedAt,
          firstBetAt: l.firstBetAt,
          lifetimeVolume: l.lifetimeVolume,
        })),
        periodActive: true,
        periodId: activePeriod.id,
      });
    } catch (error) {
      console.error("[ReferralRoutes] Failed to get referrals:", error);
      res.status(500).json({ error: "Failed to get referrals" });
    }
  });

  // -----------------------------------------------------------------------
  // GET /api/referral/leaderboard
  // -----------------------------------------------------------------------
  app.get("/api/referral/leaderboard", async (_req: Request, res: Response) => {
    try {
      const activePeriod = await service.getActivePeriod();
      if (!activePeriod) {
        return res.json({ rankings: [], periodActive: false });
      }

      const rankings = await service.getLeaderboard(activePeriod.id);

      res.json({
        rankings,
        periodActive: true,
        periodId: activePeriod.id,
        periodName: activePeriod.name,
        strategy: activePeriod.strategy,
        startsAt: activePeriod.startsAt,
        endsAt: activePeriod.endsAt,
      });
    } catch (error) {
      console.error("[ReferralRoutes] Failed to get leaderboard:", error);
      res.status(500).json({ error: "Failed to get leaderboard" });
    }
  });

  // -----------------------------------------------------------------------
  // GET /api/referral/leaderboard/:periodId
  // -----------------------------------------------------------------------
  app.get("/api/referral/leaderboard/:periodId", async (req: Request, res: Response) => {
    try {
      const periodId = parseInt(req.params.periodId, 10);
      if (isNaN(periodId)) {
        return res.status(400).json({ error: "Valid period ID required" });
      }

      const period = await service.getPeriod(periodId);
      if (!period) {
        return res.status(404).json({ error: "Period not found" });
      }

      // For completed periods, try to get from archive first
      if (period.status === "completed") {
        const archive = await storage.getArchiveByPeriod(periodId);
        if (archive) {
          return res.json({
            rankings: archive.rankings,
            periodActive: false,
            periodId: period.id,
            periodName: period.name,
            strategy: period.strategy,
            startsAt: period.startsAt,
            endsAt: period.completedAt,
            archived: true,
          });
        }
      }

      const rankings = await service.getLeaderboard(periodId);
      res.json({
        rankings,
        periodActive: period.status === "active",
        periodId: period.id,
        periodName: period.name,
        strategy: period.strategy,
        startsAt: period.startsAt,
        endsAt: period.endsAt,
      });
    } catch (error) {
      console.error("[ReferralRoutes] Failed to get period leaderboard:", error);
      res.status(500).json({ error: "Failed to get leaderboard" });
    }
  });

  // -----------------------------------------------------------------------
  // GET /api/referral/archives
  // -----------------------------------------------------------------------
  app.get("/api/referral/archives", async (_req: Request, res: Response) => {
    try {
      const archives = await service.getArchives();
      res.json({ archives });
    } catch (error) {
      console.error("[ReferralRoutes] Failed to get archives:", error);
      res.status(500).json({ error: "Failed to get archives" });
    }
  });

  // =======================================================================
  // ADMIN ENDPOINTS
  // =======================================================================

  // -----------------------------------------------------------------------
  // POST /api/admin/referral/periods
  // -----------------------------------------------------------------------
  app.post("/api/admin/referral/periods", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const { name, strategy, strategyConfig, resetMode, resetConfig, refereeBenefits, startsAt, endsAt } = req.body;

      if (!name || typeof name !== "string") {
        return res.status(400).json({ error: "name is required" });
      }
      if (!strategy || !["growth_multiplier", "revenue_share", "milestone_quest", "team_volume"].includes(strategy)) {
        return res.status(400).json({ error: "Valid strategy required" });
      }
      if (!strategyConfig || typeof strategyConfig !== "object") {
        return res.status(400).json({ error: "strategyConfig is required" });
      }

      const period = await service.createPeriod({
        name,
        strategy: strategy as StrategyType,
        strategyConfig,
        resetMode: resetMode || "manual",
        resetConfig: resetConfig || {},
        refereeBenefits,
        startsAt: startsAt || new Date().toISOString(),
        endsAt,
      });

      res.status(201).json(period);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create period";
      console.error("[ReferralRoutes] Failed to create period:", error);
      res.status(400).json({ error: message });
    }
  });

  // -----------------------------------------------------------------------
  // GET /api/admin/referral/periods
  // -----------------------------------------------------------------------
  app.get("/api/admin/referral/periods", requireAdminAuth, async (_req: Request, res: Response) => {
    try {
      const periods = await service.listPeriods();
      res.json({ periods });
    } catch (error) {
      console.error("[ReferralRoutes] Failed to list periods:", error);
      res.status(500).json({ error: "Failed to list periods" });
    }
  });

  // -----------------------------------------------------------------------
  // GET /api/admin/referral/periods/:id
  // -----------------------------------------------------------------------
  app.get("/api/admin/referral/periods/:id", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Valid ID required" });

      const period = await service.getPeriod(id);
      if (!period) return res.status(404).json({ error: "Period not found" });

      // Include stats for active/completed periods
      let stats = null;
      if (period.status === "active" || period.status === "completed") {
        const links = await storage.getLinksForPeriod(period.id);
        const bonusCount = await storage.getBonusCountForPeriod(period.id);
        stats = {
          totalReferrals: links.length,
          activeReferrals: links.filter((l) => l.status === "active").length,
          usersWithBonuses: bonusCount,
        };
      }

      res.json({ period, stats });
    } catch (error) {
      console.error("[ReferralRoutes] Failed to get period:", error);
      res.status(500).json({ error: "Failed to get period" });
    }
  });

  // -----------------------------------------------------------------------
  // PATCH /api/admin/referral/periods/:id
  // -----------------------------------------------------------------------
  app.patch("/api/admin/referral/periods/:id", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Valid ID required" });

      const period = await service.updatePeriod(id, req.body);
      res.json(period);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update period";
      console.error("[ReferralRoutes] Failed to update period:", error);
      res.status(400).json({ error: message });
    }
  });

  // -----------------------------------------------------------------------
  // PATCH /api/admin/referral/periods/:id/activate
  // -----------------------------------------------------------------------
  app.patch("/api/admin/referral/periods/:id/activate", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Valid ID required" });

      const period = await service.activatePeriod(id);

      // If scheduled, start the scheduler
      if (period.resetMode === "scheduled") {
        const { getResetScheduler } = await import("../services/referral/ResetScheduler");
        getResetScheduler().startMonitoring();
      }

      res.json(period);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to activate period";
      const status = message.includes("already active") ? 409 : 400;
      console.error("[ReferralRoutes] Failed to activate period:", error);
      res.status(status).json({ error: message });
    }
  });

  // -----------------------------------------------------------------------
  // PATCH /api/admin/referral/periods/:id/complete
  // -----------------------------------------------------------------------
  app.patch("/api/admin/referral/periods/:id/complete", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Valid ID required" });

      const period = await service.completePeriod(id);

      // Stop the scheduler if it was running
      const { getResetScheduler } = await import("../services/referral/ResetScheduler");
      getResetScheduler().stop();

      res.json(period);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to complete period";
      console.error("[ReferralRoutes] Failed to complete period:", error);
      res.status(400).json({ error: message });
    }
  });

  // -----------------------------------------------------------------------
  // DELETE /api/admin/referral/periods/:id
  // -----------------------------------------------------------------------
  app.delete("/api/admin/referral/periods/:id", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Valid ID required" });

      const deleted = await service.deletePeriod(id);
      if (!deleted) {
        return res.status(400).json({ error: "Only draft periods can be deleted" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("[ReferralRoutes] Failed to delete period:", error);
      res.status(500).json({ error: "Failed to delete period" });
    }
  });

  // -----------------------------------------------------------------------
  // POST /api/admin/referral/reset
  // -----------------------------------------------------------------------
  app.post("/api/admin/referral/reset", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const activePeriod = await service.getActivePeriod();
      if (!activePeriod) {
        return res.status(400).json({ error: "No active period to reset" });
      }

      const createNew = req.body.createNewPeriod !== false;
      const result = await service.manualReset(activePeriod.id, createNew);

      res.json({
        completed: result.completed,
        newPeriod: result.newPeriod || null,
      });
    } catch (error) {
      console.error("[ReferralRoutes] Failed to reset:", error);
      res.status(500).json({ error: "Failed to reset" });
    }
  });

  // =======================================================================
  // Helper functions using walletRecords for code lookup
  // =======================================================================

  async function getWalletReferralCode(address: string): Promise<string | null> {
    try {
      const { db } = await import("./db");
      const { walletRecords } = await import("./schema");
      const { eq } = await import("drizzle-orm");

      const [record] = await db
        .select({ referralCode: walletRecords.referralCode })
        .from(walletRecords)
        .where(eq(walletRecords.address, address))
        .limit(1);

      return record?.referralCode || null;
    } catch {
      return null;
    }
  }

  async function findReferrerByCode(code: string): Promise<string | null> {
    try {
      const { db } = await import("./db");
      const { walletRecords } = await import("./schema");
      const { eq } = await import("drizzle-orm");

      const [record] = await db
        .select({ address: walletRecords.address })
        .from(walletRecords)
        .where(eq(walletRecords.referralCode, code))
        .limit(1);

      return record?.address || null;
    } catch {
      return null;
    }
  }
}
