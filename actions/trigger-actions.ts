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
    // 1. Mark page as pending in DB
    await db
      .update(trackedPages)
      .set({ status: "pending", updatedAt: new Date() })
      .where(eq(trackedPages.id, pageId));

    // 2. Insert into DB queue so local worker can process as fallback
    const existingQueueJob = await db.query.queue.findFirst({
      where: (q, { and, eq, inArray }) =>
        and(eq(q.trackedPageId, pageId), inArray(q.status, ["pending", "running"])),
    });

    if (!existingQueueJob) {
      await db.insert(queue).values({
        trackedPageId: pageId,
        jobType: "count",
        status: "pending",
        priority: 10,
      });
    }

    // 3. Dispatch to Trigger.dev if available
    if (process.env.TRIGGER_SECRET_KEY) {
      const handle = await tasks.trigger("scan-page-count", { pageId });
      return { success: true, runId: handle.id, mode: "trigger.dev" };
    }

    return { success: true, mode: "database_queue" };
  } catch (error: any) {
    console.error("Error triggering page refresh:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Server Action: Trigger batch retry for all failed pages
 * Marks failed pages as pending in DB queue for local/GitHub worker execution
 * (preserves Trigger.dev free-tier concurrency exclusively for single page ad counts).
 */
export async function triggerBatchRetryFailed() {
  try {
    const failedPages = await db.query.trackedPages.findMany({
      where: eq(trackedPages.status, "failed"),
      columns: { id: true },
    });

    if (failedPages.length === 0) {
      return { success: true, retriedCount: 0, message: "No failed pages to retry." };
    }

    const failedIds = failedPages.map((p) => p.id);
    const now = new Date();

    // 1. Mark status as pending in tracked_pages
    await db
      .update(trackedPages)
      .set({ status: "pending", updatedAt: now })
      .where(inArray(trackedPages.id, failedIds));

    // 2. Insert into queue table (skip already queued pending/running jobs)
    const existingQueueJobs = await db.query.queue.findMany({
      where: (q, { and, inArray }) =>
        and(inArray(q.trackedPageId, failedIds), inArray(q.status, ["pending", "running"])),
      columns: { trackedPageId: true },
    });
    const existingSet = new Set(existingQueueJobs.map((q) => q.trackedPageId));
    const toEnqueue = failedIds.filter((id) => !existingSet.has(id));

    if (toEnqueue.length > 0) {
      await db.insert(queue).values(
        toEnqueue.map((id) => ({
          trackedPageId: id,
          jobType: "count" as const,
          status: "pending" as const,
          priority: 10,
        }))
      );
    }

    return {
      success: true,
      retriedCount: failedIds.length,
      mode: "database_queue",
      message: `Enqueued ${failedIds.length} failed page(s) as pending. Waiting for GitHub worker or local worker to start.`,
    };
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

export interface TriggerGithubWorkerOptions {
  target?: "worker" | "spy" | "scraper" | "favorites" | "all";
  runCanary?: boolean;
}

/**
 * Server Action: Activate GitHub Actions Worker via Trigger.dev (with direct fallback)
 */
export async function triggerGithubWorkerAction(options: TriggerGithubWorkerOptions = {}) {
  const target = options.target || "worker";
  const runCanary = Boolean(options.runCanary);

  try {
    // 1. Dispatch via Trigger.dev if available
    if (process.env.TRIGGER_SECRET_KEY) {
      try {
        const handle = await tasks.trigger("dispatch-github-worker", {
          target,
          runCanary,
        });
        return {
          success: true,
          mode: "trigger.dev" as const,
          runId: handle.id,
          target,
          message: `Trigger.dev queued workflow dispatch for '${target}'.`,
        };
      } catch (triggerErr: any) {
        console.warn("[Trigger.dev dispatch notice]:", triggerErr?.message || triggerErr);
        // Fall through to direct dispatch fallback
      }
    }

    // 2. Direct GitHub API Fallback
    const repoOwner = process.env.GITHUB_REPO_OWNER || "kimooF92";
    const repoName = process.env.GITHUB_REPO_NAME || "metalibrarydb";
    const token = process.env.GH_PAT_TOKEN || process.env.GITHUB_TOKEN;

    if (!token) {
      return {
        success: false,
        error: "Missing GH_PAT_TOKEN in environment. Please add it to .env.local",
      };
    }

    const workflowMap: Record<string, string> = {
      worker: "worker.yml",
      spy: "spy-worker.yml",
      scraper: "product-scraper.yml",
      favorites: "verify-favorites.yml",
    };

    const workflowFile = workflowMap[target] || "worker.yml";
    const res = await fetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}/actions/workflows/${workflowFile}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "Direct-Worker-Dispatcher",
        },
        body: JSON.stringify({
          ref: "main",
          inputs: target === "worker" ? { run_canary: runCanary ? "true" : "false" } : undefined,
        }),
      }
    );

    if (res.status === 204) {
      return {
        success: true,
        mode: "github_direct" as const,
        target,
        workflow: workflowFile,
        message: `Directly dispatched ${workflowFile} to GitHub Actions (4 shards).`,
      };
    }

    const errorBody = await res.text();
    return {
      success: false,
      error: `GitHub responded with status ${res.status}: ${errorBody}`,
    };
  } catch (err: any) {
    console.error("Failed to trigger GitHub worker:", err);
    return {
      success: false,
      error: err.message || "Unknown error triggering GitHub worker",
    };
  }
}
