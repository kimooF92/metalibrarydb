import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import fs from "fs";
import path from "path";
import { db, client } from "../db";
import {
  brandDomains,
  trackedPages,
  scrapedProducts,
  ads,
  adObservations,
} from "../db/schema";
import { eq, and, or, sql, desc, inArray, isNotNull } from "drizzle-orm";
import { resolveTrackableDomain } from "../lib/url-parser";
import { getOrCreateBrandDomain, linkPageToDomain } from "../lib/domain-portfolio";
import { isValidPageId } from "../lib/utils";

const BLOCKED_SHORTENERS = new Set([
  "bit.ly",
  "tinyurl.com",
  "shorturl.at",
  "wa.me",
  "api.whatsapp.com",
  "whatsapp.com",
  "facebook.com",
  "fb.com",
  "instagram.com",
  "linktr.ee",
  "cutt.ly",
  "is.gd",
  "buff.ly",
  "t.co",
  "goo.gl",
  "ow.ly",
  "bitly.com",
  "metastatus.com",
  "meta.com",
  "converty.shop", // multi-tenant subdomain base
  "myshopify.com", // generic platform root
]);

interface BackfillOptions {
  isLive: boolean;
  targetDomain?: string;
  minPages: number;
}

function parseArgs(): BackfillOptions {
  const args = process.argv.slice(2);
  const options: BackfillOptions = {
    isLive: false,
    minPages: 2,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--live" || arg === "-l") {
      options.isLive = true;
    } else if (arg === "--dry-run" || arg === "-d") {
      options.isLive = false;
    } else if (arg === "--domain" && args[i + 1]) {
      options.targetDomain = args[i + 1].trim().toLowerCase();
      i++;
    } else if (arg === "--min-pages" && args[i + 1]) {
      const val = parseInt(args[i + 1], 10);
      if (!isNaN(val) && val > 0) options.minPages = val;
      i++;
    }
  }

  return options;
}

function isValidStoreDomain(domain: string | null | undefined): boolean {
  if (!domain) return false;
  const clean = domain.trim().toLowerCase();
  if (!clean || !clean.includes(".")) return false;
  if (BLOCKED_SHORTENERS.has(clean)) return false;
  for (const shortener of BLOCKED_SHORTENERS) {
    if (clean === shortener || clean.endsWith(`.${shortener}`)) {
      // Allow specific multi-tenant subdomains if they have >= 3 segments
      if (clean.endsWith("converty.shop") && clean.split(".").length >= 3) {
        return true;
      }
      return false;
    }
  }
  return true;
}

interface PageEvidence {
  trackedPageId?: string;
  pageId: string;
  displayName: string;
  currentResults: number;
  existingDomainId?: string | null;
  existingRole?: string | null;
  domainScores: Map<string, { score: number; sources: string[] }>;
}

