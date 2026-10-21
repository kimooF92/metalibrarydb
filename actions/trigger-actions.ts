"use server";

import { tasks } from "@trigger.dev/sdk";
import { db } from "@/db";
import { trackedPages, queue } from "@/db/schema";
import { inArray, eq } from "drizzle-orm";

/**
 * Server Action: Trigger a single page ad-count scan
 */
export async function triggerSinglePageRefresh(pageId: string) {
  try {
    if (process.env.TRIGGER_SECRET_KEY) {
      const handle = await tasks.trigger("scan-page-count", { pageId });
      return { success: true, runId: handle.id, mode: "trigger.dev" };
    }

    // Fallback if TRIGGER_SECRET_KEY is missing
    await db.insert(queue).values({
      trackedPageId: pageId,
      jobType: "count",
      status: "pending",
      priority: 10,
    });
    return { success: true, mode: "database_queue" };
  } catch (error: any) {
    console.error("Error triggering page refresh:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Server Action: Trigger batch retry for all failed pages
 */
export async function triggerBatchRetryFailed() {
  try {
    if (process.env.TRIGGER_SECRET_KEY) {
      const handle = await tasks.trigger("retry-failed-pages", {});
      return { success: true, runId: handle.id, mode: "trigger.dev" };
    }

    // Fallback
    const failedPages = await db.query.trackedPages.findMany({
      where: eq(trackedPages.status, "failed"),
      columns: { id: true },
    });
    if (failedPages.length > 0) {
      await db.insert(queue).values(
        failedPages.map((p) => ({
          trackedPageId: p.id,
          jobType: "count",
          status: "pending",
          priority: 10,
        }))
      );
    }
    return { success: true, retriedCount: failedPages.length, mode: "database_queue" };
  } catch (error: any) {
    console.error("Error triggering batch retry:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Server Action: Trigger test smoke task
 */
export async function triggerSmokeTest(message?: string) {
  try {
    const handle = await tasks.trigger("hello-world", { message });
    return { success: true, runId: handle.id };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
