"use client";

import { useState, useEffect, useCallback, useMemo, useRef, useTransition } from "react";
import { DiscoveryStatusFilter } from "./use-discovery-filters";
import { DiscoveryProductPreviewItem } from "@/components/discovery/discovery-product-card";

export interface DiscoveredPage {
  id: string;
  runId: string;
  pageId: string;
  displayName: string | null;
  country: string;
  matchingAdCount: number;
  verifiedAdCount: number | null;
  sampleAdArchiveIds?: string[] | null;
  sampleCtas: string[] | null;
  sampleUrls: string[] | null;
  status: "discovered" | "verifying" | "imported" | "ignored";
  isTracked: boolean;
  trackedPageId: string | null;
  trackedCurrentResults: number | null;
  createdAt: string;

  // Ephemeral Preview Staging Fields
  previewProductTitle?: string | null;
  previewProductImage?: string | null;
  previewProductPrice?: string | null;
  previewProductCurrency?: string | null;
  previewSource?: "product_page" | "homepage_fallback" | "none" | null;
  previewScrapeStatus?:
    | "idle"
    | "pending"
    | "processing"
    | "scraped"
    | "no_product"
    | "failed"
    | "promoted"
    | "expired"
    | "ignored"
    | null;
  previewProductUrl?: string | null;
}

interface UseDiscoveredPagesOptions {
  selectedRunId: string | null;
  searchFilter: string;
  statusFilter: DiscoveryStatusFilter;
  productGridFilter?: "all" | "with_preview" | "no_preview";
  selectedPageFilter?: string | null;
  viewMode?: "grid" | "table";
  onNotify?: (message: string) => void;
}

