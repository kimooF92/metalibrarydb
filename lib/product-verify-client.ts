import { ScrapedProduct } from "@/types";

export interface VerifyProductResult {
  success: boolean;
  isCompleted: boolean;
  runId?: string;
  productId?: string;
  activeCount?: number;
  inactiveCount?: number;
  checkedCount?: number;
  totalLinkedAds?: number;
  message?: string;
  error?: string;
}

/**
 * Dispatches an on-demand ad verification for a product via Trigger.dev.
 * If execution continues asynchronously, polls the lightweight check endpoint
 * (which queries Trigger.dev Cloud API directly with 0 database egress).
 */
export async function requestProductAdVerification(
  productId: string,
  onProgress?: (message: string) => void
): Promise<VerifyProductResult> {
  const res = await fetch(`/api/products/${encodeURIComponent(productId)}/queue-verify`, {
    method: "POST",
  });

  const data: VerifyProductResult = await res.json().catch(() => ({
    success: false,
    isCompleted: false,
    error: "Failed to parse verification response",
  }));

  if (!res.ok) {
    throw new Error(data.error || "Failed to trigger ad verification");
  }

  // If already completed synchronously
  if (data.isCompleted) {
    return data;
  }

  // If execution is in progress and we have a runId, poll Trigger.dev cloud status
  if (data.runId) {
    onProgress?.("Checking linked ads via Trigger.dev in background...");

    const maxAttempts = 12; // 12 * 2500ms = 30s
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 2500));

      try {
        const pollRes = await fetch(
          `/api/products/${encodeURIComponent(productId)}/queue-verify?runId=${encodeURIComponent(data.runId)}`
        );
        if (pollRes.ok) {
          const pollData: VerifyProductResult = await pollRes.json().catch(() => ({}));
          if (pollData.isCompleted) {
            return pollData;
          }
        }
      } catch {
        // Continue polling on transient network hiccups
      }
    }
  }

  return data;
}

/**
 * Pure utility to patch verified ad counts into a ScrapedProduct in-place.
 * Guarantees zero DOM / React dependencies and prevents unnecessary full-page refetches.
 */
export function applyVerifiedCountsToProduct(
  product: ScrapedProduct,
  verifyResult: { activeCount?: number; inactiveCount?: number }
): ScrapedProduct {
  const activeAdsCount = typeof verifyResult.activeCount === "number" ? verifyResult.activeCount : (product.activeAdsCount || 0);
  const inactiveAdsCount = typeof verifyResult.inactiveCount === "number" ? verifyResult.inactiveCount : 0;
  const verifiedTotal = activeAdsCount + inactiveAdsCount;
  const linkedAdsCount = verifiedTotal > 0 ? verifiedTotal : (product.linkedAdsCount || 0);

  const isPageOnHold = product.brandHoldStatus === "on_hold";
  const isPageInactive = product.brandHoldStatus === "inactive";
  const daysRunning = product.daysRunning || 1;
  const maxDuplications = product.maxDuplications || 1;

  const isBreakout = Boolean(
    !isPageOnHold &&
    !isPageInactive &&
    activeAdsCount > 0 &&
    daysRunning >= 7 &&
    daysRunning <= 30 &&
    maxDuplications >= 3
  );

  return {
    ...product,
    activeAdsCount,
    linkedAdsCount,
    isBreakout,
  };
}

