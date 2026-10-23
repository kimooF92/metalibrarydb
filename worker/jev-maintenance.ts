import { db } from "../db";
import { scrapedProducts, ads } from "../db/schema";
import { sql, eq, and, or, isNull, inArray } from "drizzle-orm";
import { classifyProductWithJev } from "../lib/typesafe-jev";
import { resolvePriceDoubtWithJev, detectExtractionDoubt, harvestPriceCandidates } from "../lib/doubt-detector";
import { formatPrice } from "../lib/format-price";
import { scrapeProductDirectHtml } from "../lib/html-scraper";

let isJevMaintenanceRunning = false;

/**
 * 1. Sweep active products currently stuck in 'General & Other' or 'General Merchandise'
 * and reclassify them into accurate e-commerce niches using TypeSafe Jev.
 */
export async function sweepAndClassifyGeneralProducts(limit = 10): Promise<number> {
  // Query explicit columns only (respecting AGENTS.md egress rules)
  const items = await db
    .select({
      id: scrapedProducts.id,
      title: scrapedProducts.title,
      url: scrapedProducts.url,
      domain: scrapedProducts.domain,
      category: scrapedProducts.category,
      subCategory: scrapedProducts.subCategory,
      adSnippet: sql<string | null>`LEFT((
        SELECT caption FROM ${ads}
        WHERE ${ads.productId} = ${scrapedProducts.id}
          AND (${ads.isArchived} = false OR ${ads.isArchived} IS NULL)
          AND caption IS NOT NULL
          AND caption != ''
        LIMIT 1
      ), 120)`,
    })
    .from(scrapedProducts)
    .where(
      and(
        sql`${scrapedProducts.scrapeStatus} NOT IN ('failed', 'deleted', 'ignored')`,
        sql`${scrapedProducts.title} IS NOT NULL AND TRIM(${scrapedProducts.title}) != ''`,
        or(
          isNull(scrapedProducts.category),
          sql`TRIM(${scrapedProducts.category}) = ''`,
          sql`LOWER(${scrapedProducts.category}) = 'uncategorized'`,
          eq(scrapedProducts.category, "General & Other"),
          sql`LOWER(${scrapedProducts.category}) LIKE '%general%'`,
          eq(scrapedProducts.subCategory, "General Merchandise"),
          isNull(scrapedProducts.subCategory),
          sql`TRIM(${scrapedProducts.subCategory}) = ''`
        ),
        sql`EXISTS (
          SELECT 1 FROM ${ads}
          WHERE ${ads.productId} = ${scrapedProducts.id}
          AND (${ads.isArchived} = false OR ${ads.isArchived} IS NULL)
        )`
      )
    )
    .orderBy(
      sql`(SELECT COUNT(*) FROM ${ads} WHERE ${ads.productId} = ${scrapedProducts.id} AND (${ads.isArchived} = false OR ${ads.isArchived} IS NULL)) DESC`,
      sql`${scrapedProducts.updatedAt} ASC NULLS FIRST`
    )
    .limit(limit);

  if (items.length === 0) {
    return 0;
  }

  console.log(`[Jev Frequency Sweep] 🏷️ Found ${items.length} active General Merchandise products to reclassify...`);
  let reclassifiedCount = 0;

  for (const item of items) {
    if (!item.title) continue;

    try {
      const result = await classifyProductWithJev(item.title, {
        url: item.url,
        domain: item.domain,
        adText: item.adSnippet,
        allowGeneral: false, // Strictly force classification into proper niches
      });

      if (result && result.category && result.category !== "General & Other") {
        await db
          .update(scrapedProducts)
          .set({
            category: result.category,
            subCategory: result.subCategory,
            targetAudience: result.targetAudience,
            updatedAt: new Date(),
          })
          .where(eq(scrapedProducts.id, item.id));

        reclassifiedCount++;
        console.log(
          `[Jev Frequency Sweep] ✨ "${item.title.slice(0, 35)}" ➔ ${result.category} > ${result.subCategory} (${result.targetAudience})`
        );
      }
    } catch (err: any) {
      console.warn(`[Jev Frequency Sweep] Classification error for "${item.title.slice(0, 30)}":`, err?.message || err);
    }
  }

  return reclassifiedCount;
}

