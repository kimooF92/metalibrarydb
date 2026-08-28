import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import WebSocket from "ws";
if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as any).WebSocket = WebSocket;
}

import { db, client } from "../db";
import { scrapedProducts, ads } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getBrowserSession, closeBrowserSession } from "../worker/browser";
import {
  checkSingleAdStatus,
  verifyProductFavoriteAds,
  VerifyProductResult,
} from "../worker/ad-status-checker";
import { randomDelay } from "../worker/throttle";

interface CliOptions {
  limit?: number;
  productId?: string;
  adArchiveId?: string;
  forceAll: boolean;
  delayMs?: number;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    forceAll: args.includes("--force") || args.includes("-f"),
  };

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--limit" || args[i] === "-l") && args[i + 1]) {
      options.limit = parseInt(args[i + 1], 10);
      i++;
    } else if ((args[i] === "--product-id" || args[i] === "-p") && args[i + 1]) {
      options.productId = args[i + 1];
      i++;
    } else if ((args[i] === "--ad-id" || args[i] === "-a") && args[i + 1]) {
      options.adArchiveId = args[i + 1];
      i++;
    } else if ((args[i] === "--delay" || args[i] === "-d") && args[i + 1]) {
      options.delayMs = parseInt(args[i + 1], 10);
      i++;
    }
  }

  return options;
}

async function runFavoriteAdsVerifier() {
  const options = parseArgs();
  console.log("=================================================");
  console.log(" 🌟 Meta Favorite Products Ad Status Verifier    ");
  console.log("    (Zero Firecrawl / Zero Apify Credits Used)   ");
  console.log("=================================================");
  console.log(
    `Config: forceAll=${options.forceAll}${options.limit ? `, limit=${options.limit}` : ""}${
      options.productId ? `, singleProductId=${options.productId}` : ""
    }${options.adArchiveId ? `, singleAdArchiveId=${options.adArchiveId}` : ""}\n`
  );

  const startTime = Date.now();

  try {
    const { page } = await getBrowserSession();

    // Mode 1: Single Ad Check
    if (options.adArchiveId) {
      console.log(`[Single Ad Mode] Checking Ad Archive ID: ${options.adArchiveId}...`);
      const res = await checkSingleAdStatus(page, options.adArchiveId);
      console.log("\nResult:", JSON.stringify(res, null, 2));
      await closeBrowserSession();
      await client.end();
      process.exit(0);
    }

    // Mode 2: Single Product or Batch Favorite Products
    let targetProducts: Array<{ id: string; title: string | null; url: string }> = [];

    if (options.productId) {
      const p = await db.query.scrapedProducts.findFirst({
        where: eq(scrapedProducts.id, options.productId),
        columns: { id: true, title: true, url: true },
      });
      if (!p) {
        console.error(`❌ Product ID "${options.productId}" not found.`);
        await closeBrowserSession();
        await client.end();
        process.exit(1);
      }
      targetProducts = [p];
    } else {
      // Fetch all favorite products
      targetProducts = await db.query.scrapedProducts.findMany({
        where: eq(scrapedProducts.isFavorite, true),
        columns: { id: true, title: true, url: true },
        orderBy: [desc(scrapedProducts.updatedAt)],
        limit: options.limit || 100,
      });
    }

    if (targetProducts.length === 0) {
      console.log("ℹ️ No favorite products found in database.");
      await closeBrowserSession();
      await client.end();
      process.exit(0);
    }

    console.log(`Found ${targetProducts.length} favorite product(s) to evaluate.\n`);

    let totalCheckedProducts = 0;
    let totalSkippedProducts = 0;
    let totalAdsChecked = 0;
    let totalActiveAds = 0;
    let totalNewlyArchivedAds = 0;
    let totalNotFoundAds = 0;

    for (let i = 0; i < targetProducts.length; i++) {
      const prod = targetProducts[i];
      const prodHeader = `[${i + 1}/${targetProducts.length}] Product: "${prod.title || prod.url.substring(0, 40)}"`;

      const res: VerifyProductResult = await verifyProductFavoriteAds(page, prod.id, {
        forceAll: options.forceAll,
      });

      if (res.skipped) {
        totalSkippedProducts++;
        console.log(`${prodHeader}`);
        console.log(`  ⏭️  SKIPPED: ${res.skipReason || "Already inactive"}\n`);
        continue;
      }

      totalCheckedProducts++;
      totalAdsChecked += res.checkedAdsCount;
      totalActiveAds += res.activeCount;
      totalNewlyArchivedAds += res.inactiveCount;
      totalNotFoundAds += res.notFoundCount;

      console.log(`${prodHeader} (${res.checkedAdsCount} active ads checked)`);

      for (const update of res.updatedAds) {
        if (update.currentStatus === "active") {
          console.log(`  ✅ Ad ${update.adArchiveId} -> ACTIVE`);
        } else if (update.currentStatus === "inactive") {
          console.log(`  🔴 Ad ${update.adArchiveId} -> INACTIVE (archived)`);
        } else if (update.currentStatus === "not_found") {
          console.log(`  ⚪ Ad ${update.adArchiveId} -> NOT FOUND / EXPIRED (archived)`);
        } else {
          console.log(`  ⚠️ Ad ${update.adArchiveId} -> ERROR`);
        }
      }

      console.log(
        `  📊 Summary for this product: ${res.activeCount} active, ${
          res.inactiveCount + res.notFoundCount
        } stopped\n`
      );

      // Delay between products
      if (i < targetProducts.length - 1) {
        await randomDelay(2000, 4000);
      }
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);

    console.log("=================================================");
    console.log(" 🎉 Verification Batch Complete                  ");
    console.log("=================================================");
    console.log(`⏱️ Duration: ${elapsed}s`);
    console.log(`📦 Favorite Products Processed: ${totalCheckedProducts}`);
    console.log(`⏭️ Products Skipped (Already Inactive): ${totalSkippedProducts}`);
    console.log(`🔍 Total Ads Verified: ${totalAdsChecked}`);
    console.log(`✅ Still Active Ads: ${totalActiveAds}`);
    console.log(`🔴 Newly Inactive Ads: ${totalNewlyArchivedAds}`);
    console.log(`⚪ Not Found/Expired Ads: ${totalNotFoundAds}`);
    console.log("=================================================\n");
  } catch (err: any) {
    console.error("❌ Fatal error in favorite ads verifier:", err);
  } finally {
    await closeBrowserSession();
    await client.end();
  }
}

runFavoriteAdsVerifier();
