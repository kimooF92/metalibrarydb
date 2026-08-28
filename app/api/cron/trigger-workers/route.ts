import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { trackedPages, activityNotifications } from "@/db/schema";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60; // 60s max execution limit on Vercel Serverless

/**
 * Vercel Automated Cron Endpoint:
 * 1. Pings Supabase with a lightweight query (resets Supabase 7-day inactivity timer to 0).
 * 2. Triggers GitHub Actions via REST API (workflow_dispatch) with a GitHub PAT Token.
 *    (Bypasses GitHub 60-day scheduled cron auto-pause).
 * 3. Records an audit notification in Supabase.
 */
export async function GET(req: NextRequest) {
  return handleCronTrigger(req);
}

export async function POST(req: NextRequest) {
  return handleCronTrigger(req);
}

async function handleCronTrigger(req: NextRequest) {
  try {
    // 1. Authorization: verify Vercel Cron header or internal API secret
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET || process.env.API_SECRET || process.env.APP_PASSWORD;

    const isVercelCron = req.headers.get("x-vercel-cron") === "1";
    const isAuthorizedHeader = cronSecret && authHeader === `Bearer ${cronSecret}`;

    // Allow if triggered by Vercel native cron scheduler or valid bearer token
    if (cronSecret && !isVercelCron && !isAuthorizedHeader) {
      const clientSecret = req.headers.get("x-api-secret");
      if (clientSecret !== cronSecret) {
        return NextResponse.json({ error: "Unauthorized cron request" }, { status: 401 });
      }
    }

    const { searchParams } = new URL(req.url);
    const target = searchParams.get("target") || "worker"; // 'worker' | 'spy' | 'scraper' | 'all'

    const repoOwner = "kimooF92";
    const repoName = "metalibrarydb";
    const githubToken = process.env.GH_PAT_TOKEN || process.env.GITHUB_TOKEN;

    // 2. Touch Supabase Database (Resets Supabase 7-Day Inactivity Timer)
    const [dbCheck] = await db
      .select({ count: sql<number>`count(*)` })
      .from(trackedPages);

    const results: {
      supabaseKeepAlive: boolean;
      totalMonitoredPages: number;
      target: string;
      githubActionsDispatched: {
        worker?: string;
        spyWorker?: string;
        productScraper?: string;
      };
    } = {
      supabaseKeepAlive: true,
      totalMonitoredPages: Number(dbCheck?.count || 0),
      target,
      githubActionsDispatched: {},
    };

    // Helper to dispatch GitHub Action workflow
    const dispatchWorkflow = async (workflowFile: string) => {
      if (!githubToken) return "skipped_no_token";
      try {
        const res = await fetch(
          `https://api.github.com/repos/${repoOwner}/${repoName}/actions/workflows/${workflowFile}/dispatches`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${githubToken}`,
              "Accept": "application/vnd.github.v3+json",
              "User-Agent": "External-Cron-Trigger",
            },
            body: JSON.stringify({ ref: "main" }),
          }
        );
        return res.ok ? "success_204_dispatched" : `failed_${res.status}`;
      } catch (err: any) {
        return `error: ${err.message}`;
      }
    };

    // 3. Dispatch requested workflows
    if (target === "worker" || target === "all") {
      results.githubActionsDispatched.worker = await dispatchWorkflow("worker.yml");
    }
    if (target === "spy" || target === "all") {
      results.githubActionsDispatched.spyWorker = await dispatchWorkflow("spy-worker.yml");
    }
    if (target === "scraper" || target === "all") {
      results.githubActionsDispatched.productScraper = await dispatchWorkflow("product-scraper.yml");
    }

    // 4. Record Activity Notification for Audit Trail
    await db.insert(activityNotifications).values({
      type: "system_alert",
      title: `⏰ Cron Trigger: ${target.toUpperCase()}`,
      message: `External cron triggered GitHub Actions: ${JSON.stringify(results.githubActionsDispatched)}`,
      severity: "info",
      actionUrl: "/analytics",
    });

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      details: results,
    });
  } catch (err: any) {
    console.error("[Cron Trigger Error]:", err);
    return NextResponse.json(
      { error: err.message || "Failed to execute cron trigger" },
      { status: 500 }
    );
  }
}
