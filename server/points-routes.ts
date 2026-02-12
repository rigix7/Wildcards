/**
 * points-routes – Express API endpoints for the unified points system
 *
 * All configuration is read dynamically from the white_label_config table
 * via DatabasePointsStorage.getWhiteLabelConfig(). No hardcoded config files.
 *
 * Endpoints:
 *   GET  /api/wallet/:address/points        – Points breakdown
 *   POST /api/wallet/:address/safe           – Sync Safe address (called by useTradingSession)
 *   POST /api/wallet/:address/referral-code  – Set user's referral code
 *   POST /api/wallet/:address/apply-referral – Apply someone else's referral code
 *   GET  /api/wallet/:address/referral-stats – Get referral statistics
 */

import type { Express, Request, Response } from "express";
import { PointsService, type PointsConfig } from "../services/PointsService";
import { DatabasePointsStorage } from "./DatabasePointsStorage";

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const REFERRAL_CODE_RE = /^[A-Za-z0-9]{3,20}$/;

function isValidAddress(value: unknown): value is string {
  return typeof value === "string" && ADDRESS_RE.test(value);
}

function isValidReferralCode(value: unknown): value is string {
  return typeof value === "string" && REFERRAL_CODE_RE.test(value);
}

// ---------------------------------------------------------------------------
// Default config used when no white-label config row exists yet
// ---------------------------------------------------------------------------

const DEFAULT_POINTS_CONFIG: PointsConfig = {
  enabled: false,
  name: "POINTS",
  resetSchedule: "never",
  referralEnabled: false,
  referralPercentage: 0,
};

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

/**
 * Register all points-related API routes on the given Express app.
 *
 * Config is loaded dynamically from the database on every request so changes
 * made via the admin panel take effect immediately.
 *
 * Usage:
 * ```ts
 * import { registerPointsRoutes } from "./points-routes";
 * registerPointsRoutes(app);
 * ```
 */
