import { z } from "zod";
import { normalizeAddUrlInput } from "@/lib/url-parser";

/**
 * Validates whether a string is either:
 * - a Meta Ad Library search URL, or
 * - a plain website domain such as wixi.com.tn
 */
export function isValidMetaAdLibraryUrl(url: string): boolean {
  return normalizeAddUrlInput(url) !== null;
}

export const singleUrlSchema = z.object({
  url: z
    .string()
    .min(1, "URL is required")
    .refine((url) => isValidMetaAdLibraryUrl(url), {
      message:
        "Enter a Meta Ad Library URL or a website domain like wixi.com.tn.",
    }),
});

export const refreshSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, "At least one ID is required"),
});

export const retrySchema = z.object({
  ids: z.array(z.string().uuid()).optional(),
});
