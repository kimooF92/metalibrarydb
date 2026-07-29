import { db } from "@/db";
import { trackedPages, queue } from "@/db/schema";
import { isValidMetaAdLibraryUrl } from "@/lib/validators";
import { extractUrlMetadata, normalizeAddUrlInput } from "@/lib/url-parser";
import { eq, or, sql } from "drizzle-orm";

export interface AddUrlResult {
  success: boolean;
  message: string;
  page?: typeof trackedPages.$inferSelect;
  isDuplicate?: boolean;
}

export async function addSingleUrl(
  rawUrl: string,
  allowDuplicate = false
): Promise<AddUrlResult> {
  const trimmed = rawUrl.trim();
  const normalizedUrl = normalizeAddUrlInput(trimmed);

  // 1. Validation
  if (!normalizedUrl || !isValidMetaAdLibraryUrl(trimmed)) {
    return {
      success: false,
      message:
        "Enter a Meta Ad Library URL or a website domain like wixi.com.tn.",
    };
  }

  // Extract metadata
  const meta = extractUrlMetadata(normalizedUrl);

  // 2. Check duplicates by URL, pageId, or case-insensitive displayName (unless allowDuplicate is true)
  if (!allowDuplicate) {
    const nameNorm = meta.displayName ? meta.displayName.trim().toLowerCase() : "";

    const existing = await db.query.trackedPages.findFirst({
      where: meta.pageId
        ? or(eq(trackedPages.url, meta.url), eq(trackedPages.pageId, meta.pageId))
        : nameNorm
        ? or(
            eq(trackedPages.url, meta.url),
            sql`lower(trim(${trackedPages.displayName})) = ${nameNorm}`
          )
        : eq(trackedPages.url, meta.url),
    });

    if (existing) {
      return {
        success: false,
        isDuplicate: true,
        message: `Duplicate page detected: "${existing.displayName || existing.url}" is already being tracked.`,
        page: existing,
      };
    }
  }

  // 3. Insert into tracked_pages
  const [newPage] = await db
    .insert(trackedPages)
    .values({
      url: meta.url,
      displayName: meta.displayName,
      searchType: meta.searchType,
      pageId: meta.pageId,
      status: "pending",
    })
    .returning();

  // 4. Insert queue entry
  await db.insert(queue).values({
    trackedPageId: newPage.id,
    status: "pending",
  });

  return {
    success: true,
    message: "Successfully added URL to tracking queue.",
    page: newPage,
  };
}
