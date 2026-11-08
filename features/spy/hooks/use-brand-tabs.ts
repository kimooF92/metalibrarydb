"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import type { BrandTabId } from "@/components/spy/brand-deep-dive-tabs";

interface UseBrandTabsOptions {
  id: string;
  isModal?: boolean;
  initialTab?: BrandTabId;
  onProductsNeeded?: () => void;
  onProductsRefreshNeeded?: () => void;
}

export function useBrandTabs({
  id,
  isModal = false,
  initialTab,
  onProductsNeeded,
  onProductsRefreshNeeded,
}: UseBrandTabsOptions) {
  const searchParams = useSearchParams();

  const searchTab = searchParams?.get("tab");
  const searchProductId =
    searchParams?.get("productId") ||
    searchParams?.get("id") ||
    (typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("productId") ||
        new URLSearchParams(window.location.search).get("id")
      : null);

  const resolvedInitialTab: BrandTabId =
    initialTab ||
    (searchTab === "products" ||
    searchTab === "creatives" ||
    searchTab === "analytics" ||
    searchTab === "cadence"
      ? (searchTab as BrandTabId)
      : undefined) ||
    (searchProductId ? "products" : undefined) ||
    (typeof window !== "undefined" &&
      (new URLSearchParams(window.location.search).get("tab") as any)) ||
    "analytics";

  const [activeTab, setActiveTab] = useState<BrandTabId>(resolvedInitialTab);
  const [visitedTabs, setVisitedTabs] = useState<Set<BrandTabId>>(() => {
    const set = new Set<BrandTabId>(["analytics"]);
    if (resolvedInitialTab !== "analytics") {
      set.add(resolvedInitialTab);
    }
    return set;
  });

  const tabScrollPositionsRef = useRef<Record<string, number>>({
    analytics: 0,
    cadence: 0,
    products: 0,
    creatives: 0,
  });

  const activeTabRef = useRef<BrandTabId>(resolvedInitialTab);
  activeTabRef.current = activeTab;

  const handleTabChange = useCallback(
    (nextTab: BrandTabId, pushHistory = true) => {
      const currentTab = activeTabRef.current;
      if (nextTab === currentTab) {
        if (nextTab === "products" && onProductsRefreshNeeded) {
          onProductsRefreshNeeded();
        }
        return;
      }

      // Mark tab as visited for lazy first-mount
      setVisitedTabs((prev) => (prev.has(nextTab) ? prev : new Set(prev).add(nextTab)));

      // Save scroll position of the active scroll container
      const scrollContainer = isModal
        ? document.getElementById("brand-overlay-scroll-container")
        : document.querySelector("main");
      if (scrollContainer) {
        tabScrollPositionsRef.current[currentTab] = scrollContainer.scrollTop;
      }

      activeTabRef.current = nextTab;
      setActiveTab(nextTab);

      // Update URL query shallowly
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        if (nextTab === "analytics") {
          url.searchParams.delete("tab");
        } else {
          url.searchParams.set("tab", nextTab);
        }
        if (pushHistory && !isModal) {
          window.history.pushState({ tab: nextTab }, "", url.toString());
        } else {
          window.history.replaceState({ tab: nextTab }, "", url.toString());
        }
      }

      // Restore scroll position
      requestAnimationFrame(() => {
        if (scrollContainer) {
          scrollContainer.scrollTop = tabScrollPositionsRef.current[nextTab] || 0;
        }
      });

      if (nextTab === "products" && onProductsNeeded) {
        onProductsNeeded();
      }
    },
    [isModal, onProductsNeeded, onProductsRefreshNeeded]
  );

  // Forward latest handleTabChange reference to avoid stale closures in popstate listener
  const handleTabChangeRef = useRef(handleTabChange);
  handleTabChangeRef.current = handleTabChange;

  useEffect(() => {
    const handlePopState = () => {
      if (typeof window !== "undefined") {
        const urlParams = new URLSearchParams(window.location.search);
        const tab = urlParams.get("tab");
        const resolvedTab: BrandTabId =
          tab === "products" || tab === "creatives" || tab === "cadence" ? tab : "analytics";
        handleTabChangeRef.current(resolvedTab, false);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  // Re-sync activeTab when brand ID or initialTab prop changes
  const prevIdRef = useRef(id);
  const prevInitialTabRef = useRef(initialTab);
  useEffect(() => {
    if (prevIdRef.current !== id) {
      prevIdRef.current = id;
      prevInitialTabRef.current = initialTab;
      const targetTab = initialTab || "analytics";
      handleTabChangeRef.current(targetTab, false);
    } else if (initialTab && initialTab !== prevInitialTabRef.current) {
      prevInitialTabRef.current = initialTab;
      handleTabChangeRef.current(initialTab, false);
    }
  }, [id, initialTab]);

  return {
    activeTab,
    setActiveTab,
    visitedTabs,
    setVisitedTabs,
    activeTabRef,
    handleTabChange,
  };
}

