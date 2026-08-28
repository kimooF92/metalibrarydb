import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import WebSocket from "ws";
if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as any).WebSocket = WebSocket;
}

import { db, client } from "../db";
import { scrapedProducts, ads } from "../db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
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
  search?: string;
  url?: string;
  adArchiveId?: string;
  forceAll: boolean;
  pendingOnly: boolean;
  delayMs?: number;
  shard?: string;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    forceAll: args.includes("--force") || args.includes("-f"),
    pendingOnly: args.includes("--pending") || args.includes("-P"),
  };

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--limit" || args[i] === "-l") && args[i + 1]) {
      options.limit = parseInt(args[i + 1], 10);
      i++;
    } else if ((args[i] === "--product-id" || args[i] === "-p") && args[i + 1]) {
      options.productId = args[i + 1];
      i++;
    } else if ((args[i] === "--search" || args[i] === "--query" || args[i] === "-q") && args[i + 1]) {
      options.search = args[i + 1];
      i++;
    } else if (args[i] === "--url" && args[i + 1]) {
      options.url = args[i + 1];
      i++;
    } else if ((args[i] === "--ad-id" || args[i] === "-a") && args[i + 1]) {
      options.adArchiveId = args[i + 1];
      i++;
    } else if ((args[i] === "--delay" || args[i] === "-d") && args[i + 1]) {
      options.delayMs = parseInt(args[i + 1], 10);
      i++;
    } else if ((args[i] === "--shard" || args[i] === "-s") && args[i + 1]) {
      options.shard = args[i + 1];
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
  console.log(" Available Modes & Options:");
  console.log("  1. npm run verify:pending       -> ⚡ Scan ONLY UI-queued products (fastest, ~3s)");
  console.log("  2. npm run verify:favorites     -> 🔄 Routine favorites check (skips dead products)");
  console.log("  3. ... -- --force               -> 🔴 Full re-check of ALL ads (including stopped)");
  console.log("  4. ... -- --search \"keyword\"    -> 🔍 Scan 1 product by title keyword");
  console.log("  5. ... -- --url \"store-url\"     -> 🔗 Scan 1 product by landing page URL");
  console.log("  6. ... -- --ad-id <id>          -> 🎯 Instant check for 1 specific Meta Ad ID");
  console.log("=================================================");

  // Display Active Mode
  let activeModeDescription = "🔵 DEFAULT INCREMENTAL (Routine favorites check)";
  if (options.adArchiveId) {
    activeModeDescription = `🎯 SINGLE AD DIRECT CHECK (Ad ID: ${options.adArchiveId})`;
  } else if (options.productId) {
    activeModeDescription = `📦 SINGLE PRODUCT ID (${options.productId})`;
  } else if (options.search) {
    activeModeDescription = `🔍 KEYWORD SEARCH ("${options.search}")`;
  } else if (options.url) {
    activeModeDescription = `🔗 URL MATCH ("${options.url}")`;
  } else if (options.pendingOnly) {
    activeModeDescription = "🟢 PENDING ONLY (Scanning products queued from the UI)";
  } else if (options.forceAll) {
    activeModeDescription = "🔴 FORCE ALL (Re-verifying all ads, including stopped)";
  }

  console.log(` Active Mode: ${activeModeDescription}`);
  if (options.shard) console.log(` Shard:       ${options.shard}`);
  if (options.limit) console.log(` Limit:       ${options.limit} products`);
  console.log("-------------------------------------------------\n");

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
    } else if (options.url) {
      const p = await db.query.scrapedProducts.findFirst({
        where: (prod, { ilike }) => ilike(prod.url, `%${options.url!.trim()}%`),
        columns: { id: true, title: true, url: true },
      });
      if (!p) {
        console.error(`❌ Product matching URL "${options.url}" not found.`);
        await closeBrowserSession();
        await client.end();
        process.exit(1);
      }
      targetProducts = [p];
    } else if (options.search) {
      const p = await db.query.scrapedProducts.findFirst({
        where: (prod, { ilike }) => ilike(prod.title, `%${options.search!.trim()}%`),
        columns: { id: true, title: true, url: true },
      });
      if (!p) {
        console.error(`❌ Product matching title "${options.search}" not found.`);
        await closeBrowserSession();
        await client.end();
        process.exit(1);
      }
      targetProducts = [p];
    } else if (options.pendingOnly) {
      // Direct fast query: only favorite products that have pending / un-archived ads
      const pendingRows = await db
        .selectDistinct({
          id: scrapedProducts.id,
          title: scrapedProducts.title,
          url: scrapedProducts.url,
        })
        .from(scrapedProducts)
        .innerJoin(ads, eq(ads.productId, scrapedProducts.id))
        .where(
          and(
            eq(scrapedProducts.isFavorite, true),
            sql`(${ads.isArchived} = false OR ${ads.isArchived} IS NULL)`
          )
        )
        .orderBy(desc(scrapedProducts.id))
        .limit(options.limit || 100);

      targetProducts = pendingRows;
      console.log(`🎯 [Pending Only Mode] Found ${targetProducts.length} favorite product(s) with queued/pending ads to verify.\n`);
    } else {
      // Fetch all favorite products ordered deterministically by ID
      targetProducts = await db.query.scrapedProducts.findMany({
        where: eq(scrapedProducts.isFavorite, true),
        columns: { id: true, title: true, url: true },
        orderBy: [desc(scrapedProducts.id)],
        limit: options.limit || 500,
      });
    }

    if (targetProducts.length === 0) {
      console.log("ℹ️ No favorite products found in database.");
      await closeBrowserSession();
      await client.end();
      process.exit(0);
    }

    // Apply Sharding if specified (e.g. 0/4, 1/4, 2/4, 3/4)
    if (options.shard) {
      const parts = options.shard.split("/");
      const shardIndex = parseInt(parts[0], 10);
      const shardTotal = parseInt(parts[1], 10);

      if (!isNaN(shardIndex) && !isNaN(shardTotal) && shardTotal > 0) {
        const totalBefore = targetProducts.length;
        targetProducts = targetProducts.filter((_, idx) => idx % shardTotal === shardIndex);
        console.log(
          `🧩 Shard [${shardIndex + 1}/${shardTotal}]: Allocated ${targetProducts.length} of ${totalBefore} total favorite products.\n`
        );
      }
    } else {
      console.log(`Found ${targetProducts.length} favorite product(s) to evaluate.\n`);
    }

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
