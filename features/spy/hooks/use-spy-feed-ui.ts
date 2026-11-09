"use client";

import { useState, useEffect, useRef } from "react";
import type { Ad } from "@/types";
import { useWorkspace } from "@/components/workspace-context";
import { useToast } from "@/components/toast-context";

interface UseSpyFeedUiOptions {
  incomingAds: Ad[];
  autoStream: boolean;
  prependAds: (ads: Ad[]) => void;
  clearIncoming: () => void;
  refetch: () => Promise<any>;
  refetchStats?: () => Promise<any>;
}

export function useSpyFeedUi({
  incomingAds,
  autoStream,
  prependAds,
  clearIncoming,
  refetch,
  refetchStats,
}: UseSpyFeedUiOptions) {
  const { activeWorkspace } = useWorkspace();
  const { showToast } = useToast();
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [manualRefreshing, setManualRefreshing] = useState(false);

  // Re-fetch ad feed & stats only when switching from one workspace to a different workspace
  const prevWorkspaceIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeWorkspace?.id) return;
    if (prevWorkspaceIdRef.current && prevWorkspaceIdRef.current !== activeWorkspace.id) {
      refetch();
      if (refetchStats) refetchStats();
    }
    prevWorkspaceIdRef.current = activeWorkspace.id;
  }, [activeWorkspace?.id, refetch, refetchStats]);

  // Auto-stream effect: automatically inject new incoming ads when autoStream is enabled
  useEffect(() => {
    if (autoStream && incomingAds.length > 0) {
      prependAds(incomingAds);
      clearIncoming();
      showToast({
        type: "info",
        title: "Real-time Ad Stream",
        message: `Automatically loaded ${incomingAds.length} newly scraped creative(s) to the feed.`,
      });
    }
  }, [autoStream, incomingAds, prependAds, clearIncoming, showToast]);

  // Scroll listener for back-to-top button
  useEffect(() => {
    const handleScroll = () => {
      const scrollPos = window.scrollY || document.documentElement.scrollTop;
      setShowBackToTop(scrollPos > 300);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Load viewMode preference from localStorage on mount
  useEffect(() => {
    try {
      const savedMode = localStorage.getItem("ad_spy_view_mode");
      if (savedMode === "grid" || savedMode === "list") {
        setViewMode(savedMode);
      }
    } catch (e) {
      console.error("Error reading viewMode preference:", e);
    }
  }, []);

  const handleViewModeChange = (mode: "grid" | "list") => {
    setViewMode(mode);
    try {
      localStorage.setItem("ad_spy_view_mode", mode);
    } catch (e) {
      console.error("Error saving viewMode preference:", e);
    }
  };

  const handleRefreshFeed = async () => {
    if (manualRefreshing) return;
    setManualRefreshing(true);
    try {
      await Promise.all([refetch(), refetchStats ? refetchStats() : Promise.resolve()]);
      showToast({
        type: "success",
        title: "Feed Refreshed",
        message: "Latest ad creatives, stats, and Apify cloud sync completed.",
      });
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("apify:refresh-balance"));
      }
    } catch (err: any) {
      showToast({
        type: "error",
        title: "Refresh Error",
        message: err.message || "Failed to refresh feed.",
      });
    } finally {
      setManualRefreshing(false);
    }
  };

  return {
    viewMode,
    showBackToTop,
    manualRefreshing,
    handleViewModeChange,
    handleRefreshFeed,
  };
}

