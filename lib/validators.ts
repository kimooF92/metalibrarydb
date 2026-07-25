import { z } from "zod";

/**
 * Validates whether a string is a valid Meta Ad Library search URL.
 * Must include facebook.com/ads/library (with optional www, web, m subdomains or https protocol).
 */
export function isValidMetaAdLibraryUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;

  try {
    const trimmed = url.trim();
    // Allow URLs with or without protocol
    const urlToTest = trimmed.match(/^https?:\/\//i) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(urlToTest);

    const isFacebookDomain = /(^|\.)facebook\.com$/i.test(parsed.hostname);
    const isAdLibraryPath = /^\/ads\/library(\/|\?|$)/i.test(parsed.pathname);

    return isFacebookDomain && isAdLibraryPath;
  } catch {
    return false;
  }
}

export const singleUrlSchema = z.object({
  url: z
    .string()
    .min(1, "URL is required")
    .refine((url) => isValidMetaAdLibraryUrl(url), {
      message: "URL must be a valid Meta Ad Library URL (e.g. facebook.com/ads/library/...)",
    }),
});

export const refreshSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, "At least one ID is required"),
});

export const retrySchema = z.object({
  ids: z.array(z.string().uuid()).optional(),
});
