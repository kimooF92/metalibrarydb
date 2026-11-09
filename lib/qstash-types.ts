import { z } from "zod";

/**
 * Zod schema for a single extracted ad candidate.
 * Observation-scoped fields (duplicationCount, collationId, isActive) are validated
 * here and cleanly separated into the `ad_observations` table during ingestion.
 */
export const RawAdItemSchema = z.object({
  adArchiveId: z.string().min(1).max(64),
  pageId: z.string().min(1).max(64), // Numeric Meta Page ID
  pageName: z.string().nullable().optional(),
  startedRunningOn: z.string().nullable().optional(),
  caption: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  ctaText: z.string().nullable().optional(),
  linkUrl: z.string().nullable().optional(),
  mediaType: z.enum(["image", "video", "carousel", "unknown"]).default("unknown"),
  mediaUrls: z.array(z.string()).max(50).default([]),
  thumbnailUrl: z.string().nullable().optional(),
  duplicationCount: z.number().int().min(1).default(1),
  collationId: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
});

export type RawAdItem = z.infer<typeof RawAdItemSchema>;

/**
 * Zod schema for the atomic page-batch ingestion payload sent via QStash.
 * Packing all 20-50 ads for a brand scan into 1 message bounds Upstash free-tier usage
 * to 1 command per brand scan (allowing 500-800 brand scans per day).
 */
export const BatchIngestPayloadSchema = z.object({
  creativeScanId: z.string().uuid(),
  trackedPageId: z.string().uuid(),
  pageId: z.string().min(1).max(64),
  pageName: z.string().nullable().optional(),
  totalExtractedCount: z.number().int().min(0).default(0),
  ads: z.array(RawAdItemSchema).max(100),
  observedAt: z.string().default(() => new Date().toISOString()),
  scanQuality: z.enum(["complete", "partial", "unclear"]).default("complete"),
});

export type BatchIngestPayload = z.infer<typeof BatchIngestPayloadSchema>;
