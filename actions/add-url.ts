import { db } from "@/db";
import { trackedPages, queue } from "@/db/schema";
import { isValidMetaAdLibraryUrl } from "@/lib/validators";
import { extractUrlMetadata } from "@/lib/url-parser";
import { eq, or } from "drizzle-orm";

export interface AddUrlResult {
  success: boolean;
  message: string;
  page?: typeof trackedPages.$inferSelect;
  isDuplicate?: boolean;
}

export async function addSingleUrl(rawUrl: string): Promise<AddUrlResult> {
  const trimmed = rawUrl.trim();

  // 1. Validation
  if (!isValidMetaAdLibraryUrl(trimmed)) {
    return {
      success: false,
      message: "Invalid Meta Ad Library URL. URL must contain facebook.com/ads/library.",
    };
  }

  // Extract metadata
  const meta = extractUrlMetadata(trimmed);

  // 2. Check duplicates by URL or pageId
  const existing = await db.query.trackedPages.findFirst({
    where: meta.pageId
      ? or(eq(trackedPages.url, meta.url), eq(trackedPages.pageId, meta.pageId))
      : eq(trackedPages.url, meta.url),
  });

  if (existing) {
    return {
      success: false,
      isDuplicate: true,
      message: `URL is already tracked under display name: "${existing.displayName || existing.url}"`,
      page: existing,
    };
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
