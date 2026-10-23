import { NextResponse } from "next/server";
import { db } from "@/db";
import { discoveryRuns } from "@/db/schema";
import { desc, gte, or, eq, and, sql } from "drizzle-orm";
import { triggerGitHubWorkflow } from "@/lib/github";
import { parseMetaAdLibraryDiscoveryUrl } from "@/lib/url-parser";
import { getActiveWorkspace } from "@/lib/workspace-server";

export async function GET(req: Request) {
  try {
    const activeWorkspace = await getActiveWorkspace(req);
    const runs = await db.query.discoveryRuns.findMany({
      where: and(
        eq(discoveryRuns.workspaceId, activeWorkspace.id),
        or(
          gte(discoveryRuns.totalPagesDiscovered, 1),
          eq(discoveryRuns.status, "running"),
          eq(discoveryRuns.status, "pending")
        ),
        sql`(${discoveryRuns.outcomeDetails} NOT LIKE 'Inline page extraction%' OR ${discoveryRuns.outcomeDetails} IS NULL)`
      ),
      orderBy: [desc(discoveryRuns.createdAt)],
    });
    return NextResponse.json({ success: true, runs });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch discovery runs" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const activeWorkspace = await getActiveWorkspace(req);
    const body = await req.json().catch(() => ({}));

    // Parse scan limit parameters (clamped to safe bounds)
    const targetMaxAds =
      typeof body.targetMaxAds === "number" && body.targetMaxAds > 0
        ? Math.min(Math.max(body.targetMaxAds, 50), 10000)
        : typeof body.maxAds === "number" && body.maxAds > 0
        ? Math.min(Math.max(body.maxAds, 50), 10000)
        : 2500;

    const maxScrolls =
      typeof body.maxScrolls === "number" && body.maxScrolls > 0
        ? Math.min(Math.max(body.maxScrolls, 5), 500)
        : 150;

    // Mode 3: Sequence Discovery Request (Batch of URLs or Keywords)
    if (body.sequence || Array.isArray(body.urls) || Array.isArray(body.keywords) || body.urlsText || body.keywordsText) {
      const requestedType =
        body.sequenceType === "keywords" || body.sequenceType === "urls"
          ? body.sequenceType
          : (Array.isArray(body.keywords) && body.keywords.length > 0) || (typeof body.keywordsText === "string" && body.keywordsText.trim().length > 0)
          ? "keywords"
          : "urls";

      const rawUrls: string[] =
        requestedType === "urls"
          ? Array.isArray(body.urls)
            ? (body.urls as unknown[]).filter((u): u is string => typeof u === "string").map((u: string) => u.trim()).filter(Boolean)
            : typeof body.urlsText === "string"
            ? body.urlsText.split("\n").map((u: string) => u.trim()).filter(Boolean)
            : []
          : [];

      const rawKeywords: string[] =
        requestedType === "keywords"
          ? Array.isArray(body.keywords)
            ? (body.keywords as unknown[]).filter((k): k is string => typeof k === "string").map((k: string) => k.replace(/^"|"$/g, "").trim()).filter(Boolean)
            : typeof body.keywordsText === "string"
            ? body.keywordsText.split(/[\n,]+/).map((k: string) => k.replace(/^"|"$/g, "").trim()).filter(Boolean)
            : []
          : [];

      const runsToInsert: any[] = [];
      const batchId = crypto.randomUUID().slice(0, 8);
      const baseTimestamp = Date.now();

      if (requestedType === "urls" && rawUrls.length > 0) {
        // Multi-URL Sequence
        if (rawUrls.length > 15) {
          return NextResponse.json(
            { success: false, error: "Sequence limit exceeded. Maximum 15 URLs per sequence batch." },
            { status: 400 }
          );
        }

        for (let i = 0; i < rawUrls.length; i++) {
          const urlStr = rawUrls[i];
          const parsed = parseMetaAdLibraryDiscoveryUrl(urlStr);
          if (!parsed.isValid) {
            return NextResponse.json(
              { success: false, error: `Invalid URL at line ${i + 1}: ${parsed.error || "Please check URL format."}` },
              { status: 400 }
            );
          }

          const startDateMin = parsed.startDateMin ? new Date(parsed.startDateMin) : null;
          const startDateMax = parsed.startDateMax ? new Date(parsed.startDateMax) : null;

          runsToInsert.push({
            country: parsed.country || activeWorkspace.countryCode || "TN",
            searchUrl: parsed.cleanUrl,
            query: parsed.query,
            startDateMin,
            startDateMax,
            targetMaxAds,
            maxScrolls,
            workspaceId: activeWorkspace.id,
            status: "pending",
            totalAdsScanned: 0,
            totalPagesDiscovered: 0,
            outcomeDetails: `Sequence ${i + 1}/${rawUrls.length} · Batch ${batchId}`,
            // Deterministic monotonic timestamp progression to guarantee FIFO ordering in worker claims
            createdAt: new Date(baseTimestamp + i * 1000),
          });
        }
      } else if (requestedType === "keywords" && rawKeywords.length > 0) {
        // Multi-Keyword Sequence
        if (rawKeywords.length > 15) {
          return NextResponse.json(
            { success: false, error: "Sequence limit exceeded. Maximum 15 keywords per sequence batch." },
            { status: 400 }
          );
        }

        const rawCountry = typeof body.country === "string" ? body.country.trim().toUpperCase() : "";
        const country = /^[A-Z]{2,3}$/.test(rawCountry) ? rawCountry : (activeWorkspace.countryCode || "TN");
        const mediaType = body.mediaType === "video" || body.mediaType === "image" || body.mediaType === "all" ? body.mediaType : "video";

        const today = new Date();
        const defaultMin = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        let parsedMin = typeof body.startDateMin === "string" && !isNaN(new Date(body.startDateMin).getTime())
          ? new Date(body.startDateMin)
          : defaultMin;
        let parsedMax = typeof body.startDateMax === "string" && !isNaN(new Date(body.startDateMax).getTime())
          ? new Date(body.startDateMax)
          : today;

        // Auto-correct reversed dates
        if (parsedMin > parsedMax) {
          const temp = parsedMin;
          parsedMin = parsedMax;
          parsedMax = temp;
        }

        const minDateStr = parsedMin.toISOString().split("T")[0];
        const maxDateStr = parsedMax.toISOString().split("T")[0];
        const minDateParam = minDateStr ? `&start_date[min]=${minDateStr}` : "";
        const maxDateParam = `&start_date[max]=${maxDateStr || ""}`;

        for (let i = 0; i < rawKeywords.length; i++) {
          const cleanedKw = rawKeywords[i].slice(0, 100);
          const queryParam = cleanedKw === "\u200D" || !cleanedKw ? "\u200D" : `"${cleanedKw}"`;

          const searchUrl =
            `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&content_languages[0]=ar&country=${country}&is_targeted_country=false&media_type=${mediaType}&publisher_platforms[0]=facebook&publisher_platforms[1]=instagram&q=${encodeURIComponent(
              queryParam
            )}&search_type=keyword_unordered&sort_data[mode]=relevancy_monthly_grouped&sort_data[direction]=desc${minDateParam}${maxDateParam}`;

          runsToInsert.push({
            country,
            searchUrl,
            query: queryParam,
            startDateMin: parsedMin,
            startDateMax: parsedMax,
            targetMaxAds,
            maxScrolls,
            workspaceId: activeWorkspace.id,
            status: "pending",
            totalAdsScanned: 0,
            totalPagesDiscovered: 0,
            outcomeDetails: `Sequence ${i + 1}/${rawKeywords.length} · Batch ${batchId}`,
            // Deterministic monotonic timestamp progression to guarantee FIFO ordering in worker claims
            createdAt: new Date(baseTimestamp + i * 1000),
          });
        }
      }

      if (runsToInsert.length === 0) {
        return NextResponse.json(
          { success: false, error: "No valid URLs or keywords provided for sequence." },
          { status: 400 }
        );
      }

      // Single atomic batch insert (conforms to AGENTS.md performance & projection rules)
      const inserted = await db
        .insert(discoveryRuns)
        .values(runsToInsert)
        .returning({ id: discoveryRuns.id });

      return NextResponse.json({
        success: true,
        sequence: true,
        count: inserted.length,
        runIds: inserted.map((r) => r.id),
        firstRunId: inserted[0]?.id,
        batchId,
      });
    }

    // Mode 1: Direct Meta Ad Library URL
    const rawUrl = body.url || body.searchUrl;
    if (rawUrl && typeof rawUrl === "string" && rawUrl.trim()) {
      const parsed = parseMetaAdLibraryDiscoveryUrl(rawUrl);
      if (!parsed.isValid) {
        return NextResponse.json(
          { success: false, error: parsed.error || "Invalid Meta Ad Library URL" },
          { status: 400 }
        );
      }

      const startDateMin = parsed.startDateMin ? new Date(parsed.startDateMin) : null;
      const startDateMax = parsed.startDateMax ? new Date(parsed.startDateMax) : null;

      const [newRun] = await db
        .insert(discoveryRuns)
        .values({
          country: parsed.country || activeWorkspace.countryCode || "TN",
          searchUrl: parsed.cleanUrl,
          query: parsed.query,
          startDateMin,
          startDateMax,
          targetMaxAds,
          maxScrolls,
          workspaceId: activeWorkspace.id,
          status: "pending",
          totalAdsScanned: 0,
          totalPagesDiscovered: 0,
        })
        .returning();

      return NextResponse.json({
        success: true,
        runId: newRun.id,
        run: newRun,
      });
    }

    // Mode 2: Existing Search Controls (Form Builder)
    const country = (body.country || activeWorkspace.countryCode || "TN").toUpperCase().trim();
    const query = body.query || "\u200D";
    const mediaType = body.mediaType || "video";

    // Date Range calculation: Default to Last 7 Days
    const today = new Date();
    const defaultMin = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const minDateStr = body.startDateMin || defaultMin.toISOString().split("T")[0];
    const maxDateStr = body.startDateMax || today.toISOString().split("T")[0];

    const startDateMin = new Date(minDateStr);
    const startDateMax = new Date(maxDateStr);

    const minDateParam = minDateStr ? `&start_date[min]=${minDateStr}` : "";
    const maxDateParam = `&start_date[max]=${maxDateStr || ""}`;

    // Build canonical Meta Ad Library country search URL with exact requested filters
    const searchUrl =
      `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&content_languages[0]=ar&country=${country}&is_targeted_country=false&media_type=${mediaType}&publisher_platforms[0]=facebook&publisher_platforms[1]=instagram&q=${encodeURIComponent(
        query
      )}&search_type=keyword_unordered&sort_data[mode]=relevancy_monthly_grouped&sort_data[direction]=desc${minDateParam}${maxDateParam}`;

    const [newRun] = await db
      .insert(discoveryRuns)
      .values({
        country,
        searchUrl,
        query,
        startDateMin,
        startDateMax,
        targetMaxAds,
        maxScrolls,
        workspaceId: activeWorkspace.id,
        status: "pending",
        totalAdsScanned: 0,
        totalPagesDiscovered: 0,
      })
      .returning();

    return NextResponse.json({
      success: true,
      runId: newRun.id,
      run: newRun,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create discovery run" },
      { status: 500 }
    );
  }
}