/**
 * 2. Sweep active products with 0 DT or suspicious prices, harvest page candidates,
 * and resolve their true price via TypeSafe Jev Referee.
 */
export async function sweepAndResolveZeroPrices(limit = 8): Promise<number> {
  const zeroItems = await db
    .select({
      id: scrapedProducts.id,
      title: scrapedProducts.title,
      url: scrapedProducts.url,
      domain: scrapedProducts.domain,
      currentPrice: scrapedProducts.currentPrice,
      originalPrice: scrapedProducts.originalPrice,
      currency: scrapedProducts.currency,
      workspaceId: scrapedProducts.workspaceId,
    })
    .from(scrapedProducts)
    .where(
      and(
        sql`${scrapedProducts.scrapeStatus} NOT IN ('failed', 'deleted', 'ignored')`,
        sql`${scrapedProducts.title} IS NOT NULL AND TRIM(${scrapedProducts.title}) != ''`,
        or(
          isNull(scrapedProducts.currentPrice),
          sql`TRIM(${scrapedProducts.currentPrice}) = ''`,
          sql`TRIM(${scrapedProducts.currentPrice}) ~* '^0+(\\.0+|,0+)?(\\s*(dt|dh|tnd|mad))?$'`,
          sql`${scrapedProducts.currentPrice} = '0'`,
          // Match suspicious prices under 10 (e.g. 1 DT, 5 DT, 7 DT, 1 DH, 9 DH)
          sql`TRIM(${scrapedProducts.currentPrice}) ~* '^(dt|dh|tnd|mad)?\\s*[0-9]([.,][0-9]+)?(\\s*(dt|dh|tnd|mad))?$'`
        ),
        sql`EXISTS (
          SELECT 1 FROM ${ads}
          WHERE ${ads.productId} = ${scrapedProducts.id}
          AND (${ads.isArchived} = false OR ${ads.isArchived} IS NULL)
        )`
      )
    )
    .orderBy(
      sql`(SELECT COUNT(*) FROM ${ads} WHERE ${ads.productId} = ${scrapedProducts.id} AND (${ads.isArchived} = false OR ${ads.isArchived} IS NULL)) DESC`,
      sql`${scrapedProducts.updatedAt} ASC NULLS FIRST`
    )
    .limit(limit);

  if (zeroItems.length === 0) {
    return 0;
  }

  console.log(`[Jev Frequency Sweep] 💰 Found ${zeroItems.length} active products with 0 DT or suspicious micro-prices (< 10) to resolve...`);
  let resolvedCount = 0;

  for (const item of zeroItems) {
    if (!item.url) continue;

    const isMorocco =
      item.workspaceId === "00000000-0000-0000-0000-000000000002" ||
      /\.ma(\/|$)/i.test(item.domain || item.url);
    const itemSym = isMorocco ? "DH" : "DT";

    let resolvedThisItem = false;
    try {
      // 1. Direct fetch HTML to harvest price candidates
      const scrapeRes = await scrapeProductDirectHtml(item.url, 8000, 1, {
        defaultCurrency: isMorocco ? "MAD" : "TND",
        defaultCurrencySymbol: itemSym,
      });

      const rawHtml = scrapeRes.rawHtml || "";
      const directPrice = scrapeRes.data?.current_price;
      const directPriceNum = parseFloat(directPrice?.replace(/[^0-9.]/g, "") || "0");

      // Check if direct scrape found a valid realistic price (must be >= 10 to avoid delivery fees / quantity numbers)
      if (directPrice && !directPrice.startsWith("0") && directPriceNum >= 10) {
        const finalPrice = formatPrice(directPrice, itemSym);
        await db
          .update(scrapedProducts)
          .set({
            currentPrice: finalPrice,
            originalPrice: scrapeRes.data?.original_price
              ? formatPrice(scrapeRes.data.original_price, itemSym)
              : item.originalPrice,
            updatedAt: new Date(),
          })
          .where(eq(scrapedProducts.id, item.id));

        resolvedCount++;
        resolvedThisItem = true;
        console.log(`[Jev Frequency Sweep] 🟢 Direct resolved price for "${item.title?.slice(0, 30)}": ${finalPrice}`);
        continue;
      }

      let candidateHtml = rawHtml;
      let candidateMarkdown = "";

      // If direct HTML found no candidate >= 10, invoke rendered extractor (Firecrawl / Playwright)
      const existingCandidates = harvestPriceCandidates(rawHtml, "", itemSym);
      const hasRealisticCandidate = existingCandidates.some((c) => c.num >= 10 && !c.isDelivery);

      if (!hasRealisticCandidate) {
        try {
          const { extractProductFromUrl } = await import("../lib/firecrawl");
          const deepRes = await extractProductFromUrl(item.url);
          if (deepRes.success && deepRes.data) {
            candidateHtml = deepRes.raw?.html || deepRes.raw?.data?.html || "";
            candidateMarkdown = deepRes.raw?.markdown || deepRes.raw?.data?.markdown || "";

            const deepPriceNum = parseFloat(deepRes.data.current_price?.replace(/[^0-9.]/g, "") || "0");
            if (deepRes.data.current_price && !deepRes.data.current_price.startsWith("0") && deepPriceNum >= 10) {
              const finalPrice = formatPrice(deepRes.data.current_price, itemSym);
              await db
                .update(scrapedProducts)
                .set({
                  currentPrice: finalPrice,
                  originalPrice: deepRes.data.original_price
                    ? formatPrice(deepRes.data.original_price, itemSym)
                    : item.originalPrice,
                  updatedAt: new Date(),
                })
                .where(eq(scrapedProducts.id, item.id));

              resolvedCount++;
              resolvedThisItem = true;
              console.log(`[Jev Frequency Sweep] 🚀 Rendered resolved price for "${item.title?.slice(0, 30)}": ${finalPrice}`);
              continue;
            }
          }
        } catch (deepErr: any) {
          // fallback error ignored
        }
      }

        // 2. If direct extraction couldn't parse cleanly, run Jev Price Referee on harvested candidates
        const resolved = await resolvePriceDoubtWithJev({
          productTitle: item.title || "Product",
          extractedPrice: item.currentPrice || `0 ${itemSym}`,
          html: candidateHtml,
          markdown: candidateMarkdown,
          fallbackCurrencySymbol: itemSym,
        });

      if (resolved?.resolvedPrice && !resolved.resolvedPrice.startsWith("0")) {
        const finalPrice = formatPrice(resolved.resolvedPrice, itemSym);
        await db
          .update(scrapedProducts)
          .set({
            currentPrice: finalPrice,
            updatedAt: new Date(),
          })
          .where(eq(scrapedProducts.id, item.id));

        resolvedCount++;
        resolvedThisItem = true;
        console.log(
          `[Jev Frequency Sweep] 🎯 Jev resolved 0 DT price for "${item.title?.slice(0, 30)}" ➔ ${finalPrice} (${resolved.modelUsed})`
        );
      }
    } catch (err: any) {
      console.warn(`[Jev Frequency Sweep] Price resolution error for "${item.title?.slice(0, 30)}":`, err?.message || err);
    } finally {
      if (!resolvedThisItem) {
        // Touch updatedAt so that unresolvable items (e.g. store homepages or non-product links)
        // rotate to the back of the queue and don't block subsequent sweeps
        try {
          await db
            .update(scrapedProducts)
            .set({ updatedAt: new Date() })
            .where(eq(scrapedProducts.id, item.id));
        } catch {
          // ignore timestamp touch failure
        }
      }
    }
  }

  return resolvedCount;
}

/**
 * Master recurring maintenance sweep called by the worker on a configured frequency.
 */
export async function runJevMaintenanceSweep(): Promise<{
  reclassified: number;
  pricesResolved: number;
}> {
  if (isJevMaintenanceRunning) {
    return { reclassified: 0, pricesResolved: 0 };
  }

  isJevMaintenanceRunning = true;
  try {
    const reclassified = await sweepAndClassifyGeneralProducts(10);
    const pricesResolved = await sweepAndResolveZeroPrices(8);
    return { reclassified, pricesResolved };
  } finally {
    isJevMaintenanceRunning = false;
  }
}
