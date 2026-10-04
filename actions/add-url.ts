import { db } from "@/db";
import { trackedPages, queue } from "@/db/schema";
import { isValidMetaAdLibraryUrl } from "@/lib/validators";
import { extractUrlMetadata, normalizeAddUrlInput, parseTrackableUrl } from "@/lib/url-parser";
import { linkAndAutoScrapeProduct } from "@/lib/product-ingest";
import { eq, or, sql, and } from "drizzle-orm";

import { getActiveWorkspace } from "@/lib/workspace-server";

export interface AddUrlResult {
  success: boolean;
  message: string;
  page?: typeof trackedPages.$inferSelect;
  isDuplicate?: boolean;
}

export async function addSingleUrl(
  rawUrl: string,
  allowDuplicate = false,
  targetWorkspaceId?: string
): Promise<AddUrlResult> {
  const trimmed = rawUrl.trim();
  const normalizedUrl = normalizeAddUrlInput(trimmed);

  // Resolve target workspace
  let workspace = null;
  let workspaceId = targetWorkspaceId;
  if (!workspaceId) {
    workspace = await getActiveWorkspace();
    workspaceId = workspace.id;
  }

  // 1. Validation
  if (!normalizedUrl || !isValidMetaAdLibraryUrl(trimmed)) {
    return {
      success: false,
      message:
        "Enter a Meta Ad Library URL, website domain, or product link.",
    };
  }

  // Extract metadata and trackable info
  const meta = extractUrlMetadata(normalizedUrl);
  const parsedTrackable = parseTrackableUrl(trimmed);
  const landingPageDomain = parsedTrackable?.targetDomain || null;

  // 2. Check duplicates by URL, pageId, or case-insensitive displayName within this workspace
  if (!allowDuplicate) {
    const nameNorm = meta.displayName ? meta.displayName.trim().toLowerCase() : "";

    const duplicateCondition = meta.pageId
      ? or(eq(trackedPages.url, meta.url), eq(trackedPages.pageId, meta.pageId))
      : nameNorm
      ? or(
          eq(trackedPages.url, meta.url),
          sql`lower(trim(${trackedPages.displayName})) = ${nameNorm}`,
          landingPageDomain
            ? sql`lower(${trackedPages.landingPage}) = ${landingPageDomain.toLowerCase()}`
            : sql`FALSE`
        )
      : eq(trackedPages.url, meta.url);

    const existing = await db.query.trackedPages.findFirst({
      where: workspaceId
        ? and(eq(trackedPages.workspaceId, workspaceId), duplicateCondition)
        : duplicateCondition,
    });

    if (existing) {
      // If user pasted a product link for an existing brand, trigger extraction for that product
      if (parsedTrackable?.productUrl) {
        await linkAndAutoScrapeProduct({
          linkUrl: parsedTrackable.productUrl,
          pageId: existing.pageId || null,
          workspaceId: existing.workspaceId || workspaceId,
        }).catch(() => {});
      }

      return {
        success: false,
        isDuplicate: true,
        message: `Duplicate page detected: "${existing.displayName || existing.url}" is already being tracked in this workspace.`,
        page: existing,
      };
    }
  }

  // 3. Insert into tracked_pages (concurrency safe)
  const [newPage] = await db
    .insert(trackedPages)
    .values({
      url: meta.url,
      displayName: meta.displayName,
      searchType: meta.searchType,
      pageId: meta.pageId,
      landingPage: landingPageDomain,
      workspaceId: workspaceId,
      country: workspace?.countryCode || "TN",
      status: "pending",
    })
    .onConflictDoNothing()
    .returning();

  const effectivePage =
    newPage ??
    (await db.query.trackedPages.findFirst({
      where: workspaceId
        ? and(eq(trackedPages.workspaceId, workspaceId), eq(trackedPages.url, meta.url))
        : eq(trackedPages.url, meta.url),
    }));

  if (!effectivePage) {
    return {
      success: false,
      message: "Failed to create tracking record for brand.",
    };
  }

  // 4. Insert queue entry
  if (newPage) {
    await db.insert(queue).values({
      trackedPageId: effectivePage.id,
      workspaceId: workspaceId,
      jobType: "count",
      priority: parsedTrackable?.type === "product_url" ? 10 : 1,
      status: "pending",
    });
  }

  // 5. Ingest product if a product URL was submitted
  if (parsedTrackable?.productUrl) {
    await linkAndAutoScrapeProduct({
      linkUrl: parsedTrackable.productUrl,
      pageId: effectivePage.pageId || null,
      workspaceId: workspaceId,
    }).catch(() => {});
  }

  return {
    success: true,
    message: parsedTrackable?.type === "product_url"
      ? `Successfully registered brand "${landingPageDomain}" and queued product extraction.`
      : "Successfully added URL to tracking queue.",
    page: effectivePage,
  };
}
