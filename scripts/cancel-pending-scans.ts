import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db, client } from "../db";
import { trackedPages, queue } from "../db/schema";
import { eq, and, inArray, or, ilike } from "drizzle-orm";
import { forceReleaseLock, deleteCached, deleteByPrefix, bumpEntityCacheVersion } from "../lib/cache-service";

async function cancelPending(targets: string[]) {
  console.log("==========================================");
  console.log(" 🚫 Cancel Pending Scans                  ");
  console.log("==========================================");

  if (!targets || targets.length === 0) {
    // List all currently pending pages
    const pendingPages = await db.query.trackedPages.findMany({
      where: eq(trackedPages.status, "pending"),
      columns: {
        id: true,
        displayName: true,
        pageId: true,
        currentResults: true,
        lastSuccessAt: true,
      },
    });

    if (pendingPages.length === 0) {
      console.log("No tracked pages are currently in 'pending' status.");
      return;
    }

    console.log(`Found ${pendingPages.length} pending page(s):\n`);
    for (const p of pendingPages) {
      console.log(` • [${p.displayName || "Unknown"}] ID: ${p.id} (Meta Page ID: ${p.pageId || "N/A"})`);
    }
    console.log("\nUsage:");
    console.log("  npx tsx scripts/cancel-pending-scans.ts \"Brand Name\" or <UUID>");
    console.log("  npx tsx scripts/cancel-pending-scans.ts --all (to cancel all 23 pending)");
    return;
  }

  const isAll = targets.includes("--all");
  const now = new Date();

  // Find target pending pages
  let pagesToCancel: {
    id: string;
    displayName: string | null;
    currentResults: number | null;
    lastSuccessAt: Date | null;
    workspaceId: string | null;
  }[] = [];

  if (isAll) {
    pagesToCancel = await db.query.trackedPages.findMany({
      where: eq(trackedPages.status, "pending"),
      columns: {
        id: true,
        displayName: true,
        currentResults: true,
        lastSuccessAt: true,
        workspaceId: true,
      },
    });
  } else {
    // Search by ID, pageId, or displayName substring
    for (const target of targets) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target);
      const matches = await db.query.trackedPages.findMany({
        where: and(
          eq(trackedPages.status, "pending"),
          or(
            isUuid ? eq(trackedPages.id, target) : undefined,
            eq(trackedPages.pageId, target),
            ilike(trackedPages.displayName, `%${target}%`)
          )
        ),
        columns: {
          id: true,
          displayName: true,
          currentResults: true,
          lastSuccessAt: true,
          workspaceId: true,
        },
      });

      for (const m of matches) {
        if (!pagesToCancel.some((p) => p.id === m.id)) {
          pagesToCancel.push(m);
        }
      }
    }
  }

  if (pagesToCancel.length === 0) {
    console.log(`❌ No pending pages matched: ${targets.join(", ")}`);
    return;
  }

  console.log(`Cancelling ${pagesToCancel.length} pending page(s)...`);

  const pageIds = pagesToCancel.map((p) => p.id);

  // 1. Mark pending queue jobs as failed/cancelled
  await db
    .update(queue)
    .set({
      status: "failed",
      failureReason: "cancelled_manually",
      finishedAt: now,
    })
    .where(and(inArray(queue.trackedPageId, pageIds), inArray(queue.status, ["pending", "running"])));

  // 2. Restore tracked_pages status
  for (const page of pagesToCancel) {
    const targetStatus = page.lastSuccessAt !== null || page.currentResults !== null ? "success" : "unclear";

    await db
      .update(trackedPages)
      .set({
        status: targetStatus,
        updatedAt: now,
      })
      .where(eq(trackedPages.id, page.id));

    // Release locks and cache keys
    await forceReleaseLock(`lock:scrape:${page.id}`).catch(() => {});
    await deleteCached(`scan_step:${page.id}`).catch(() => {});

    console.log(` ✅ Cancelled: "${page.displayName || page.id}" -> restored to "${targetStatus}"`);
  }

  // 3. Invalidate workspace caches
  const workspaceIds = Array.from(new Set(pagesToCancel.map((p) => p.workspaceId).filter(Boolean))) as string[];
  for (const wId of workspaceIds) {
    await Promise.allSettled([
      bumpEntityCacheVersion(wId, "pages"),
      deleteByPrefix(`cache:pages:${wId}:`),
      deleteCached(`cache:stats:${wId}`),
      deleteByPrefix("cache:dashboard:overview:"),
    ]);
  }

  console.log("==========================================");
  console.log(" 🎉 Done! Pending scans cancelled successfully.");
}

const args = process.argv.slice(2);
cancelPending(args)
  .catch((err) => {
    console.error("Error cancelling pending scans:", err);
  })
  .finally(async () => {
    await client.end().catch(() => {});
    process.exit(0);
  });
