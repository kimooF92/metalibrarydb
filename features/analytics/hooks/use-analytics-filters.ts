"use client";

import { useState, useEffect, useCallback } from "react";
import type { MainAnalyticsTab, BrandSubTab, DateRange } from "../types";

function getInitialTab(): MainAnalyticsTab {
  if (typeof window === "undefined") return "pages";
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get("tab");
    if (tabParam === "ads" || tabParam === "pages" || tabParam === "products") {
      return tabParam as MainAnalyticsTab;
    }
    if (
      tabParam &&
      ["scaling", "descaling", "top", "watchlist", "attention"].includes(tabParam)
    ) {
      return "pages";
    }
    const saved = localStorage.getItem("analytics_main_tab");
    if (saved === "ads" || saved === "pages" || saved === "products") {
      return saved as MainAnalyticsTab;
    }
  } catch {}
  return "pages";
}

function getInitialSubTab(): BrandSubTab {
  if (typeof window === "undefined") return "scaling";
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const subParam = urlParams.get("sub");
    if (
      subParam &&
      ["scaling", "descaling", "top", "watchlist", "attention"].includes(subParam)
    ) {
      return subParam as BrandSubTab;
    }
  } catch {}
  return "scaling";
}

function isDateRange(value: string | null): value is DateRange {
  return value === "today" || value === "7d" || value === "15d" || value === "30d";
}

function getInitialDateRange(): DateRange {
  if (typeof window === "undefined") return "7d";
  try {
    const urlRange = new URLSearchParams(window.location.search).get("range");
    if (isDateRange(urlRange)) return urlRange;

    const saved = localStorage.getItem("analytics_date_range");
    if (isDateRange(saved)) return saved;
  } catch {}
  return "7d";
}

function syncStateToUrl(tab: MainAnalyticsTab, range: DateRange, subTab?: BrandSubTab) {
  if (typeof window === "undefined") return;
  try {
    const query = new URLSearchParams(window.location.search);
    query.set("tab", tab);
    query.set("range", range);
    if (tab === "pages" && subTab) {
      query.set("sub", subTab);
    } else {
      query.delete("sub");
    }
    const newUrl = `${window.location.pathname}?${query.toString()}`;
    window.history.replaceState(null, "", newUrl);
    localStorage.setItem("analytics_main_tab", tab);
    localStorage.setItem("analytics_date_range", range);
  } catch {}
}

export function useAnalyticsFilters() {
  const [activeTab, setActiveTab] = useState<MainAnalyticsTab>(() => getInitialTab());
  const [dateRange, setDateRange] = useState<DateRange>(() => getInitialDateRange());
  const [pageSubTab, setPageSubTab] = useState<BrandSubTab>(() => getInitialSubTab());

  const handleTabChange = useCallback(
    (tab: MainAnalyticsTab) => {
      setActiveTab(tab);
      syncStateToUrl(tab, dateRange, tab === "pages" ? pageSubTab : undefined);
    },
    [dateRange, pageSubTab]
  );

  const handleDateRangeChange = useCallback(
    (range: DateRange) => {
      setDateRange(range);
      syncStateToUrl(activeTab, range, activeTab === "pages" ? pageSubTab : undefined);
    },
    [activeTab, pageSubTab]
  );

  const handlePageSubTabChange = useCallback(
    (sub: BrandSubTab) => {
      setPageSubTab(sub);
      syncStateToUrl(activeTab, dateRange, sub);
    },
    [activeTab, dateRange]
  );

  useEffect(() => {
    const handlePopState = () => {
      setActiveTab(getInitialTab());
      setDateRange(getInitialDateRange());
      setPageSubTab(getInitialSubTab());
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  return {
    activeTab,
    dateRange,
    pageSubTab,
    handleTabChange,
    handleDateRangeChange,
    handlePageSubTabChange,
  };
}

