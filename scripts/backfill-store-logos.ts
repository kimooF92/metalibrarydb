import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db, client } from "../db";
import { trackedPages, brandDomains } from "../db/schema";
import { eq, or, and, isNull, sql } from "drizzle-orm";
import { extractStoreLogoFromUrl } from "../lib/html-scraper";
import { getCleanDomain } from "../lib/utils";

interface Options {
  limit: number;
  forceAll: boolean;
  concurrency: number;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const options: Options = {
    limit: 25,
    forceAll: false,
    concurrency: 3,
  };

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--limit" || args[i] === "-l") && args[i + 1]) {
      const parsed = parseInt(args[i + 1], 10);
      if (!isNaN(parsed) && parsed > 0) options.limit = parsed;
      i++;
    } else if (args[i] === "--all" || args[i] === "-a") {
      options.limit = 1000;
    } else if (args[i] === "--force" || args[i] === "-f") {
      options.forceAll = true;
    } else if ((args[i] === "--concurrency" || args[i] === "-c") && args[i + 1]) {
      const parsed = parseInt(args[i + 1], 10);
      if (!isNaN(parsed) && parsed > 0) options.concurrency = parsed;
      i++;
    }
  }

  return options;
}

async function run() {
  const options = parseArgs();
  console.log(`\n======================================================`);
  console.log(`🛍️  STORE LOGO EXTRACTION & BACKFILL`);
  console.log(`   Limit: ${options.limit} | Concurrency: ${options.concurrency} | Force: ${options.forceAll}`);
  console.log(`======================================================\n`);

  // Cleanup any previously stored placeholder logos
  await db
    .update(brandDomains)
    .set({ profilePicUrl: null })
    .where(sql`profile_pic_url LIKE '%defaultStoreLogo%' OR profile_pic_url LIKE '%placeholder%'`)
    .catch(() => {});
  await db
    .update(trackedPages)
    .set({ profilePicUrl: null })
    .where(sql`profile_pic_url LIKE '%defaultStoreLogo%' OR profile_pic_url LIKE '%placeholder%'`)
    .catch(() => {});

  // 1. Query tracked pages needing logos
  const pageConditions = [
    or(
      sql`${trackedPages.canonicalDomain} IS NOT NULL AND ${trackedPages.canonicalDomain} != ''`,
      sql`${trackedPages.landingPage} IS NOT NULL AND ${trackedPages.landingPage} != ''`
    )
  ];

  if (!options.forceAll) {
    pageConditions.push(
      or(
        isNull(trackedPages.profilePicUrl),
        eq(trackedPages.profilePicUrl, ""),
        sql`${trackedPages.profilePicUrl} LIKE '%fbcdn.net%'`,
        sql`${trackedPages.profilePicUrl} LIKE '%facebook.com%'`
      )
    );
  }

  const pagesToProcess = await db
    .select({
      id: trackedPages.id,
      displayName: trackedPages.displayName,
      landingPage: trackedPages.landingPage,
      canonicalDomain: trackedPages.canonicalDomain,
      profilePicUrl: trackedPages.profilePicUrl,
      brandDomainId: trackedPages.brandDomainId,
    })
    .from(trackedPages)
    .where(and(...pageConditions))
    .limit(options.limit);

  console.log(`Found ${pagesToProcess.length} tracked page(s) candidate for store logo extraction.\n`);

  let updatedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  // Process concurrently in chunks
  for (let i = 0; i < pagesToProcess.length; i += options.concurrency) {
    const chunk = pagesToProcess.slice(i, i + options.concurrency);

    await Promise.all(
      chunk.map(async (page) => {
        const brandName = page.displayName || page.canonicalDomain || page.id;
        let targetUrl: string | null = null;
        const isSocial = (u: string) => /facebook\.com|fb\.com|instagram\.com|tiktok\.com|twitter\.com|youtube\.com/i.test(u);

        if (page.landingPage && page.landingPage.startsWith("http") && !isSocial(page.landingPage)) {
          try {
            // Prefer homepage URL for cleaner logo extraction
            const parsed = new URL(page.landingPage);
            targetUrl = parsed.origin;
          } catch {
            targetUrl = page.landingPage;
          }
        } else if (page.canonicalDomain && !isSocial(page.canonicalDomain)) {
          const clean = getCleanDomain(page.canonicalDomain);
          if (clean) targetUrl = `https://${clean}`;
        }

        if (!targetUrl) {
          console.log(`  ⏩ [${brandName}] No valid URL, skipping.`);
          skippedCount++;
          return;
        }

        try {
          const startTime = Date.now();
          const logoUrl = await extractStoreLogoFromUrl(targetUrl, 7000);
          const elapsed = Date.now() - startTime;

          if (logoUrl) {
            await db
              .update(trackedPages)
              .set({ profilePicUrl: logoUrl, updatedAt: new Date() })
              .where(eq(trackedPages.id, page.id));

            if (page.brandDomainId) {
              await db
                .update(brandDomains)
                .set({ profilePicUrl: logoUrl, updatedAt: new Date() })
                .where(eq(brandDomains.id, page.brandDomainId));
            }

            console.log(`  ✅ [${elapsed}ms] "${brandName}" ➔ ${logoUrl}`);
            updatedCount++;
          } else {
            console.log(`  ⚪ [${elapsed}ms] "${brandName}" ➔ No high-res logo found at ${targetUrl}`);
            failedCount++;
          }
        } catch (err: any) {
          console.warn(`  ⚠️  [${brandName}] Extraction failed: ${err.message || err}`);
          failedCount++;
        }
      })
    );
  }

  // 2. Also backfill brand_domains that have missing logos
  const domainConditions = [];
  if (!options.forceAll) {
    domainConditions.push(
      or(
        isNull(brandDomains.profilePicUrl),
        eq(brandDomains.profilePicUrl, ""),
        sql`${brandDomains.profilePicUrl} LIKE '%fbcdn.net%'`,
        sql`${brandDomains.profilePicUrl} LIKE '%facebook.com%'`
      )
    );
  }

  const missingDomains = await db
    .select({
      id: brandDomains.id,
      domain: brandDomains.domain,
      displayName: brandDomains.displayName,
      profilePicUrl: brandDomains.profilePicUrl,
    })
    .from(brandDomains)
    .where(domainConditions.length > 0 ? and(...domainConditions) : undefined)
    .limit(options.limit);

  if (missingDomains.length > 0) {
    console.log(`\nChecking ${missingDomains.length} brand domain(s) for store logos...`);
    for (const bDomain of missingDomains) {
      const clean = getCleanDomain(bDomain.domain);
      if (!clean) continue;
      const targetUrl = `https://${clean}`;
      try {
        const logoUrl = await extractStoreLogoFromUrl(targetUrl, 6000);
        if (logoUrl) {
          await db
            .update(brandDomains)
            .set({ profilePicUrl: logoUrl, updatedAt: new Date() })
            .where(eq(brandDomains.id, bDomain.id));

          console.log(`  ✅ [Brand Domain] "${bDomain.displayName || bDomain.domain}" ➔ ${logoUrl}`);
          updatedCount++;
        }
      } catch {}
    }
  }

  console.log(`\n======================================================`);
  console.log(`🏁 FINISHED: ${updatedCount} logos extracted & updated (${failedCount} unfound, ${skippedCount} skipped)`);
  console.log(`======================================================\n`);

  await client.end();
  process.exit(0);
}

run().catch(async (e) => {
  console.error("Fatal error running backfill:", e);
  await client.end();
  process.exit(1);
});
