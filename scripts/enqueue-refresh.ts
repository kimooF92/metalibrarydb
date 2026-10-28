import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../db";
import { queue } from "../db/schema";
import { resetStuckJobs, enqueueAllPagesForRefresh, getAppSettings } from "../worker/db";
import { eq, sql, and } from "drizzle-orm";
import fs from "fs";

async function main() {
  const args = process.argv.slice(2);
  const isForce = args.includes("--force") || process.env.REFRESH_ALL === "true";

  // Load app settings
  const settings = await getAppSettings();

  // Parse cooldown: CLI arg > env var > app settings > default 11h
  let cooldownHours = 11;
  const cooldownArgIdx = args.indexOf("--cooldown");
  if (cooldownArgIdx !== -1 && args[cooldownArgIdx + 1]) {
    cooldownHours = parseFloat(args[cooldownArgIdx + 1]);
  } else if (process.env.AUTO_REFRESH_COOLDOWN_HOURS) {
    cooldownHours = parseFloat(process.env.AUTO_REFRESH_COOLDOWN_HOURS);
  } else if (settings?.staleHours) {
    cooldownHours = settings.staleHours;
  }

  const effectiveCooldown = isForce ? 0 : cooldownHours;

  console.log("==========================================");
  console.log(" Meta Ad Tracker — Two-Stage Enqueue Step ");
  console.log(` Force Refresh: ${isForce} | Cooldown: ${effectiveCooldown}h`);
  console.log("==========================================");

  // 1. Reset any stuck or orphaned jobs from prior interrupted runs
  console.log("[Enqueue Step] Cleaning orphaned / stuck jobs from previous runs...");
  await resetStuckJobs();

  // 2. Enqueue stale pages due for refresh
  console.log(`[Enqueue Step] Enqueuing eligible pages for auto-refresh (cooldown: ${effectiveCooldown}h)...`);
  const enqueuedCount = await enqueueAllPagesForRefresh(effectiveCooldown);
  console.log(`[Enqueue Step] Enqueued ${enqueuedCount} page(s) for refresh.`);

  // 3. Count total pending count & discovery_count jobs in queue
  const [res] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(queue)
    .where(
      and(
        eq(queue.status, "pending"),
        sql`job_type IN ('count', 'discovery_count')`
      )
    );

  const totalPending = res?.count ?? 0;
  const hasJobs = totalPending > 0;

  console.log("==========================================");
  console.log(`[Enqueue Step] Total Pending Count Jobs: ${totalPending}`);
  console.log(`[Enqueue Step] Has Jobs to Process: ${hasJobs ? "YES (workers will run)" : "NO (workers will be skipped)"}`);
  console.log("==========================================");

  // Export outputs for GitHub Actions pipeline
  if (process.env.GITHUB_OUTPUT) {
    try {
      fs.appendFileSync(
        process.env.GITHUB_OUTPUT,
        `has_jobs=${hasJobs}\njob_count=${totalPending}\n`
      );
      console.log(`[Enqueue Step] Wrote outputs to GITHUB_OUTPUT: has_jobs=${hasJobs}, job_count=${totalPending}`);
    } catch (outputErr) {
      console.warn("[Enqueue Step] Failed writing to GITHUB_OUTPUT:", outputErr);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("[Enqueue Step] Fatal error:", err);
  process.exit(1);
});
