"use client";

import { useState, useRef } from "react";
import type { BrandAnalyticsData } from "../types";
import type { ScrapedProduct } from "@/types";
import { resolveProductForRefresh } from "@/lib/product-extraction";
import { useToast } from "@/components/toast-context";

interface UseBrandActionsOptions {
  id: string;
  brand: BrandAnalyticsData["brand"] | null | undefined;
  products?: ScrapedProduct[];
  fetchBrandData: (
    forceRefresh?: boolean,
    sisterPageIdOverride?: string | null,
    silent?: boolean
  ) => Promise<void>;
  setData: React.Dispatch<React.SetStateAction<BrandAnalyticsData | null>>;
  onFeedRevisionIncrement?: () => void;
}

export function useBrandActions({
  id,
  brand,
  products = [],
  fetchBrandData,
  setData,
  onFeedRevisionIncrement,
}: UseBrandActionsOptions) {
  const { showToast } = useToast();

  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [isWatchlisted, setIsWatchlisted] = useState(Boolean(brand?.isWatchlisted));
  const [isTogglingWatchlist, setIsTogglingWatchlist] = useState(false);
  const [isRefreshingMedia, setIsRefreshingMedia] = useState(false);
  const [isSyncingProducts, setIsSyncingProducts] = useState(false);
  const [isQueueingLocalRescan, setIsQueueingLocalRescan] = useState(false);

  // Dedicated ref to track ongoing product refreshes without re-render thrashing
  const refreshingProductIdsRef = useRef<Set<string>>(new Set());
  const statusTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleCheckAdLibraryNow = async () => {
    const pageId = brand?.id || id;
    if (!pageId || isCheckingStatus) return;
    setIsCheckingStatus(true);
    try {
      const res = await fetch("/api/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [pageId] }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to trigger scan");
      showToast({
        title: "⚡ Ad Library Check Enqueued",
        message: "Triggered real-time verification scan for this brand.",
        type: "success",
      });

      if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
      statusTimeoutRef.current = setTimeout(() => {
        setIsCheckingStatus(false);
        fetchBrandData(true);
      }, 45000);
    } catch (err: any) {
      setIsCheckingStatus(false);
      showToast({
        title: "Check Failed",
        message: err.message || "Failed to trigger check",
        type: "error",
      });
    }
  };

  const handleToggleWatchlist = async () => {
    if (!brand || isTogglingWatchlist) return;
    setIsTogglingWatchlist(true);
    const nextState = !isWatchlisted;
    setIsWatchlisted(nextState);

    try {
      if (brand.id) {
        const res = await fetch(`/api/page/${brand.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isWatchlisted: nextState }),
        });
        if (!res.ok) throw new Error("Failed to update watchlist");
      } else {
        const res = await fetch("/api/pages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: brand.url,
            displayName: brand.displayName,
            pageId: brand.pageId,
            isWatchlisted: nextState,
          }),
        });
        if (!res.ok) throw new Error("Failed to track brand page");
      }

      showToast({
        type: "success",
        title: nextState ? "Added to Starred Watchlist" : "Removed from Watchlist",
        message: `${brand.displayName} watchlist status updated.`,
      });
      fetchBrandData(true);
    } catch (err: any) {
      setIsWatchlisted(!nextState);
      showToast({
        type: "error",
        title: "Watchlist Error",
        message: err.message || "Could not update watchlist.",
      });
    } finally {
      setIsTogglingWatchlist(false);
    }
  };

  const handleBulkRefreshMedia = async () => {
    if (isRefreshingMedia || !brand?.pageId) return;
    setIsRefreshingMedia(true);
    try {
      const res = await fetch("/api/spy/ads/bulk-refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackedPageId: brand.id || brand.pageId,
          pageId: brand.pageId,
        }),
      });
      const resData = await res.json();
      if (resData.success) {
        showToast({
          type: "success",
          title: "Brand Media Refresh Enqueued",
          message: resData.message || "Scraping fresh creative media links...",
        });
        onFeedRevisionIncrement?.();
        await fetchBrandData(true);
      } else {
        throw new Error(resData.message || "Could not refresh brand media");
      }
    } catch (err: any) {
      showToast({
        type: "error",
        title: "Refresh Error",
        message: err.message || "Failed to trigger media refresh.",
      });
    } finally {
      setIsRefreshingMedia(false);
    }
  };

  const handleSyncBrandProducts = async (forceRefresh = false) => {
    if (isSyncingProducts || !id) return;
    setIsSyncingProducts(true);
    try {
      const res = await fetch(`/api/spy/brand/${encodeURIComponent(id)}/products/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceRefresh }),
      });
      const resJson = await res.json();
      if (!res.ok || !resJson.success) {
        throw new Error(resJson.error || "Failed to sync brand products");
      }
      showToast({
        type: "success",
        title: "Products Synchronized",
        message: `${resJson.uniqueProductUrlsCount || 0} unique product URLs found: ${
          resJson.alreadyScrapedCount || 0
        } linked, ${resJson.newlyScrapedCount || 0} scraped.`,
      });
      onFeedRevisionIncrement?.();
      await fetchBrandData(true);
    } catch (err: any) {
      showToast({
        type: "error",
        title: "Product Sync Error",
        message: err.message || "Failed to sync products from brand ads.",
      });
    } finally {
      setIsSyncingProducts(false);
    }
  };

  const handleQueueBrandProductsForLocalRescan = async () => {
    if (isQueueingLocalRescan || !id) return;
    setIsQueueingLocalRescan(true);
    try {
      const res = await fetch(
        `/api/spy/brand/${encodeURIComponent(id)}/products/queue-rescan`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }
      );
      const resJson = await res.json();
      if (!res.ok || !resJson.success) {
        throw new Error(resJson.error || "Failed to set brand products for local rescan");
      }

      const brandTargetName = brand?.displayName || resJson.brandName || resJson.pageId || id;
      showToast({
        type: "success",
        title: "Queued for Local Rescan",
        message: `${resJson.count || 0} product(s) marked as Pending for local worker. To run now: npm run scrape:products -- --brand "${brandTargetName}"`,
      });

      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          products: (prev.products || []).map((p) => ({
            ...p,
            scrapeStatus: "pending",
            failureReason: "Queued for local worker rescan",
          })),
        };
      });
    } catch (err: any) {
      showToast({
        type: "error",
        title: "Local Rescan Error",
        message: err.message || "Could not queue brand products for local rescan.",
      });
    } finally {
      setIsQueueingLocalRescan(false);
    }
  };

  // Accept latest products array to resolveProductForRefresh without stale closure
  const handleRefreshProduct = async (
    productId: string,
    productOverride?: ScrapedProduct
  ) => {
    const prod = resolveProductForRefresh(productId, products, productOverride);
    if (!prod || !prod.url) {
      showToast({
        type: "error",
        title: "Refresh Unavailable",
        message: "This product has no usable landing-page URL to re-extract.",
      });
      return;
    }

    if (refreshingProductIdsRef.current.has(prod.id)) return;
    refreshingProductIdsRef.current.add(prod.id);

    try {
      const res = await fetch("/api/products/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: prod.id,
          url: prod.url,
          pageId: brand?.pageId || prod.pageId,
          forceRefresh: true,
        }),
      });
      const resJson = await res.json();
      if (resJson.success) {
        if (resJson.product) {
          const updated = resJson.product;
          setData((prev) => {
            if (!prev) return prev;
            const prevProducts = prev.products || [];
            const idx = prevProducts.findIndex((p) => p.id === updated.id || p.url === updated.url);
            const newProducts = [...prevProducts];
            if (idx >= 0) {
              newProducts[idx] = { ...newProducts[idx], ...updated };
            } else {
              newProducts.unshift(updated);
            }
            return { ...prev, products: newProducts };
          });
        }

        showToast({
          type: "success",
          title: "Product Scraped",
          message: `${resJson.product?.title || "Product"} updated successfully.`,
        });

        fetchBrandData(true, undefined, true);
      } else {
        throw new Error(resJson.error || "Failed to scrape product");
      }
    } catch (err: any) {
      showToast({
        type: "error",
        title: "Scrape Failed",
        message: err.message || "Could not scrape product page.",
      });
    } finally {
      refreshingProductIdsRef.current.delete(prod.id);
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    try {
      await fetch(`/api/products?id=${productId}`, { method: "DELETE" });
      showToast({
        type: "info",
        title: "Product Deleted",
        message: "Product removed from brand catalog.",
      });
      await fetchBrandData(true);
    } catch (err: any) {
      showToast({
        type: "error",
        title: "Delete Error",
        message: err.message || "Failed to delete product.",
      });
    }
  };

  return {
    isCheckingStatus,
    isWatchlisted,
    setIsWatchlisted,
    isTogglingWatchlist,
    isRefreshingMedia,
    isSyncingProducts,
    isQueueingLocalRescan,
    handleCheckAdLibraryNow,
    handleToggleWatchlist,
    handleBulkRefreshMedia,
    handleSyncBrandProducts,
    handleQueueBrandProductsForLocalRescan,
    handleRefreshProduct,
    handleDeleteProduct,
  };
}
