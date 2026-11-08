"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { useToast } from "@/components/toast-context";
import type { BrandAnalyticsData } from "../types";
import type { ScrapedProduct } from "@/types";
import type { BrandTabId } from "@/components/spy/brand-deep-dive-tabs";

interface UseBrandAnalyticsOptions {
  id: string;
  activeTab: BrandTabId;
}

export function useBrandAnalytics({ id, activeTab }: UseBrandAnalyticsOptions) {
  const router = useRouter();
  const { showToast } = useToast();

  const [data, setData] = useState<BrandAnalyticsData | null>(null);
  const [selectedSisterPageId, setSelectedSisterPageId] = useState<string | null>(null);
  const currentSisterPageIdRef = useRef<string | null>(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Products tab on-demand state
  const [isProductsLoaded, setIsProductsLoaded] = useState(false);
  const [isLoadingProductsTab, setIsLoadingProductsTab] = useState(false);
  const [productsTabError, setProductsTabError] = useState<string | null>(null);
  const productsAbortControllerRef = useRef<AbortController | null>(null);
  const productsRequestIdRef = useRef(0);
  const pendingProductsRef = useRef<ScrapedProduct[] | null>(null);

  const canonicalIdRef = useRef<string | null>(null);
  const primaryRequestIdRef = useRef(0);
  const silentRequestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const revalidateAbortControllerRef = useRef<AbortController | null>(null);

  // On-demand products fetcher (scope=products)
  const loadProductsTab = useCallback(
    async (force = false, sisterPageIdOverride?: string | null) => {
      if (!force && (isProductsLoaded || isLoadingProductsTab)) return;
      setIsLoadingProductsTab(true);
      setProductsTabError(null);

      productsAbortControllerRef.current?.abort();
      const controller = new AbortController();
      productsAbortControllerRef.current = controller;

      const currentReqId = ++productsRequestIdRef.current;
      const requestedSisterPageId =
        sisterPageIdOverride !== undefined ? sisterPageIdOverride : currentSisterPageIdRef.current;
      const requestedBrandId = data?.brand?.pageId || data?.brand?.id || id;

      try {
        const params = new URLSearchParams({ scope: "products" });
        if (requestedSisterPageId) params.set("sisterPageId", requestedSisterPageId);
        const res = await fetch(
          `/api/spy/brand/${encodeURIComponent(requestedBrandId)}?${params.toString()}`,
          { signal: controller.signal }
        );
        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson.error || "Failed to load products catalog");
        }
        const json = await res.json();
        if (currentReqId !== productsRequestIdRef.current) return;
        if (currentSisterPageIdRef.current !== requestedSisterPageId) return;

        const newProducts = json.products || [];
        pendingProductsRef.current = newProducts;
        setData((prev) => (prev ? { ...prev, products: newProducts } : prev));
        setIsProductsLoaded(true);
      } catch (err: any) {
        if (err.name === "AbortError") return;
        if (currentReqId !== productsRequestIdRef.current) return;
        setProductsTabError(err.message || "Could not load products catalog.");
      } finally {
        if (currentReqId === productsRequestIdRef.current) {
          setIsLoadingProductsTab(false);
        }
      }
    },
    [data?.brand?.pageId, data?.brand?.id, id, isProductsLoaded, isLoadingProductsTab]
  );

  // Load brand analytics payload with lean=true support
  const fetchBrandData = useCallback(
    async (
      forceRefresh = false,
      sisterPageIdOverride?: string | null,
      silent = false
    ) => {
      const activeControllerRef = silent ? revalidateAbortControllerRef : abortControllerRef;
      if (activeControllerRef.current) {
        activeControllerRef.current.abort();
      }
      const controller = new AbortController();
      activeControllerRef.current = controller;

      const activeRequestIdRef = silent ? silentRequestIdRef : primaryRequestIdRef;
      const currentRequestId = ++activeRequestIdRef.current;

      if (!silent && !data) {
        setIsLoadingAnalytics(true);
      }
      if (!silent) {
        setError(null);
      }

      try {
        const activeSisterId =
          sisterPageIdOverride !== undefined ? sisterPageIdOverride : selectedSisterPageId;
        const params = new URLSearchParams();
        if (forceRefresh) params.set("_t", Date.now().toString());
        if (activeSisterId) params.set("sisterPageId", activeSisterId);

        // Initial analytics tab load requests lean=true mode to omit 200+ unrendered product cards
        const isProductsTab =
          activeTab === "products" ||
          (typeof window !== "undefined" &&
            new URLSearchParams(window.location.search).get("tab") === "products");
        if (!isProductsTab) {
          params.set("lean", "true");
        }

        const queryString = params.toString() ? `?${params.toString()}` : "";
        const res = await fetch(
          `/api/spy/brand/${encodeURIComponent(id)}${queryString}`,
          {
            cache: forceRefresh ? "no-store" : "default",
            signal: controller.signal,
          }
        );
        const json = await res.json();
        if (currentRequestId !== activeRequestIdRef.current) return;
        if (!res.ok) {
          throw new Error(json.error || "Failed to load brand analytics");
        }

        setData((prev) => {
          const productsToKeep =
            pendingProductsRef.current && pendingProductsRef.current.length > 0
              ? pendingProductsRef.current
              : prev?.products && prev.products.length > 0
              ? prev.products
              : json.products && json.products.length > 0
              ? json.products
              : [];

          if (productsToKeep.length > 0) {
            setIsProductsLoaded(true);
          } else if (!isProductsTab) {
            setIsProductsLoaded(false);
          }

          return {
            ...json,
            products: productsToKeep,
          };
        });

        if (json.brand?.pageId) {
          canonicalIdRef.current = json.brand.pageId;
        }

        // If user navigated with a legacy UUID, automatically replace URL with canonical numeric pageId or clean name
        const isUuid = (str: string) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
        if (isUuid(id) && json.brand?.pageId && !isUuid(json.brand.pageId)) {
          const currentUrl = new URL(window.location.href);
          router.replace(`/spy/brand/${encodeURIComponent(json.brand.pageId)}${currentUrl.search}`);
        }
      } catch (err: any) {
        if (err.name === "AbortError") return;
        if (currentRequestId !== activeRequestIdRef.current) return;
        if (!silent) {
          setError(err.message || "Failed to load brand data");
        } else {
          console.warn("[Brand Analytics] Silent background revalidation failed:", err.message || err);
          showToast({
            type: "warning",
            title: "Metrics Refresh Delayed",
            message:
              "Product was updated, but aggregate brand metrics could not be refreshed immediately.",
          });
        }
      } finally {
        if (currentRequestId === activeRequestIdRef.current && !silent) {
          setIsLoadingAnalytics(false);
        }
      }
    },
    [activeTab, data, id, router, selectedSisterPageId, showToast]
  );

  const handleSisterPageSelect = useCallback(
    (targetSisterId: string | null) => {
      currentSisterPageIdRef.current = targetSisterId;
      setSelectedSisterPageId(targetSisterId);
      setIsProductsLoaded(false);
      productsAbortControllerRef.current?.abort();
      fetchBrandData(true, targetSisterId);
      if (activeTab === "products") {
        loadProductsTab(true, targetSisterId);
      }
    },
    [activeTab, fetchBrandData, loadProductsTab]
  );

  // Real-time row status & ad count updates via Supabase WebSockets
  useEffect(() => {
    const trackedPageId = data?.brand?.id;
    if (!trackedPageId) return;

    const supabase = getSupabase();
    const channel = supabase
      .channel(`realtime-brand-detail-${trackedPageId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tracked_pages",
          filter: `id=eq.${trackedPageId}`,
        },
        (payload) => {
          const updated = payload.new as any;
          if (!updated?.id) return;

          const rawResults =
            updated.current_results !== undefined && updated.current_results !== null
              ? updated.current_results
              : updated.currentResults !== undefined && updated.currentResults !== null
              ? updated.currentResults
              : null;
          const newCount = rawResults !== null ? Number(rawResults) : null;

          setData((prev) => {
            if (!prev || !prev.brand) return prev;
            return {
              ...prev,
              brand: {
                ...prev.brand,
                status: updated.status ?? prev.brand.status,
                currentResults: newCount !== null ? newCount : prev.brand.currentResults,
                lastChecked: updated.last_checked || updated.lastChecked || prev.brand.lastChecked,
                lastSuccessAt:
                  updated.last_success_at || updated.lastSuccessAt || prev.brand.lastSuccessAt,
                holdStatus: updated.hold_status || updated.holdStatus || prev.brand.holdStatus,
              },
            };
          });

          if (updated.status === "success" || updated.status === "failed") {
            fetchBrandData(true);
            if (updated.status === "success") {
              showToast({
                title: "⚡ Ad Count Updated",
                message: `Ad Library scan complete: ${newCount ?? 0} active ads found.`,
                type: "success",
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [data?.brand?.id, fetchBrandData, showToast]);

  useEffect(() => {
    if (canonicalIdRef.current && id === canonicalIdRef.current && data) {
      return;
    }
    setIsProductsLoaded(false);
    productsAbortControllerRef.current?.abort();
    fetchBrandData();
    return () => {
      abortControllerRef.current?.abort();
      revalidateAbortControllerRef.current?.abort();
      productsAbortControllerRef.current?.abort();
    };
  }, [id, fetchBrandData]);

  return {
    data,
    setData,
    selectedSisterPageId,
    isLoadingAnalytics,
    error,
    isProductsLoaded,
    isLoadingProductsTab,
    productsTabError,
    loadProductsTab,
    fetchBrandData,
    handleSisterPageSelect,
  };
}

