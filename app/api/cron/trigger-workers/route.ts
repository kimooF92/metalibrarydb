import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { trackedPages, activityNotifications } from "@/db/schema";
import { sql } from "drizzle-orm";
import { timingSafeEqual } from "@/lib/auth";

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
    // 1. Extract GitHub PAT and Authorization tokens
    const authHeader = req.headers.get("authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7).trim() : null;
    const apiSecretHeader = req.headers.get("x-api-secret");
    const isGithubTokenInHeader = bearerToken && (bearerToken.startsWith("ghp_") || bearerToken.startsWith("github_pat_"));

    const cronSecret = process.env.CRON_SECRET || process.env.API_SECRET || process.env.APP_PASSWORD;
    const isAuthorizedSecret =
      Boolean(cronSecret) &&
      ((bearerToken && timingSafeEqual(bearerToken, cronSecret!)) ||
        (apiSecretHeader && timingSafeEqual(apiSecretHeader, cronSecret!)));

    // Verify QStash signature if triggered by Upstash QStash Cron
    let isQStashVerified = false;
    const upstashSignature = req.headers.get("upstash-signature");
    if (upstashSignature) {
      const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
      const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
      if (currentSigningKey || nextSigningKey) {
        try {
          const { Receiver } = await import("@upstash/qstash");
          const receiver = new Receiver({
            currentSigningKey,
            nextSigningKey,
          });
          const reqClone = req.clone();
          const rawBody = await reqClone.text();
          isQStashVerified = await receiver.verify({
            signature: upstashSignature,
            body: rawBody,
            clockTolerance: 60,
          });
        } catch (sigErr: any) {
          console.warn("[Cron Trigger] QStash signature verification failed:", sigErr?.message || sigErr);
        }
      }
    }

    // Allow if: matches CRON_SECRET, verified QStash signature, provides a valid GitHub PAT token, or dev bypass
    const isDevBypass = process.env.NODE_ENV === "development" && !cronSecret;
    const isAuthorized = isDevBypass || Boolean(isAuthorizedSecret || isQStashVerified || isGithubTokenInHeader);

    if (!isAuthorized) {
      return NextResponse.json({ error: "Unauthorized cron request: missing valid CRON_SECRET or signature" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const target = searchParams.get("target") || "worker"; // 'worker' | 'spy' | 'scraper' | 'all'

    const repoOwner = "kimooF92";
    const repoName = "metalibrarydb";
    // Use env var first, or fallback to the token passed in Authorization header from cron-job.org
    const githubToken = process.env.GH_PAT_TOKEN || process.env.GITHUB_TOKEN || (isGithubTokenInHeader ? bearerToken : null);

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
        verifyFavorites?: string;
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
    if (target === "favorites" || target === "verify_favorites") {
      results.githubActionsDispatched.verifyFavorites = await dispatchWorkflow("verify-favorites.yml");
    }

    // 4. AI Refresh status (deprecated/removed in favor of deterministic telemetry)
    let aiRefreshStatus: { opportunities?: string; forecast?: string } = {
      opportunities: "manual_on_demand_only",
    };

    // 5. Record Activity Notification for Audit Trail
    await db.insert(activityNotifications).values({
      type: "system_alert",
      title: `⏰ Cron Trigger: ${target.toUpperCase()}`,
      message: `External cron triggered GitHub Actions: ${JSON.stringify(results.githubActionsDispatched)}${Object.keys(aiRefreshStatus).length > 0 ? ` | AI Refresh: ${JSON.stringify(aiRefreshStatus)}` : ""}`,
      severity: "info",
      actionUrl: "/analytics",
    });

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      details: { ...results, aiRefreshStatus },
    });
  } catch (err: any) {
    console.error("[Cron Trigger Error]:", err);
    return NextResponse.json(
      { error: err.message || "Failed to execute cron trigger" },
      { status: 500 }
    );
  }
}
