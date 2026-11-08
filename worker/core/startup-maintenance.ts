import { resetStuckJobs, enqueueAllPagesForRefresh } from "../repositories/queue-repo";
import { purgeOldRawExtracts } from "../repositories/scan-history-repo";

export interface StartupMaintenanceOptions {
  isCoordinator: boolean;
  shouldSkipEnqueue?: boolean;
  shouldSkipStartupSweep?: boolean;
  isForceRefresh?: boolean;
  shouldRefreshAll?: boolean;
  staleHours?: number;
}

export async function runStartupMaintenance(options: StartupMaintenanceOptions) {
  if (!options.isCoordinator || options.shouldSkipEnqueue) return;

  await resetStuckJobs();

  if (options.shouldRefreshAll) {
    const cooldownHours = options.isForceRefresh
      ? 0
      : parseInt(process.env.AUTO_REFRESH_COOLDOWN_HOURS || String(options.staleHours || 12), 10);
    console.log(
      `[Refresh Mode] Enqueuing eligible pages for auto-refresh (cooldown: ${cooldownHours}h)...`
    );
    await enqueueAllPagesForRefresh(cooldownHours);
  }

  if (!options.shouldSkipStartupSweep) {
    try {
      const { rescueFailedProductsBatch, validateForeignCurrencyProductsBatch } = await import("../product-rescue");
      console.log("[Worker Startup] Checking for stuck or failed product scrapings to rescue...");
      const rescuedCount = await rescueFailedProductsBatch(5, true);
      if (rescuedCount > 0) {
        console.log(`[Worker Startup] 🟢 Rescued ${rescuedCount} stuck product(s) via local residential browser.`);
      }

      console.log("[Worker Startup] Checking for products with foreign currency / cloud geo-switches to validate...");
      const foreignCount = await validateForeignCurrencyProductsBatch(10, true);
      if (foreignCount > 0) {
        console.log(`[Worker Startup] 🟢 Validated ${foreignCount} product(s) with foreign currency via local residential connection.`);
      }
    } catch (rescueErr: any) {
      console.warn("[Worker Startup] Product rescue notice:", rescueErr?.message);
    }

    try {
      const { runJevMaintenanceSweep } = await import("../jev-maintenance");
      console.log("[Worker Startup] Checking active products for General Merchandise reclassification & 0 DT price resolution...");
      const jevStats = await runJevMaintenanceSweep();
      if (jevStats.reclassified > 0 || jevStats.pricesResolved > 0) {
        console.log(`[Worker Startup] 🚀 Jev Sweep: Reclassified ${jevStats.reclassified} products, Resolved ${jevStats.pricesResolved} prices.`);
      }
    } catch (jevErr: any) {
      console.warn("[Worker Startup] Jev maintenance notice:", jevErr?.message);
    }

    try {
      console.log("[Worker Startup] Purging expired rawExtract payloads (> 48h)...");
      const purgedCount = await purgeOldRawExtracts();
      if (purgedCount > 0) {
        console.log(`[Worker Startup] 🧹 Purged ${purgedCount} expired rawExtract JSON payload(s) (>48h old).`);
      }
    } catch (purgeErr: any) {
      console.warn("[Worker Startup] Purge raw extracts notice:", purgeErr?.message);
    }
  } else {
    console.log("[Worker Startup] ⏩ Startup rescue & maintenance sweep skipped by flag.");
  }
}

