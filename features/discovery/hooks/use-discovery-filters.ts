"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";

export const VALID_DISCOVERY_STATUSES = [
  "all",
  "discovered",
  "verified",
  "verified_high",
  "verifying",
  "imported",
  "ignored",
] as const;

export type DiscoveryStatusFilter = (typeof VALID_DISCOVERY_STATUSES)[number];

export const VALID_DISCOVERY_MEDIA = ["all", "video", "image"] as const;
export type DiscoveryMediaType = (typeof VALID_DISCOVERY_MEDIA)[number];

export interface DiscoveryFiltersState {
  selectedRunId: string | null;
  country: string;
  mediaType: DiscoveryMediaType;
  searchFilter: string;
  statusFilter: DiscoveryStatusFilter;
}

export function getInitialDiscoveryState(): DiscoveryFiltersState {
  const defaults: DiscoveryFiltersState = {
    selectedRunId: null,
    country: "TN",
    mediaType: "video",
    searchFilter: "",
    statusFilter: "all",
  };

  if (typeof window === "undefined") return defaults;

  try {
    // 1. Load saved state from localStorage or sessionStorage
    let saved: Partial<DiscoveryFiltersState> = {};
    const rawSaved =
      localStorage.getItem("discovery_filters") ||
      sessionStorage.getItem("discovery_filters");

    if (rawSaved) {
      try {
        saved = JSON.parse(rawSaved);
      } catch {}
    }

    if (saved.statusFilter === ("high_potential" as any)) {
      saved.statusFilter = "verified_high";
    }
    if (saved.statusFilter && !VALID_DISCOVERY_STATUSES.includes(saved.statusFilter)) {
      saved.statusFilter = "all";
    }
    if (saved.mediaType && !VALID_DISCOVERY_MEDIA.includes(saved.mediaType)) {
      saved.mediaType = "video";
    }

    const state: DiscoveryFiltersState = {
      ...defaults,
      ...saved,
    };

    // 2. Overlay individual URL query parameters if present
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has("runId")) state.selectedRunId = urlParams.get("runId") || null;
    if (urlParams.has("country")) state.country = urlParams.get("country") || "TN";
    if (urlParams.has("mediaType")) {
      const mt = urlParams.get("mediaType");
      state.mediaType = mt && VALID_DISCOVERY_MEDIA.includes(mt as any) ? (mt as any) : "video";
    }
    if (urlParams.has("search")) state.searchFilter = urlParams.get("search") || "";
    if (urlParams.has("status")) {
      const s = urlParams.get("status");
      if (s === "high_potential") {
        state.statusFilter = "verified_high";
      } else {
        state.statusFilter = s && VALID_DISCOVERY_STATUSES.includes(s as any) ? (s as any) : "all";
      }
    }

    return state;
  } catch (e) {
    console.error("Error reading discovery params:", e);
  }

  return defaults;
}

export function syncDiscoveryStateToUrl(state: DiscoveryFiltersState) {
  if (typeof window === "undefined") return;
  try {
    const query = new URLSearchParams();
    if (state.selectedRunId) query.set("runId", state.selectedRunId);
    if (state.country && state.country !== "TN") query.set("country", state.country);
    if (state.mediaType && state.mediaType !== "video") query.set("mediaType", state.mediaType);
    if (state.searchFilter) query.set("search", state.searchFilter);
    if (state.statusFilter && state.statusFilter !== "all") query.set("status", state.statusFilter);

    const queryString = query.toString();
    const newUrl = queryString ? `${window.location.pathname}?${queryString}` : window.location.pathname;
    window.history.replaceState(null, "", newUrl);

    const payload = JSON.stringify(state);
    sessionStorage.setItem("discovery_filters", payload);
    localStorage.setItem("discovery_filters", payload);
  } catch (e) {
    console.error("Error syncing discovery state:", e);
  }
}

export function useDiscoveryFilters() {
  const [mounted, setMounted] = useState(false);

  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [country, setCountry] = useState("TN");
  const [mediaType, setMediaType] = useState<DiscoveryMediaType>("video");
  const [searchFilter, setSearchFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<DiscoveryStatusFilter>("all");

  // View mode, second sidebar, page filter, and product grid filter
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [selectedPageFilter, setSelectedPageFilter] = useState<string | null>(null);
  const [productGridFilter, setProductGridFilter] = useState<"all" | "with_preview" | "no_preview">("all");

  // Load saved state on mount to guarantee hydration match
  useEffect(() => {
    const init = getInitialDiscoveryState();
    if (init.selectedRunId) setSelectedRunId(init.selectedRunId);
    if (init.country) setCountry(init.country);
    if (init.mediaType) setMediaType(init.mediaType);
    if (init.searchFilter) setSearchFilter(init.searchFilter);
    if (init.statusFilter) setStatusFilter(init.statusFilter);

    try {
      const savedViewMode = localStorage.getItem("discovery_view_mode");
      if (savedViewMode === "grid" || savedViewMode === "table") {
        setViewMode(savedViewMode);
      }
      const savedCollapse = localStorage.getItem("discovery_sidebar_collapsed");
      if (savedCollapse === "true") {
        setIsSidebarCollapsed(true);
      }
    } catch {}

    setMounted(true);
  }, []);

  // Sync state to URL and session storage only after client has mounted
  useEffect(() => {
    if (!mounted) return;
    syncDiscoveryStateToUrl({
      selectedRunId,
      country,
      mediaType,
      searchFilter,
      statusFilter,
    });
  }, [selectedRunId, country, mediaType, searchFilter, statusFilter, mounted]);

  // Sync on browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const init = getInitialDiscoveryState();
      setSelectedRunId(init.selectedRunId);
      setCountry(init.country);
      setMediaType(init.mediaType);
      setSearchFilter(init.searchFilter);
      setStatusFilter(init.statusFilter);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const handleToggleViewMode = useCallback((mode: "grid" | "table") => {
    setViewMode(mode);
    try {
      localStorage.setItem("discovery_view_mode", mode);
    } catch {}
  }, []);

  const handleToggleSidebar = useCallback(() => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("discovery_sidebar_collapsed", String(next));
      } catch {}
      return next;
    });
  }, []);

  const handleResetFilters = useCallback(() => {
    setSearchFilter("");
    setStatusFilter("all");
    setSelectedPageFilter(null);
    setProductGridFilter("all");
  }, []);

  // Memoized filters object to avoid re-render churn
  const filters = useMemo(
    () => ({
      selectedRunId,
      country,
      mediaType,
      searchFilter,
      statusFilter,
      viewMode,
      isSidebarCollapsed,
      selectedPageFilter,
      productGridFilter,
    }),
    [
      selectedRunId,
      country,
      mediaType,
      searchFilter,
      statusFilter,
      viewMode,
      isSidebarCollapsed,
      selectedPageFilter,
      productGridFilter,
    ]
  );

  return {
    ...filters,
    filters,
    mounted,
    setSelectedRunId,
    setCountry,
    setMediaType,
    setSearchFilter,
    setStatusFilter,
    setViewMode,
    setIsSidebarCollapsed,
    setSelectedPageFilter,
    setProductGridFilter,
    handleToggleViewMode,
    handleToggleSidebar,
    handleResetFilters,
  };
}
