"use client";

import { useState, useMemo, useEffect } from "react";
import type { TrackedPage, BrandAnalyticsCalculations } from "@/types";
import type { BrandSubTab, AnalyticsSortField, AnalyticsSortOrder } from "../types";
import { serializeToCsv, downloadCsvInBrowser } from "@/lib/csv-utils";

interface UseBrandSubtabTableOptions {
  subTab: BrandSubTab;
  analytics: BrandAnalyticsCalculations;
  initialPageSize?: number;
}

export function useBrandSubtabTable({
  subTab,
  analytics,
  initialPageSize = 15,
}: UseBrandSubtabTableOptions) {
  const [searchQuery, setSearchQuery] = useState("");
  const [tablePage, setTablePage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [sortField, setSortField] = useState<AnalyticsSortField | null>(null);
  const [sortOrder, setSortOrder] = useState<AnalyticsSortOrder>("desc");

  // Reset to page 1 whenever subtab changes
  useEffect(() => {
    setTablePage(1);
  }, [subTab]);

  const filteredTablePages = useMemo(() => {
    let source: TrackedPage[] = [];

    if (subTab === "scaling") {
      source = analytics.scalingPages || [];
    } else if (subTab === "descaling") {
      source = analytics.descalingPages || [];
    } else if (subTab === "top") {
      source = [...(analytics.withResults || [])].sort(
        (a, b) => (b.currentResults ?? 0) - (a.currentResults ?? 0)
      );
    } else if (subTab === "watchlist") {
      source = analytics.watchlistedPages || [];
    } else if (subTab === "attention") {
      const ids = new Set<string>();
      source = [
        ...(analytics.zeroAds || []),
        ...(analytics.failed || []),
        ...(analytics.unclear || []),
      ].filter((p) => {
        if (ids.has(p.id)) return false;
        ids.add(p.id);
        return true;
      });
    }

    if (!searchQuery.trim()) return source;

    const query = searchQuery.toLowerCase();
    return source.filter(
      (p) =>
        (p.displayName && p.displayName.toLowerCase().includes(query)) ||
        (p.pageId && p.pageId.toLowerCase().includes(query)) ||
        (p.url && p.url.toLowerCase().includes(query))
    );
  }, [subTab, searchQuery, analytics]);

  const sortedTablePages = useMemo(() => {
    if (!sortField) return filteredTablePages;
    return [...filteredTablePages].sort((a, b) => {
      let valA: any = 0;
      let valB: any = 0;
      if (sortField === "name") {
        valA = (a.displayName || a.pageId || "").toLowerCase();
        valB = (b.displayName || b.pageId || "").toLowerCase();
        return sortOrder === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      if (sortField === "searchType") {
        valA = (a.searchType || "").toLowerCase();
        valB = (b.searchType || "").toLowerCase();
        return sortOrder === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      if (sortField === "current") {
        valA = a.currentResults ?? 0;
        valB = b.currentResults ?? 0;
      } else if (sortField === "previous") {
        valA = a.previousResults ?? 0;
        valB = b.previousResults ?? 0;
      } else if (sortField === "growth") {
        valA = a.windowDelta ?? a.difference ?? 0;
        valB = b.windowDelta ?? b.difference ?? 0;
      }
      return sortOrder === "asc" ? valA - valB : valB - valA;
    });
  }, [filteredTablePages, sortField, sortOrder]);

  const totalTablePages = Math.ceil(sortedTablePages.length / pageSize) || 1;

  useEffect(() => {
    if (tablePage > totalTablePages) {
      setTablePage(1);
    }
  }, [totalTablePages, tablePage]);

  const paginatedTablePages = useMemo(() => {
    const start = (tablePage - 1) * pageSize;
    return sortedTablePages.slice(start, start + pageSize);
  }, [sortedTablePages, tablePage, pageSize]);

  const toggleSort = (field: AnalyticsSortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder(field === "name" ? "asc" : "desc");
    }
    setTablePage(1);
  };

  const exportToCsv = () => {
    if (sortedTablePages.length === 0) return;
    const headers = [
      "Rank",
      "Page Name",
      "Page ID",
      "Search Type",
      "Current Ads",
      "Previous Ads",
      "Ad Growth / Change",
      "Percent Change",
      "Watchlisted",
      "Ad Library URL",
    ];
    const rows = sortedTablePages.map((p, idx) => {
      const diff = p.windowDelta ?? p.difference ?? 0;
      const prev = p.previousResults ?? "";
      const curr = p.currentResults ?? 0;
      const pctChange =
        p.previousResults && p.previousResults > 0 && diff !== 0
          ? `${Math.round((diff / p.previousResults) * 100)}%`
          : "";
      return [
        idx + 1,
        p.displayName || "Unknown",
        p.pageId || "",
        p.searchType || "page",
        curr,
        prev,
        diff,
        pctChange,
        p.isWatchlisted ? "Yes" : "No",
        p.url || "",
      ];
    });

    const csvContent = serializeToCsv(headers, rows);
    const filename = `page_velocity_${subTab}_${new Date().toISOString().slice(0, 10)}.csv`;
    downloadCsvInBrowser(filename, csvContent);
  };

  return {
    searchQuery,
    setSearchQuery,
    tablePage,
    setTablePage,
    pageSize,
    setPageSize,
    sortField,
    sortOrder,
    totalTablePages,
    sortedTablePages,
    paginatedTablePages,
    toggleSort,
    exportToCsv,
  };
}

