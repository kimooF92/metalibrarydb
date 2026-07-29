import { db } from "@/db";
import { trackedPages, queue, importJobs } from "@/db/schema";
import { isValidMetaAdLibraryUrl } from "@/lib/validators";
import { extractUrlMetadata, normalizeAddUrlInput } from "@/lib/url-parser";
import { parseImportFile } from "@/lib/file-parser";
import { supabase } from "@/lib/supabase";
import { inArray } from "drizzle-orm";

export interface ImportResultSummary {
  jobId: string;
  filename: string;
  totalRows: number;
  imported: number;
  duplicates: number;
  failed: number;
  autoStartThresholdExceeded: boolean;
  estimatedDaysToComplete?: number;
}

export async function processFileImport(
  fileBuffer: Buffer,
  filename: string
): Promise<ImportResultSummary> {
  // 1. Parse URLs from file
  const rawUrls = parseImportFile(fileBuffer);
  const totalRows = rawUrls.length;

  if (totalRows === 0) {
    const [job] = await db
      .insert(importJobs)
      .values({
        filename,
        totalRows: 0,
        successful: 0,
        failed: 0,
        duplicates: 0,
      })
      .returning();

    return {
      jobId: job.id,
      filename,
      totalRows: 0,
      imported: 0,
      duplicates: 0,
      failed: 0,
      autoStartThresholdExceeded: false,
    };
  }

  // 2. Upload file to Supabase Storage (optional, log warning if fails)
  let storagePath: string | null = null;
  try {
    const fileExt = filename.split(".").pop();
    const filePath = `imports/${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;

    const { data, error } = await supabase.storage
      .from("imports")
      .upload(filePath, fileBuffer, {
        contentType: filename.endsWith(".csv")
          ? "text/csv"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        upsert: true,
      });

    if (!error && data) {
      storagePath = data.path;
    }
  } catch (err) {
    console.warn("Supabase storage upload skipped or failed:", err);
  }

  // 3. Batch Deduplicate & Validate within the imported file
  const uniqueRawUrls: string[] = [];
  const seenInBatch = new Set<string>();
  let fileDuplicatesCount = 0;
  let validationFailedCount = 0;

  for (const rawUrl of rawUrls) {
    const trimmed = rawUrl.trim();
    const normalizedUrl = normalizeAddUrlInput(trimmed);
    if (!normalizedUrl || !isValidMetaAdLibraryUrl(trimmed)) {
      validationFailedCount++;
      continue;
    }

    const meta = extractUrlMetadata(normalizedUrl);
    if (seenInBatch.has(meta.url)) {
      fileDuplicatesCount++;
    } else {
      seenInBatch.add(meta.url);
      uniqueRawUrls.push(trimmed);
    }
  }

  if (uniqueRawUrls.length === 0) {
    const [job] = await db
      .insert(importJobs)
      .values({
        filename,
        filePath: storagePath,
        totalRows,
        successful: 0,
        failed: validationFailedCount,
        duplicates: fileDuplicatesCount,
      })
      .returning();

    return {
      jobId: job.id,
      filename,
      totalRows,
      imported: 0,
      duplicates: fileDuplicatesCount,
      failed: validationFailedCount,
      autoStartThresholdExceeded: false,
    };
  }

  // 4. Check existing URLs in Database
  const metadataList = uniqueRawUrls.map((url) => {
    const normalizedUrl = normalizeAddUrlInput(url);
    return extractUrlMetadata(normalizedUrl ?? url);
  });
  const parsedUrls = metadataList.map((m) => m.url);

  // Query in chunks of 500 if large
  const existingPages = await db.query.trackedPages.findMany({
    where: inArray(trackedPages.url, parsedUrls),
    columns: { url: true },
  });

  const existingUrlSet = new Set(existingPages.map((p) => p.url));

  const newMetadataToInsert = metadataList.filter(
    (m) => !existingUrlSet.has(m.url)
  );

  const dbDuplicatesCount = metadataList.length - newMetadataToInsert.length;
  const totalDuplicates = fileDuplicatesCount + dbDuplicatesCount;

  if (newMetadataToInsert.length === 0) {
    const [job] = await db
      .insert(importJobs)
      .values({
        filename,
        filePath: storagePath,
        totalRows,
        successful: 0,
        failed: validationFailedCount,
        duplicates: totalDuplicates,
      })
      .returning();

    return {
      jobId: job.id,
      filename,
      totalRows,
      imported: 0,
      duplicates: totalDuplicates,
      failed: validationFailedCount,
      autoStartThresholdExceeded: false,
    };
  }

  // 5. Bulk insert into tracked_pages & queue
  const insertedPages = await db
    .insert(trackedPages)
    .values(
      newMetadataToInsert.map((m) => ({
        url: m.url,
        displayName: m.displayName,
        searchType: m.searchType,
        pageId: m.pageId,
        status: "pending",
      }))
    )
    .returning();

  // Insert queue jobs
  await db.insert(queue).values(
    insertedPages.map((page) => ({
      trackedPageId: page.id,
      status: "pending",
    }))
  );

  const successfulCount = insertedPages.length;

  // 6. Save import job record
  const [job] = await db
    .insert(importJobs)
    .values({
      filename,
      filePath: storagePath,
      totalRows,
      successful: successfulCount,
      failed: validationFailedCount,
      duplicates: totalDuplicates,
    })
    .returning();

  // 7. Calculate threshold confirmation requirements
  const autoStartThreshold = parseInt(
    process.env.AUTO_START_THRESHOLD || "50",
    10
  );
  const autoStartThresholdExceeded = successfulCount >= autoStartThreshold;

  // Estimate completion time based on default max scans per day (e.g. 150/day)
  const maxScansPerDay = parseInt(process.env.MAX_SCANS_PER_DAY || "150", 10);
  const estimatedDaysToComplete = Math.ceil(
    successfulCount / Math.max(maxScansPerDay, 1)
  );

  return {
    jobId: job.id,
    filename,
    totalRows,
    imported: successfulCount,
    duplicates: totalDuplicates,
    failed: validationFailedCount,
    autoStartThresholdExceeded,
    estimatedDaysToComplete,
  };
}
