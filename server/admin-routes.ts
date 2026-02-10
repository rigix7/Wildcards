/**
 * admin-routes – Password-protected admin API endpoints
 *
 * Provides:
 *   - Bearer token authentication middleware (ADMIN_SECRET_KEY env var)
 *   - POST /api/admin/verify              – Test admin authentication
 *   - GET  /api/admin/white-label         – Read all white-label config
 *   - PATCH /api/admin/white-label/fees   – Update fee configuration
 *   - PATCH /api/admin/white-label/points – Update points configuration
 *
 * All /api/admin/* endpoints require the Authorization header:
 *   Authorization: Bearer <ADMIN_SECRET_KEY>
 */

import type { Express, Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { whiteLabelConfig } from "./schema";

// ---------------------------------------------------------------------------
// Admin secret from environment
// ---------------------------------------------------------------------------

const ADMIN_SECRET = process.env.ADMIN_SECRET_KEY;

if (!ADMIN_SECRET) {
  console.warn(
    "[Admin] WARNING: ADMIN_SECRET_KEY not set. Admin panel will be inaccessible.",
  );
}

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------

/**
 * Express middleware that verifies the request carries a valid admin token.
 * Expects: `Authorization: Bearer <secret>`
 */
export function requireAdminAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!ADMIN_SECRET) {
    res.status(503).json({ error: "Admin panel not configured (ADMIN_SECRET_KEY not set)" });
    return;
  }

  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({ error: "Unauthorized: No authorization header" });
    return;
  }

  const providedKey = authHeader.replace("Bearer ", "");

  if (providedKey === ADMIN_SECRET) {
    next();
  } else {
    console.warn("[Admin] Failed authentication attempt from", req.ip);
    res.status(401).json({ error: "Unauthorized: Invalid admin key" });
  }
}

// ---------------------------------------------------------------------------
// White-label config helpers
// ---------------------------------------------------------------------------

async function getOrCreateWhiteLabelConfig() {
  const [existing] = await db.select().from(whiteLabelConfig).limit(1);
  if (existing) return existing;

  const now = new Date().toISOString();
  const [created] = await db
    .insert(whiteLabelConfig)
    .values({
      themeConfig: {},
      apiCredentials: {},
      feeConfig: { feeBps: 0 },
      pointsConfig: null,
      updatedAt: now,
      createdAt: now,
    })
    .returning();

  return created;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerAdminRoutes(app: Express): void {
  // -----------------------------------------------------------------------
  // POST /api/admin/verify – Test admin key validity
  // -----------------------------------------------------------------------

  app.post("/api/admin/verify", requireAdminAuth, (_req: Request, res: Response) => {
    res.json({ success: true, message: "Admin authenticated" });
  });

  // -----------------------------------------------------------------------
  // GET /api/admin/white-label – Read full white-label config
  // -----------------------------------------------------------------------

  app.get(
    "/api/admin/white-label",
    requireAdminAuth,
    async (_req: Request, res: Response) => {
      try {
        const config = await getOrCreateWhiteLabelConfig();
        res.json(config);
      } catch (error) {
        console.error("[Admin] Failed to fetch white-label config:", error);
        res.status(500).json({ error: "Failed to fetch configuration" });
      }
    },
  );

  // -----------------------------------------------------------------------
  // PATCH /api/admin/white-label/fees – Update fee configuration
  //
  // Body: { feeBps: number, feeAddress?: string, wallets?: [...] }
  // -----------------------------------------------------------------------

  app.patch(
    "/api/admin/white-label/fees",
    requireAdminAuth,
    async (req: Request, res: Response) => {
      try {
        const feeConfig = req.body;

        if (feeConfig.feeBps !== undefined) {
          const bps = Number(feeConfig.feeBps);
          if (isNaN(bps) || bps < 0 || bps > 10000) {
            return res.status(400).json({
              error: "feeBps must be a number between 0 and 10000",
            });
          }
        }

        const existing = await getOrCreateWhiteLabelConfig();

        const [updated] = await db
          .update(whiteLabelConfig)
          .set({
            feeConfig,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(whiteLabelConfig.id, existing.id))
          .returning();

        res.json(updated);
      } catch (error) {
        console.error("[Admin] Failed to update fee config:", error);
        res.status(500).json({ error: "Failed to update fee settings" });
      }
    },
  );

  // -----------------------------------------------------------------------
  // PATCH /api/admin/white-label/points – Update points configuration
  //
  // Body: { enabled, name, resetSchedule, referralEnabled, referralPercentage }
  // -----------------------------------------------------------------------

  app.patch(
    "/api/admin/white-label/points",
    requireAdminAuth,
    async (req: Request, res: Response) => {
      try {
        const pointsConfig = req.body;

        // Validate referral percentage range
        if (pointsConfig.referralPercentage !== undefined) {
          const pct = Number(pointsConfig.referralPercentage);
          if (isNaN(pct) || pct < 0 || pct > 100) {
            return res.status(400).json({
              error: "referralPercentage must be a number between 0 and 100",
            });
          }
        }

        const existing = await getOrCreateWhiteLabelConfig();

        const [updated] = await db
          .update(whiteLabelConfig)
          .set({
            pointsConfig,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(whiteLabelConfig.id, existing.id))
          .returning();

        res.json(updated);
      } catch (error) {
        console.error("[Admin] Failed to update points config:", error);
        res.status(500).json({ error: "Failed to update points settings" });
      }
    },
  );
}
