import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { suppliers } from "@/db/schema";
import { eq, and, sql, asc } from "drizzle-orm";
import { scanSupplierNow } from "@/lib/supplier-scraper";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // Max allowed serverless duration for batch runs

/**
 * Twice-Weekly Scheduled Cron Dispatcher:
 * Scans active suppliers for new Facebook product post/album drops.
 * Scheduled to run on Mondays & Thursdays at 20:00 UTC (21:30 local).
 */
export async function GET(req: NextRequest) {
  return handleCron(req);
}

export async function POST(req: NextRequest) {
  return handleCron(req);
}

async function handleCron(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7).trim() : null;
    const cronSecret = process.env.CRON_SECRET || process.env.API_SECRET;
    const isVercelCron = req.headers.get("x-vercel-cron") === "1";
    const isAuthorized = !cronSecret || isVercelCron || bearerToken === cronSecret;

    if (!isAuthorized) {
      return NextResponse.json({ error: "Unauthorized cron request" }, { status: 401 });
    }

    // 1. Fetch active suppliers (prioritizing those never checked or least recently checked)
    const activeSuppliers = await db
      .select({
        id: suppliers.id,
        name: suppliers.name,
      })
      .from(suppliers)
      .where(eq(suppliers.status, "active"))
      .orderBy(asc(suppliers.lastCheckedAt))
      .limit(10); // Batch size to preserve serverless limits and Apify concurrency

    let totalNewPhotos = 0;
    let dropsDetected = 0;
    const results: Array<{ id: string; name: string; newPhotos: number; success: boolean }> = [];

    // 2. Scan sequentially with slight spacing to avoid Apify rate limit bursts
    for (const sup of activeSuppliers) {
      const scanResult = await scanSupplierNow(sup.id);
      if (scanResult.success) {
        totalNewPhotos += scanResult.newPhotosCount;
        if (scanResult.albumDetected || scanResult.newPhotosCount > 0) {
          dropsDetected++;
        }
      }
      results.push({
        id: sup.id,
        name: sup.name,
        newPhotos: scanResult.newPhotosCount,
        success: scanResult.success,
      });

      // 2-second debounce between scrapers
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    return NextResponse.json({
      success: true,
      suppliersChecked: activeSuppliers.length,
      totalNewPhotos,
      dropsDetected,
      results,
    });
  } catch (err: any) {
    console.error("[Cron Suppliers Watchdog] Execution error:", err);
    return NextResponse.json({ error: "Cron execution failed", message: err?.message }, { status: 500 });
  }
}