export function registerPointsRoutes(app: Express): void {
  const storage = new DatabasePointsStorage();

  /** Fetch current points config from white-label DB table */
  async function getPointsConfig(): Promise<PointsConfig> {
    try {
      const wlConfig = await storage.getWhiteLabelConfig();
      const pc = wlConfig?.pointsConfig;
      if (!pc) return DEFAULT_POINTS_CONFIG;

      return {
        enabled: pc.enabled ?? false,
        name: pc.name ?? "POINTS",
        resetSchedule: (pc.resetSchedule as PointsConfig["resetSchedule"]) ?? "never",
        referralEnabled: pc.referralEnabled ?? false,
        referralPercentage: pc.referralPercentage ?? 0,
      };
    } catch (err) {
      console.warn("[PointsRoutes] Failed to load config from DB, using defaults:", err);
      return DEFAULT_POINTS_CONFIG;
    }
  }

  // -----------------------------------------------------------------------
  // GET /api/wallet/:address/points
  // -----------------------------------------------------------------------

  app.get(
    "/api/wallet/:address/points",
    async (req: Request, res: Response) => {
      try {
        const { address } = req.params;
        if (!isValidAddress(address)) {
          return res
            .status(400)
            .json({ error: "Valid Ethereum address required (0x...)" });
        }

        const config = await getPointsConfig();

        if (!config.enabled) {
          return res.json({
            tradingPoints: 0,
            referralBonus: 0,
            total: 0,
            referralsCount: 0,
            activityCount: 0,
            partial: false,
            message: "Points system not enabled",
          });
        }

        // Resolve the Safe address so we query Polymarket with the right wallet
        const safeAddress = await storage.getSafeAddress(address);
        const queryAddress = safeAddress || address;

        // Build a PointsService with current config for this request
        const pointsService = new PointsService(config, storage);

        // Calculate trading points from Polymarket Activity API
        const activityResult =
          await pointsService.calculateTradingPoints(queryAddress);

        const tradingPoints = activityResult.wildPoints;

        // Persist so referral calcs stay up-to-date
        if (activityResult.success) {
          try {
            await storage.updateStoredTradingPoints(
              address.toLowerCase(),
              tradingPoints,
            );
          } catch (err) {
            console.warn(
              "[PointsRoutes] Failed to persist trading points:",
              err,
            );
          }
        }

        // Referral bonus (legacy simple percentage system)
        const referralStats = await pointsService.getReferralStats(
          address.toLowerCase(),
        );
        const referralBonus =
          config.referralEnabled ? referralStats.pointsEarned : 0;

        // Strategy bonus (new referral system - additive)
        let strategyBonus = 0;
        try {
          const { ReferralPeriodService } = await import(
            "../services/referral/ReferralPeriodService"
          );
          const { ReferralStorage } = await import("./ReferralStorage");
          const referralStorage = new ReferralStorage();
          const periodService = new ReferralPeriodService(referralStorage);
          const activePeriod = await referralStorage.getActivePeriod();
          if (activePeriod) {
            const bonusResult = await periodService.calculateBonusForUser(
              address.toLowerCase(),
              activePeriod.id,
            );
            strategyBonus = bonusResult.totalBonus;
          }
        } catch (err) {
          console.warn("[PointsRoutes] Failed to calculate strategy bonus:", err);
        }

        res.json({
          tradingPoints,
          referralBonus,
          strategyBonus,
          total: tradingPoints + referralBonus + strategyBonus,
          referralsCount: referralStats.referralsCount,
          activityCount: activityResult.activityCount,
          partial: activityResult.partial,
        });
      } catch (error) {
        console.error("[PointsRoutes] Failed to fetch points:", error);
        res.status(500).json({ error: "Failed to fetch points" });
      }
    },
  );

  // -----------------------------------------------------------------------
  // POST /api/wallet/:address/safe
  // -----------------------------------------------------------------------

  app.post(
    "/api/wallet/:address/safe",
    async (req: Request, res: Response) => {
      try {
        const { address } = req.params;
        const { safeAddress, isSafeDeployed } = req.body;

        if (!isValidAddress(address)) {
          return res
            .status(400)
            .json({ error: "Valid EOA address required (0x...)" });
        }
        if (!isValidAddress(safeAddress)) {
          return res
            .status(400)
            .json({ error: "Valid Safe address required (0x...)" });
        }

        const deployed =
          typeof isSafeDeployed === "boolean" ? isSafeDeployed : true;

        await storage.setSafeAddress(address, safeAddress, deployed);

        res.json({ success: true });
      } catch (error) {
        console.error("[PointsRoutes] Failed to sync Safe address:", error);
        res.status(500).json({ error: "Failed to sync Safe address" });
      }
    },
  );

  // -----------------------------------------------------------------------
  // POST /api/wallet/:address/referral-code
  // -----------------------------------------------------------------------

  app.post(
    "/api/wallet/:address/referral-code",
    async (req: Request, res: Response) => {
      try {
        const { address } = req.params;
        const { referralCode } = req.body;

        if (!isValidAddress(address)) {
          return res
            .status(400)
            .json({ error: "Valid Ethereum address required (0x...)" });
        }
        if (!isValidReferralCode(referralCode)) {
          return res.status(400).json({
            error: "Referral code must be 3-20 alphanumeric characters",
          });
        }

        const config = await getPointsConfig();
        const pointsService = new PointsService(config, storage);

        await pointsService.setReferralCode(
          address.toLowerCase(),
          referralCode,
        );

        res.json({
          success: true,
          referralCode: referralCode.toUpperCase(),
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to set referral code";

        if (message === "Referral code already taken") {
          return res.status(409).json({ error: message });
        }

        console.error("[PointsRoutes] Failed to set referral code:", error);
        res.status(500).json({ error: "Failed to set referral code" });
      }
    },
  );

  // -----------------------------------------------------------------------
  // POST /api/wallet/:address/apply-referral
  // -----------------------------------------------------------------------

  app.post(
    "/api/wallet/:address/apply-referral",
    async (req: Request, res: Response) => {
      try {
        const { address } = req.params;
        const { referrerCode } = req.body;

        if (!isValidAddress(address)) {
          return res
            .status(400)
            .json({ error: "Valid Ethereum address required (0x...)" });
        }
        if (!isValidReferralCode(referrerCode)) {
          return res.status(400).json({
            error: "Referral code must be 3-20 alphanumeric characters",
          });
        }

        const config = await getPointsConfig();
        const pointsService = new PointsService(config, storage);

        const result = await pointsService.applyReferralCode(
          address.toLowerCase(),
          referrerCode,
        );

        if (!result.success) {
          return res.status(400).json(result);
        }

        res.json(result);
      } catch (error) {
        console.error("[PointsRoutes] Failed to apply referral:", error);
        res.status(500).json({ error: "Failed to apply referral code" });
      }
    },
  );

  // -----------------------------------------------------------------------
  // GET /api/wallet/:address/referral-stats
  // -----------------------------------------------------------------------

  app.get(
    "/api/wallet/:address/referral-stats",
    async (req: Request, res: Response) => {
      try {
        const { address } = req.params;
        if (!isValidAddress(address)) {
          return res
            .status(400)
            .json({ error: "Valid Ethereum address required (0x...)" });
        }

        const config = await getPointsConfig();
        const pointsService = new PointsService(config, storage);

        const stats = await pointsService.getReferralStats(
          address.toLowerCase(),
        );

        res.json(stats);
      } catch (error) {
        console.error("[PointsRoutes] Failed to fetch referral stats:", error);
        res.status(500).json({ error: "Failed to fetch referral stats" });
      }
    },
  );
}
