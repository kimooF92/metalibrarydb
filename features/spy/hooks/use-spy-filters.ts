"use client";

import { useState, useEffect } from "react";
import type { AdFilterParams } from "@/types";

interface UseSpyFiltersOptions {
  filters: AdFilterParams;
  onFilterChange: (newFilters: Partial<AdFilterParams>) => void;
}

export function useSpyFilters({ filters, onFilterChange }: UseSpyFiltersOptions) {
  const [searchValue, setSearchValue] = useState<string>(filters.search || "");
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [showCustomDates, setShowCustomDates] = useState(
    Boolean(filters.dateFrom || filters.dateTo)
  );
  const [datePreset, setDatePreset] = useState<string>("all");
  const [brandSearch, setBrandSearch] = useState("");

  const excludedIds = filters.excludePageIds || [];

  const isWinnerScoreActive = Boolean(filters.minWinnerScore && filters.minWinnerScore > 0);
  const isScaleActive = Boolean(filters.minDuplications && filters.minDuplications > 1);
  const isAnglesActive = Boolean(filters.minProductCreatives && filters.minProductCreatives > 0);
  const isDaysRunningActive = Boolean(filters.minDaysRunning && filters.minDaysRunning > 0);
  const isMediaActive = Boolean(filters.mediaType && filters.mediaType !== "all");
  const isCtaActive = Boolean(filters.ctaText && filters.ctaText !== "all");
  const isDateActive = Boolean(
    filters.dateFrom || filters.dateTo || (datePreset && datePreset !== "all")
  );
  const isStatusActive = Boolean(
    filters.status && filters.status !== "all" && filters.status !== "archived"
  );
  const isExcludedActive = excludedIds.length > 0;
  const isTrackedPageActive = Boolean(filters.trackedPageId);
  const isProductFilterActive = Boolean(filters.productId || filters.productKey);
  const isGroupActive = Boolean(filters.groupBy && filters.groupBy !== "none");

  const totalActiveAdvancedCount =
    (isWinnerScoreActive ? 1 : 0) +
    (isScaleActive ? 1 : 0) +
    (isAnglesActive ? 1 : 0) +
    (isDaysRunningActive ? 1 : 0) +
    (isMediaActive ? 1 : 0) +
    (isCtaActive ? 1 : 0) +
    (isDateActive ? 1 : 0) +
    (isStatusActive ? 1 : 0) +
    (isExcludedActive ? 1 : 0) +
    (isTrackedPageActive ? 1 : 0) +
    (isProductFilterActive ? 1 : 0);

  const hasAnyActiveFilter = Boolean(
    (filters.smartPreset && filters.smartPreset !== "all") ||
      totalActiveAdvancedCount > 0 ||
      searchValue.trim() !== "" ||
      (filters.status && filters.status === "archived") ||
      isGroupActive
  );

  const [showAdvancedFilters, setShowAdvancedFilters] = useState(
    totalActiveAdvancedCount > 0
  );

  // Sync search input with 350ms debounce
  useEffect(() => {
    setSearchValue(filters.search || "");
  }, [filters.search]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if ((filters.search || "") !== searchValue) {
        onFilterChange({ search: searchValue });
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [searchValue, filters.search, onFilterChange]);

  const activePreset = filters.smartPreset || "all";

  const handlePillClick = (pillId: string) => {
    if (pillId === "all" || pillId === activePreset) {
      onFilterChange({
        smartPreset: undefined,
        status: filters.status === "archived" ? "archived" : "all",
      });
      return;
    }

    onFilterChange({
      smartPreset: pillId,
      status: "all",
    });
  };

  const handleToggleExcludeBrand = (pageId: string) => {
    const next = excludedIds.includes(pageId)
      ? excludedIds.filter((id) => id !== pageId)
      : [...excludedIds, pageId];
    onFilterChange({ excludePageIds: next });
  };

  const handleClearAllExcluded = () => {
    onFilterChange({ excludePageIds: [] });
  };

  const handleDatePreset = (preset: string) => {
    setDatePreset(preset);
    const now = new Date();
    if (preset === "all") {
      setShowCustomDates(false);
      onFilterChange({ dateFrom: undefined, dateTo: undefined });
    } else if (preset === "today") {
      setShowCustomDates(false);
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      onFilterChange({ dateFrom: startOfDay.toISOString(), dateTo: undefined });
    } else if (preset === "yesterday") {
      setShowCustomDates(false);
      const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const endOfYesterday = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - 1,
        23,
        59,
        59
      );
      onFilterChange({
        dateFrom: startOfYesterday.toISOString(),
        dateTo: endOfYesterday.toISOString(),
      });
    } else if (preset === "7days") {
      setShowCustomDates(false);
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      onFilterChange({ dateFrom: sevenDaysAgo.toISOString(), dateTo: undefined });
    } else if (preset === "30days") {
      setShowCustomDates(false);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      onFilterChange({ dateFrom: thirtyDaysAgo.toISOString(), dateTo: undefined });
    } else if (preset === "custom") {
      setShowCustomDates(true);
    }
  };

  return {
    searchValue,
    setSearchValue,
    showBrandModal,
    setShowBrandModal,
    showCustomDates,
    setShowCustomDates,
    datePreset,
    setDatePreset,
    brandSearch,
    setBrandSearch,
    showAdvancedFilters,
    setShowAdvancedFilters,
    excludedIds,
    activePreset,
    totalActiveAdvancedCount,
    hasAnyActiveFilter,
    handlePillClick,
    handleToggleExcludeBrand,
    handleClearAllExcluded,
    handleDatePreset,
  };
}