export function useDiscoveredPages({
  selectedRunId,
  searchFilter,
  statusFilter,
  productGridFilter = "all",
  selectedPageFilter = null,
  viewMode = "grid",
  onNotify,
}: UseDiscoveredPagesOptions) {
  const [pages, setPages] = useState<DiscoveredPage[]>([]);
  const [isLoadingPages, setIsLoadingPages] = useState(false);
  const [sortBy, setSortBy] = useState<string>("matchingAdCount");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set());
  const [isActionPending, startTransition] = useTransition();
  const [mergeConfirmPending, setMergeConfirmPending] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const onNotifyRef = useRef(onNotify);
  useEffect(() => {
    onNotifyRef.current = onNotify;
  }, [onNotify]);

  const notify = useCallback((message: string) => {
    setActionMessage(message);
    onNotifyRef.current?.(message);
    setTimeout(() => {
      setActionMessage((curr) => (curr === message ? null : curr));
    }, 4500);
  }, []);

  // Fetch Discovered Pages for active run
  const fetchPages = useCallback(
    async (explicitRunId?: string) => {
      const runId = explicitRunId ?? selectedRunId;
      if (!runId) {
        setPages([]);
        return;
      }

      try {
        setIsLoadingPages(true);
        const url = `/api/discovery/pages?runId=${runId}&sortBy=${sortBy}&sortOrder=${sortOrder}${
          searchFilter ? `&q=${encodeURIComponent(searchFilter)}` : ""
        }`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.success && Array.isArray(data.pages)) {
          setPages(data.pages);
        }
      } catch {
        // Fetch error silently
      } finally {
        setIsLoadingPages(false);
      }
    },
    [selectedRunId, sortBy, sortOrder, searchFilter]
  );

  useEffect(() => {
    if (selectedRunId) {
      fetchPages(selectedRunId);
    } else {
      setPages([]);
    }
  }, [selectedRunId, fetchPages]);

  const handleSortChange = useCallback(
    (col: string) => {
      if (col === sortBy) {
        setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
      } else {
        setSortBy(col);
        setSortOrder("desc");
      }
    },
    [sortBy]
  );

  // Sorting
  const sortedPages = useMemo(() => {
    return [...pages].sort((a, b) => {
      let valA: any = a[sortBy as keyof DiscoveredPage];
      let valB: any = b[sortBy as keyof DiscoveredPage];

      if (sortBy === "verifiedAdCount") {
        valA = a.verifiedAdCount ?? -1;
        valB = b.verifiedAdCount ?? -1;
      } else if (sortBy === "displayName") {
        valA = (a.displayName || "").toLowerCase();
        valB = (b.displayName || "").toLowerCase();
      } else if (sortBy === "pageId") {
        valA = (a.pageId || "").toLowerCase();
        valB = (b.pageId || "").toLowerCase();
      } else if (sortBy === "status") {
        const statusOrder: Record<string, number> = {
          verifying: 1,
          discovered: 2,
          tracked: 3,
          imported: 4,
          ignored: 5,
        };
        const statusA = a.isTracked ? "tracked" : a.status;
        const statusB = b.isTracked ? "tracked" : b.status;
        valA = statusOrder[statusA] || 99;
        valB = statusOrder[statusB] || 99;
      }

      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
  }, [pages, sortBy, sortOrder]);

  // Client-side status filter
  const filteredPages = useMemo(() => {
    return sortedPages.filter((p) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "discovered")
        return !p.isTracked && p.status !== "imported" && p.status !== "ignored";
      if (statusFilter === "verified")
        return (
          !p.isTracked &&
          p.status !== "imported" &&
          p.status !== "ignored" &&
          p.verifiedAdCount !== null
        );
      if (statusFilter === "verified_high")
        return (
          !p.isTracked &&
          p.status !== "imported" &&
          p.status !== "ignored" &&
          p.verifiedAdCount !== null &&
          p.verifiedAdCount >= 10
        );
      if (statusFilter === "verifying") return p.status === "verifying";
      if (statusFilter === "imported")
        return (p.isTracked || p.status === "imported") && p.status !== "ignored";
      if (statusFilter === "ignored") return p.status === "ignored";
      return true;
    });
  }, [sortedPages, statusFilter]);

  // Displayed pages (further filtered by second sidebar & product grid toggle)
  const displayedPages = useMemo(() => {
    return filteredPages.filter((p) => {
      if (
        selectedPageFilter &&
        p.pageId !== selectedPageFilter &&
        p.id !== selectedPageFilter
      ) {
        return false;
      }
      if (viewMode === "grid") {
        if (productGridFilter === "with_preview" && !p.previewProductImage) {
          return false;
        }
        if (productGridFilter === "no_preview" && p.previewProductImage) {
          return false;
        }
      }
      return true;
    });
  }, [filteredPages, selectedPageFilter, viewMode, productGridFilter]);

  // Counts
  const untrackedCount = useMemo(
    () => pages.filter((p) => !p.isTracked && p.status !== "ignored").length,
    [pages]
  );
  const newDiscoveredCount = useMemo(
    () => pages.filter((p) => !p.isTracked && p.status === "discovered").length,
    [pages]
  );
  const verifiedCount = useMemo(
    () =>
      pages.filter(
        (p) =>
          !p.isTracked &&
          p.status !== "imported" &&
          p.status !== "ignored" &&
          p.verifiedAdCount !== null
      ).length,
    [pages]
  );
  const verifiedHighCount = useMemo(
    () =>
      pages.filter(
        (p) =>
          !p.isTracked &&
          p.status !== "imported" &&
          p.status !== "ignored" &&
          p.verifiedAdCount !== null &&
          p.verifiedAdCount >= 10
      ).length,
    [pages]
  );
  const ignoredCount = useMemo(
    () => pages.filter((p) => p.status === "ignored").length,
    [pages]
  );
  const dismissableRemainingCount = useMemo(
    () =>
      pages.filter(
        (p) => !p.isTracked && p.status !== "imported" && p.status !== "ignored"
      ).length,
    [pages]
  );
  const totalExtractedProductsCount = useMemo(() => {
    return filteredPages.filter((p) => Boolean(p.previewProductImage)).length;
  }, [filteredPages]);

  // Selection toggle handlers
  const toggleSelectAll = useCallback(() => {
    const selectableIds = filteredPages.map((p) => p.id);
    if (
      selectableIds.every((id) => selectedPageIds.has(id)) &&
      selectableIds.length > 0
    ) {
      setSelectedPageIds((prev) => {
        const next = new Set(prev);
        selectableIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedPageIds((prev) => {
        const next = new Set(prev);
        selectableIds.forEach((id) => next.add(id));
        return next;
      });
    }
  }, [filteredPages, selectedPageIds]);

  const toggleSelectPage = useCallback((id: string) => {
    setSelectedPageIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedPageIds(new Set());
  }, []);

  // Batch Verify
  const handleVerifySelected = useCallback(async () => {
    if (selectedPageIds.size === 0) return;
    startTransition(async () => {
      try {
        const res = await fetch("/api/discovery/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ discoveredPageIds: Array.from(selectedPageIds) }),
        });
        const data = await res.json();
        if (data.success) {
          onNotifyRef.current?.(
            `Enqueued ad count verification for ${data.verifiedCount} pages! Worker is checking Meta...`
          );
          if (selectedRunId) fetchPages(selectedRunId);
        } else {
          onNotifyRef.current?.(`Verification failed: ${data.error}`);
        }
      } catch (err: any) {
        onNotifyRef.current?.(`Verification error: ${err.message}`);
      }
    });
  }, [selectedPageIds, selectedRunId, fetchPages]);

  // Single Verify
  const handleVerifyPage = useCallback(
    async (pageId: string) => {
      startTransition(async () => {
        try {
          const res = await fetch("/api/discovery/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ discoveredPageIds: [pageId] }),
          });
          const data = await res.json();
          if (data.success) {
            onNotifyRef.current?.(`Enqueued ad count verification! Worker is checking Meta...`);
            if (selectedRunId) fetchPages(selectedRunId);
          } else {
            onNotifyRef.current?.(`Verification failed: ${data.error}`);
          }
        } catch (err: any) {
          onNotifyRef.current?.(`Verification error: ${err.message}`);
        }
      });
    },
    [selectedRunId, fetchPages]
  );

  // Merge Selected
  const handleMergeSelected = useCallback(
    async (explicitIds?: string[]) => {
      const idsToMerge =
        explicitIds ??
        Array.from(selectedPageIds).filter(
          (id) => !pages.find((p) => p.id === id)?.isTracked
        );
      if (idsToMerge.length === 0) return;
      setMergeConfirmPending(false);
      startTransition(async () => {
        try {
          const res = await fetch("/api/discovery/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ discoveredPageIds: idsToMerge }),
          });
          const data = await res.json();
          if (data.success) {
            onNotifyRef.current?.(
              `✓ Successfully merged ${data.importedCount} page${
                data.importedCount !== 1 ? "s" : ""
              } into your tracking dashboard!`
            );
            setSelectedPageIds(new Set());
            if (selectedRunId) fetchPages(selectedRunId);
          } else {
            onNotifyRef.current?.(`Merge failed: ${data.error}`);
          }
        } catch (err: any) {
          onNotifyRef.current?.(`Merge error: ${err.message}`);
        }
      });
    },
    [selectedPageIds, pages, selectedRunId, fetchPages]
  );

  const handleMergeSinglePage = useCallback(
    async (pageId: string) => {
      await handleMergeSelected([pageId]);
    },
    [handleMergeSelected]
  );

  // Ignore / Restore Selected
  const handleIgnoreSelected = useCallback(
    async (explicitIds?: string[], restore: boolean = false) => {
      const idsToUpdate = explicitIds ?? Array.from(selectedPageIds);
      if (idsToUpdate.length === 0) return;
      startTransition(async () => {
        try {
          const res = await fetch("/api/discovery/ignore", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ discoveredPageIds: idsToUpdate, restore }),
          });
          const data = await res.json();
          if (data.success) {
            onNotifyRef.current?.(data.message || "Updated page ignore status");
            setSelectedPageIds(new Set());
            if (selectedRunId) fetchPages(selectedRunId);
          } else {
            onNotifyRef.current?.(`Ignore action failed: ${data.error}`);
          }
        } catch (err: any) {
          onNotifyRef.current?.(`Ignore action error: ${err.message}`);
        }
      });
    },
    [selectedPageIds, selectedRunId, fetchPages]
  );

  // Dismiss Remaining Run
  const handleDismissRemainingRun = useCallback(async () => {
    if (!selectedRunId) return;
    startTransition(async () => {
      try {
        const res = await fetch("/api/discovery/ignore", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runId: selectedRunId, dismissRemaining: true }),
        });
        const data = await res.json();
        if (data.success) {
          onNotifyRef.current?.(`Dismissed ${data.ignoredCount} remaining pages in this run!`);
          setSelectedPageIds(new Set());
          fetchPages(selectedRunId);
        } else {
          onNotifyRef.current?.(`Dismiss remaining failed: ${data.error}`);
        }
      } catch (err: any) {
        onNotifyRef.current?.(`Dismiss remaining error: ${err.message}`);
      }
    });
  }, [selectedRunId, fetchPages]);

  // Product Card Auto-merge
  const handleValidateAndAutoMerge = useCallback(
    async (item: DiscoveryProductPreviewItem) => {
      try {
        const res = await fetch("/api/discovery/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ discoveredPageIds: [item.id] }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setPages((prev) =>
            prev.map((p) =>
              p.id === item.id
                ? {
                    ...p,
                    status: "imported",
                    isTracked: true,
                    previewScrapeStatus: "promoted",
                    previewProductUrl: null,
                    previewProductTitle: null,
                    previewProductImage: null,
                    previewProductPrice: null,
                    previewProductCurrency: null,
                    previewSource: "none",
                  }
                : p
            )
          );
          onNotifyRef.current?.(
            `Merged "${item.displayName || item.pageId}" & seeded product to catalog!`
          );
        } else {
          onNotifyRef.current?.(`Merge failed: ${data.error || "Unknown error"}`);
        }
      } catch (err: any) {
        onNotifyRef.current?.(`Network error during merge: ${err.message}`);
      }
    },
    []
  );

  // Product Card Merge Page Only
  const handleMergePageOnly = useCallback(
    async (item: DiscoveryProductPreviewItem) => {
      try {
        const res = await fetch("/api/discovery/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ discoveredPageIds: [item.id] }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setPages((prev) =>
            prev.map((p) =>
              p.id === item.id
                ? {
                    ...p,
                    status: "imported",
                    isTracked: true,
                    previewScrapeStatus: "promoted",
                    previewProductUrl: null,
                    previewProductTitle: null,
                    previewProductImage: null,
                    previewProductPrice: null,
                    previewProductCurrency: null,
                    previewSource: "none",
                  }
                : p
            )
          );
          onNotifyRef.current?.(
            `Merged "${item.displayName || item.pageId}" to tracking dashboard!`
          );
        } else {
          onNotifyRef.current?.(`Merge failed: ${data.error || "Unknown error"}`);
        }
      } catch (err: any) {
        onNotifyRef.current?.(`Network error during merge: ${err.message}`);
      }
    },
    []
  );

  // Ignore Card
  const handleIgnoreCard = useCallback(async (pageId: string) => {
    setPages((prev) =>
      prev.map((p) =>
        p.id === pageId
          ? {
              ...p,
              status: "ignored",
              previewScrapeStatus: "ignored",
              previewProductUrl: null,
              previewProductTitle: null,
              previewProductImage: null,
              previewProductPrice: null,
              previewProductCurrency: null,
              previewSource: "none",
            }
          : p
      )
    );

    try {
      await fetch("/api/discovery/ignore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discoveredPageIds: [pageId] }),
      });
    } catch {}
  }, []);

  // Decoupled Enrichment
  const handleEnrichRun = useCallback(
    async (resetFailed = false) => {
      if (!selectedRunId || isEnriching) return;
      try {
        setIsEnriching(true);
        const res = await fetch("/api/discovery/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runId: selectedRunId, resetFailed }),
        });
        const data = await res.json();
        if (data.success) {
          await fetchPages(selectedRunId);
          onNotifyRef.current?.(
            `Enriched ${data.outcome?.enrichedCount || 0} product(s)!`
          );
        } else {
          onNotifyRef.current?.(`Enrichment notice: ${data.error || "No products found"}`);
        }
      } catch (err: any) {
        onNotifyRef.current?.(`Enrichment failed: ${err.message}`);
      } finally {
        setIsEnriching(false);
      }
    },
    [selectedRunId, isEnriching, fetchPages]
  );

  return {
    pages,
    setPages,
    isLoadingPages,
    sortBy,
    sortOrder,
    selectedPageIds,
    isActionPending,
    mergeConfirmPending,
    setMergeConfirmPending,
    isEnriching,
    sortedPages,
    filteredPages,
    displayedPages,
    untrackedCount,
    newDiscoveredCount,
    verifiedCount,
    verifiedHighCount,
    ignoredCount,
    dismissableRemainingCount,
    totalExtractedProductsCount,
    fetchPages,
    handleSortChange,
    toggleSelectAll,
    toggleSelectPage,
    clearSelection,
    handleVerifySelected,
    handleVerifyPage,
    handleMergeSelected,
    handleMergeSinglePage,
    handleIgnoreSelected,
    handleDismissRemainingRun,
    handleValidateAndAutoMerge,
    handleMergePageOnly,
    handleIgnoreCard,
    handleEnrichRun,
  };
}
