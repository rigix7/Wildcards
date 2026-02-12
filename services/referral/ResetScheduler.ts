/**
 * ResetScheduler – Manages scheduled and rolling resets for referral periods
 *
 * Uses setInterval to check every 60 seconds whether a scheduled reset is due.
 * On startup, resumes any active scheduled period's timer.
 */

import { ReferralPeriodService } from "./ReferralPeriodService";
import { ReferralStorage } from "../../server/ReferralStorage";
import type { StrategyType } from "./types";

const CHECK_INTERVAL_MS = 60_000; // Check every 60 seconds

export class ResetScheduler {
  private timer: NodeJS.Timeout | null = null;
  private service: ReferralPeriodService;
  private storage: ReferralStorage;

  constructor() {
    this.storage = new ReferralStorage();
    this.service = new ReferralPeriodService(this.storage);
  }

  /**
   * Initialize the scheduler. Call once on server startup.
   * Checks for active periods with scheduled reset and starts monitoring.
   */
  async initialize(): Promise<void> {
    try {
      const activePeriod = await this.storage.getActivePeriod();

      if (activePeriod && activePeriod.resetMode === "scheduled") {
        console.log(
          `[ResetScheduler] Found active scheduled period "${activePeriod.name}" (ID: ${activePeriod.id})`,
        );
        this.startMonitoring();
      } else {
        console.log("[ResetScheduler] No active scheduled period found, monitoring inactive");
      }
    } catch (error) {
      console.error("[ResetScheduler] Failed to initialize:", error);
    }
  }

  /**
   * Start the periodic check timer.
   */
  startMonitoring(): void {
    if (this.timer) return; // Already running

    console.log("[ResetScheduler] Starting monitoring (checking every 60s)");

    this.timer = setInterval(async () => {
      await this.checkForReset();
    }, CHECK_INTERVAL_MS);
  }

  /**
   * Stop all monitoring.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log("[ResetScheduler] Monitoring stopped");
    }
  }

  /**
   * Check if a scheduled reset is due and execute if so.
   */
  private async checkForReset(): Promise<void> {
    try {
      const activePeriod = await this.storage.getActivePeriod();
      if (!activePeriod) {
        this.stop();
        return;
      }

      if (activePeriod.resetMode !== "scheduled") return;

      const resetConfig = activePeriod.resetConfig as Record<string, unknown> | null;
      if (!resetConfig?.schedule) return;

      const schedule = resetConfig.schedule as { nextResetAt?: string };
      if (!schedule.nextResetAt) return;

      const nextReset = new Date(schedule.nextResetAt).getTime();
      const now = Date.now();

      if (now >= nextReset) {
        console.log(
          `[ResetScheduler] Executing scheduled reset for period "${activePeriod.name}" (ID: ${activePeriod.id})`,
        );

        // Complete current period and create new one
        const result = await this.service.manualReset(activePeriod.id, true);

        if (result.newPeriod) {
          // Calculate next reset time
          const newNextReset = calculateNextResetTime(resetConfig.schedule as ScheduleConfig);

          // Update the new period's reset config with next reset time
          await this.storage.updatePeriod(result.newPeriod.id, {
            resetConfig: {
              ...resetConfig,
              schedule: {
                ...(resetConfig.schedule as Record<string, unknown>),
                nextResetAt: newNextReset,
              },
            },
          });

          // Activate the new period
          await this.service.activatePeriod(result.newPeriod.id);

          console.log(
            `[ResetScheduler] New period "${result.newPeriod.name}" activated, next reset at ${newNextReset}`,
          );
        }
      }
    } catch (error) {
      console.error("[ResetScheduler] Error checking for reset:", error);
    }
  }
}

// ---------------------------------------------------------------------------
// Helper: Calculate next reset time
// ---------------------------------------------------------------------------

interface ScheduleConfig {
  frequency: "daily" | "weekly" | "monthly";
  dayOfWeek?: number;
  dayOfMonth?: number;
  timeUtc?: string;
}

function calculateNextResetTime(schedule: ScheduleConfig): string {
  const now = new Date();
  const [hours, minutes] = (schedule.timeUtc || "00:00").split(":").map(Number);

  let next: Date;

  switch (schedule.frequency) {
    case "daily":
      next = new Date(now);
      next.setUTCHours(hours, minutes, 0, 0);
      if (next <= now) {
        next.setUTCDate(next.getUTCDate() + 1);
      }
      break;

    case "weekly": {
      const targetDay = schedule.dayOfWeek ?? 1; // Monday default
      next = new Date(now);
      next.setUTCHours(hours, minutes, 0, 0);
      const currentDay = next.getUTCDay();
      let daysUntil = targetDay - currentDay;
      if (daysUntil <= 0) daysUntil += 7;
      if (daysUntil === 0 && next <= now) daysUntil = 7;
      next.setUTCDate(next.getUTCDate() + daysUntil);
      break;
    }

    case "monthly": {
      const targetDate = schedule.dayOfMonth ?? 1;
      next = new Date(now);
      next.setUTCHours(hours, minutes, 0, 0);
      next.setUTCDate(targetDate);
      if (next <= now) {
        next.setUTCMonth(next.getUTCMonth() + 1);
      }
      break;
    }

    default:
      // Fallback: 7 days from now
      next = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  }

  return next.toISOString();
}

// Singleton instance for server lifecycle
let schedulerInstance: ResetScheduler | null = null;

export function getResetScheduler(): ResetScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new ResetScheduler();
  }
  return schedulerInstance;
}
