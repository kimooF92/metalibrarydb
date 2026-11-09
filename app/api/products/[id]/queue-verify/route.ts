export const dynamic = "force-dynamic";
export const maxDuration = 60; // 60s max for serverless executions

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { scrapedProducts, ads } from "@/db/schema";
import { eq } from "drizzle-orm";
import { validateApiSecret } from "@/lib/api-guard";
import { tasks, runs } from "@trigger.dev/sdk";
import type { RecheckProductLinkedAdsResult } from "@/src/trigger/product-linked-ads-refresher";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const authError = await validateApiSecret(request);
  if (authError) return authError;

  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
    }

    // Lean product lookup (Mandatory Rule 1: No blind SELECT *)
    const product = await db.query.scrapedProducts.findFirst({
      where: eq(scrapedProducts.id, id),
      columns: {
        id: true,
        title: true,
      },
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // 1. PRIMARY ENGINE: Trigger.dev Cloud Task ($0 Apify credits, runs Playwright in Docker)
    if (process.env.TRIGGER_SECRET_KEY) {
      try {
        console.log(`[Product Ad Verify] Dispatching Trigger.dev task 'recheck-product-linked-ads' for product: ${id}...`);
        const handle = await tasks.trigger("recheck-product-linked-ads", {
          productId: id,
          force: true,
        });

        // Safe poll bounded to 22s to prevent Vercel Gateway Timeout (504/500)
        const startTime = Date.now();
        const MAX_WAIT_MS = 22000;
        let pollRun: any = null;

        while (Date.now() - startTime < MAX_WAIT_MS) {
          pollRun = await runs.retrieve(handle.id);
          if (pollRun && pollRun.isCompleted) {
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }

        if (pollRun && pollRun.isCompleted && pollRun.output) {
          const result = pollRun.output as RecheckProductLinkedAdsResult;
          return NextResponse.json({
            ...result,
            isCompleted: true,
            runId: handle.id,
          });
        }

        console.log(`[Product Ad Verify] Trigger.dev run ${handle.id} in progress, continuing asynchronously.`);
        return NextResponse.json({
          success: true,
          isCompleted: false,
          runId: handle.id,
          productId: id,
          productTitle: product.title,
          message: "Verification running in background via Trigger.dev. Results will sync automatically.",
        });
      } catch (triggerErr: any) {
        console.error(`[Product Ad Verify] Trigger.dev dispatch error: ${triggerErr?.message}`);
      }
    } else {
      console.warn("[Product Ad Verify] TRIGGER_SECRET_KEY not set; falling back to database queue reset.");
    }

    // 2. FALLBACK: Database reset for offline worker / local script pickup
    const now = new Date();
    const updatedAds = await db
      .update(ads)
      .set({
        isArchived: false,
        archivedAt: null,
        updatedAt: now,
      })
      .where(eq(ads.productId, id))
      .returning({ id: ads.id });

    await db
      .update(scrapedProducts)
      .set({
        updatedAt: now,
      })
      .where(eq(scrapedProducts.id, id));

    return NextResponse.json({
      success: true,
      isCompleted: false,
      productId: id,
      resetAdsCount: updatedAds.length,
      message: `Trigger.dev not active. Marked ${updatedAds.length} linked ads as pending for next worker scan.`,
    });
  } catch (error: any) {
    console.error("[Queue Verify API] Error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to mark product for ad verification" },
      { status: 500 }
    );
  }
}