async function main() {
  const options = parseArgs();
  console.log("==========================================================");
  console.log(` 🌐 SISTER PAGES BACKFILL SCRIPT (${options.isLive ? "LIVE EXECUTION" : "DRY RUN PREVIEW"})`);
  console.log("==========================================================");
  if (options.targetDomain) {
    console.log(`Targeting specific domain: ${options.targetDomain}`);
  }

  // 1. Fetch all tracked pages
  const allTrackedPages = await db.query.trackedPages.findMany({
    orderBy: [desc(trackedPages.currentResults), desc(trackedPages.createdAt)],
  });

  console.log(`Fetched ${allTrackedPages.length} tracked pages from database.`);

  // Map of pageId -> PageEvidence
  const pageEvidenceMap = new Map<string, PageEvidence>();

  const getOrCreateEvidence = (
    pageId: string,
    initial: {
      trackedPageId?: string;
      displayName?: string;
      currentResults?: number;
      existingDomainId?: string | null;
      existingRole?: string | null;
    }
  ): PageEvidence => {
    let ev = pageEvidenceMap.get(pageId);
    if (!ev) {
      ev = {
        pageId,
        trackedPageId: initial.trackedPageId,
        displayName: initial.displayName || `Page ${pageId}`,
        currentResults: initial.currentResults ?? 0,
        existingDomainId: initial.existingDomainId,
        existingRole: initial.existingRole,
        domainScores: new Map(),
      };
      pageEvidenceMap.set(pageId, ev);
    } else {
      if (!ev.trackedPageId && initial.trackedPageId) ev.trackedPageId = initial.trackedPageId;
      if (initial.displayName && (!ev.displayName || ev.displayName.startsWith("Page "))) {
        ev.displayName = initial.displayName;
      }
      if (initial.currentResults && initial.currentResults > ev.currentResults) {
        ev.currentResults = initial.currentResults;
      }
      if (initial.existingDomainId) ev.existingDomainId = initial.existingDomainId;
      if (initial.existingRole) ev.existingRole = initial.existingRole;
    }
    return ev;
  };

  const isUuid = (str: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

  const addEvidence = (pageId: string, rawDomain: string, points: number, source: string) => {
    if (!pageId || (!isValidPageId(pageId) && !isUuid(pageId))) return;
    const cleanDomain = resolveTrackableDomain(rawDomain).toLowerCase().trim();
    if (!isValidStoreDomain(cleanDomain)) return;
    if (options.targetDomain && cleanDomain !== options.targetDomain) return;

    const matchingTracked = allTrackedPages.find(
      (tp) => tp.pageId === pageId || tp.id === pageId
    );

    const ev = getOrCreateEvidence(pageId, {
      trackedPageId: matchingTracked?.id,
      displayName: matchingTracked?.displayName || undefined,
      currentResults: matchingTracked?.currentResults ?? 0,
      existingDomainId: matchingTracked?.brandDomainId,
      existingRole: matchingTracked?.pageRole,
    });

    const current = ev.domainScores.get(cleanDomain) || { score: 0, sources: [] };
    current.score += points;
    if (!current.sources.includes(source)) current.sources.push(source);
    ev.domainScores.set(cleanDomain, current);
  };

  // Source 1: Check trackedPages.landingPage (+1000 points)
  for (const page of allTrackedPages) {
    if (page.landingPage && !page.landingPage.includes("facebook.com")) {
      const pId = page.pageId || page.id;
      addEvidence(pId, page.landingPage, 1000, "landingPage");
    }
  }

  // Source 2: Outbound ad links (ads.link_url) (+1 point per ad)
  const adDomainRows = await db
    .select({
      pageId: ads.pageId,
      pageName: ads.pageName,
      linkUrl: ads.linkUrl,
      count: sql<number>`count(*)`.as("cnt"),
    })
    .from(ads)
    .where(and(isNotNull(ads.linkUrl), sql`trim(${ads.linkUrl}) != ''`))
    .groupBy(ads.pageId, ads.pageName, ads.linkUrl)
    .having(sql`count(*) >= 2`);

  for (const row of adDomainRows) {
    if (!row.linkUrl || !row.pageId) continue;
    const ev = getOrCreateEvidence(row.pageId, { displayName: row.pageName || undefined });
    if (row.pageName && (!ev.displayName || ev.displayName.startsWith("Page "))) {
      ev.displayName = row.pageName;
    }
    addEvidence(row.pageId, row.linkUrl, Number(row.count), `ads.link_url (${row.count})`);
  }

  // Source 3: Scraped products domain (+5 points per product)
  const productDomainRows = await db
    .select({
      pageId: scrapedProducts.pageId,
      domain: scrapedProducts.domain,
      count: sql<number>`count(*)`.as("cnt"),
    })
    .from(scrapedProducts)
    .where(and(isNotNull(scrapedProducts.domain), sql`trim(${scrapedProducts.domain}) != ''`))
    .groupBy(scrapedProducts.pageId, scrapedProducts.domain);

  for (const row of productDomainRows) {
    if (!row.domain || !row.pageId) continue;
    addEvidence(row.pageId, row.domain, Number(row.count) * 5, `scraped_products (${row.count})`);
  }

  // Group pages by their SINGLE HIGHEST EVIDENCE DOMAIN
  const domainToPagesMap = new Map<
    string,
    Array<{
      trackedPageId?: string;
      pageId: string;
      displayName: string;
      currentResults: number;
      existingDomainId?: string | null;
      existingRole?: string | null;
      source: string;
      evidenceScore: number;
      role: "primary" | "satellite";
    }>
  >();

  for (const ev of pageEvidenceMap.values()) {
    if (ev.domainScores.size === 0) continue;

    // Pick winning domain with highest score
    let bestDomain = "";
    let bestScore = -1;
    let bestSources: string[] = [];

    for (const [dom, { score, sources }] of ev.domainScores.entries()) {
      if (score > bestScore) {
        bestScore = score;
        bestDomain = dom;
        bestSources = sources;
      }
    }

    if (!bestDomain || bestScore <= 0) continue;

    if (!domainToPagesMap.has(bestDomain)) {
      domainToPagesMap.set(bestDomain, []);
    }

    domainToPagesMap.get(bestDomain)!.push({
      trackedPageId: ev.trackedPageId,
      pageId: ev.pageId,
      displayName: ev.displayName,
      currentResults: ev.currentResults,
      existingDomainId: ev.existingDomainId,
      existingRole: ev.existingRole,
      source: bestSources.join(", "),
      evidenceScore: bestScore,
      role: "satellite", // updated below
    });
  }

  // Filter to multi-page domains
  const candidatePortfolios = [];

  for (const [domain, pages] of domainToPagesMap.entries()) {
    if (pages.length >= options.minPages) {
      // Sort pages: highest currentResults / evidenceScore first
      pages.sort((a, b) => (b.currentResults || b.evidenceScore) - (a.currentResults || a.evidenceScore));

      // Designate primary: keep existing primary, or pick page with highest results
      const existingPrimary = pages.find((p) => p.existingRole === "primary");
      const primaryPageId = existingPrimary?.pageId || pages[0].pageId;

      for (const p of pages) {
        p.role = p.pageId === primaryPageId ? "primary" : "satellite";
      }

      candidatePortfolios.push({
        domain,
        pages,
      });
    }
  }

  console.log(`\nIdentified ${candidatePortfolios.length} multi-page domain portfolios (with >= ${options.minPages} pages):`);

  const report = [];

  for (const portfolio of candidatePortfolios) {
    console.log(`\n----------------------------------------------------------`);
    console.log(`🌐 DOMAIN: ${portfolio.domain} (${portfolio.pages.length} sister pages)`);
    for (const p of portfolio.pages) {
      console.log(
        `   • [${p.role.toUpperCase()}] ${p.displayName} (pageId: ${p.pageId}) - ${p.currentResults} ads [Score: ${p.evidenceScore}, Sources: ${p.source}]`
      );
    }

    if (options.isLive) {
      // 1. Resolve or create brand domain
      const primaryPage = portfolio.pages.find((p) => p.role === "primary") || portfolio.pages[0];
      const brandDomain = await getOrCreateBrandDomain(portfolio.domain, primaryPage.displayName);

      // 2. Link each page
      for (const p of portfolio.pages) {
        let trackedPageId = p.trackedPageId;

        // If page does not exist in tracked_pages yet, insert it as satellite!
        if (!trackedPageId) {
          console.log(`   ➕ Auto-creating tracked_pages entry for sister page: ${p.displayName} (${p.pageId})`);
          const adUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&view_all_page_id=${p.pageId}&search_type=page&media_type=all`;
          const [createdPage] = await db
            .insert(trackedPages)
            .values({
              url: adUrl,
              displayName: p.displayName,
              searchType: "page",
              pageId: p.pageId,
              currentResults: p.currentResults,
              status: "success",
              canonicalDomain: portfolio.domain,
              brandDomainId: brandDomain.id,
              pageRole: p.role,
            })
            .returning();
          trackedPageId = createdPage.id;
        } else {
          // Link existing tracked page
          await linkPageToDomain(trackedPageId, brandDomain.id, p.role, { forceReassign: true });
        }
      }

      // 3. Update scraped products brandDomainId
      await db
        .update(scrapedProducts)
        .set({ brandDomainId: brandDomain.id })
        .where(
          or(
            eq(scrapedProducts.domain, portfolio.domain),
            inArray(
              scrapedProducts.pageId,
              portfolio.pages.map((p) => p.pageId)
            )
          )
        );

      console.log(`   ✅ Live Portfolio linked with ID: ${brandDomain.id}`);
    }

    report.push({
      domain: portfolio.domain,
      sisterPagesCount: portfolio.pages.length,
      pages: portfolio.pages,
      status: options.isLive ? "COMMITTED" : "PREVIEW",
    });
  }

  // Ensure logs directory exists
  fs.mkdirSync("logs", { recursive: true });
  const previewPath = path.resolve(process.cwd(), "logs/backfill_preview.json");
  fs.writeFileSync(
    previewPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        mode: options.isLive ? "live" : "dry-run",
        totalAnalyzedTrackedPages: allTrackedPages.length,
        portfoliosCount: candidatePortfolios.length,
        portfolios: report,
      },
      null,
      2
    ),
    "utf8"
  );

  console.log("\n==========================================================");
  console.log(` Summary Report saved to: ${previewPath}`);
  console.log(` Mode: ${options.isLive ? "LIVE EXECUTION COMPLETE" : "DRY RUN COMPLETE (Run with --live to apply)"}`);
  console.log("==========================================================");

  // Close connection
  await client.end?.();
}

main().catch((err) => {
  console.error("Backfill Script Failed:", err);
  process.exit(1);
});
