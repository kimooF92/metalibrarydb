"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";

const STORAGE_KEY = "products_last_seen_at";
const POLLING_INTERVAL_MS = 60 * 1000; // 60 seconds

// In-flight deduplication promise across multiple hook instances (desktop + mobile navigation)
let inFlightPromise: Promise<number> | null = null;
let lastFetchTimestamp = 0;
let cachedBadgeCount = 0;

export function useProductBadge() {
  const pathname = usePathname();
  const [count, setCount] = useState<number>(0);
  const isProductsPage = pathname === "/products" || pathname.startsWith("/products?");

  const fetchBadgeCount = useCallback(async (force = false): Promise<number> => {
    if (typeof window === "undefined") return 0;
    if (document.hidden && !force) return cachedBadgeCount;

    const now = Date.now();
    // Cache for 10s unless forced
    if (!force && now - lastFetchTimestamp < 10000) {
      setCount(cachedBadgeCount);
      return cachedBadgeCount;
    }

    if (inFlightPromise) {
      const resCount = await inFlightPromise;
      setCount(resCount);
      return resCount;
    }

    let lastSeen = localStorage.getItem(STORAGE_KEY);
    if (!lastSeen) {
      // Default to 24 hours ago on first visit so newly added products are surfaced
      lastSeen = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      try {
        localStorage.setItem(STORAGE_KEY, lastSeen);
      } catch {}
    }

    inFlightPromise = (async () => {
      try {
        const res = await fetch(`/api/products/badge?since=${encodeURIComponent(lastSeen)}`, {
          signal: AbortSignal.timeout(8000),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.success && typeof data.count === "number") {
            cachedBadgeCount = data.count;
            lastFetchTimestamp = Date.now();
            return data.count;
          }
        }
      } catch (err) {
        // Silently handle fetch abort or network errors
      } finally {
        inFlightPromise = null;
      }
      return cachedBadgeCount;
    })();

    const result = await inFlightPromise;
    setCount(result);
    return result;
  }, []);

  const markAsSeen = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    } catch {}
    cachedBadgeCount = 0;
    setCount(0);
  }, []);

  // When user is currently on the products page, clear the notification badge
  useEffect(() => {
    if (isProductsPage) {
      markAsSeen();
    } else {
      fetchBadgeCount();
    }
  }, [isProductsPage, markAsSeen, fetchBadgeCount]);

  // Periodic polling and event listener for real-time updates
  useEffect(() => {
    const handleProductAdded = () => {
      if (!isProductsPage) {
        fetchBadgeCount(true);
      }
    };

    window.addEventListener("product-added", handleProductAdded);
    window.addEventListener("products-updated", handleProductAdded);

    // Refresh when tab regains visibility
    const handleVisibilityChange = () => {
      if (!document.hidden && !isProductsPage) {
        fetchBadgeCount();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Polling interval
    const interval = setInterval(() => {
      if (!document.hidden && !isProductsPage) {
        fetchBadgeCount();
      }
    }, POLLING_INTERVAL_MS);

    return () => {
      window.removeEventListener("product-added", handleProductAdded);
      window.removeEventListener("products-updated", handleProductAdded);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(interval);
    };
  }, [isProductsPage, fetchBadgeCount]);

  return {
    count: isProductsPage ? 0 : count,
    markAsSeen,
    refresh: () => fetchBadgeCount(true),
  };
}
