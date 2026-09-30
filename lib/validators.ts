import { z } from "zod";
import { normalizeAddUrlInput, parseTrackableUrl } from "@/lib/url-parser";

/**
 * Validates whether a string is either:
 * - a Meta Ad Library search URL,
 * - a plain website domain such as wixi.com.tn, or
 * - an e-commerce product landing page link
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
        "Enter a Meta Ad Library URL, website domain, or product link.",
    }),
});

export const addProductUrlSchema = z.object({
  url: z
    .string()
    .min(1, "Product URL is required")
    .refine(
      (url) => {
        const parsed = parseTrackableUrl(url);
        return parsed !== null && (parsed.type === "product_url" || parsed.type === "domain");
      },
      {
        message:
          "Please enter a valid product page or store website URL (e.g. https://brand.com/products/item).",
      }
    ),
  allowDuplicate: z.boolean().optional(),
  runner: z.enum(["local", "apify"]).optional().default("local"),
});

export const refreshSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, "At least one ID is required"),
});

export const retrySchema = z.object({
  ids: z.array(z.string().uuid()).optional(),
});
