"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";

const POLLING_INTERVAL_MS = 60 * 1000; // 60 seconds

let inFlightPromise: Promise<number> | null = null;
let lastFetchTimestamp = 0;
let cachedBadgeCount = 0;

export function useSupplierBadge() {
  const pathname = usePathname();
  const [count, setCount] = useState<number>(0);
  const isSuppliersPage = pathname === "/suppliers" || pathname.startsWith("/suppliers?");

  const fetchBadgeCount = useCallback(async (force = false): Promise<number> => {
    if (typeof window === "undefined") return 0;
    if (document.hidden && !force) return cachedBadgeCount;

    const now = Date.now();
    if (!force && now - lastFetchTimestamp < 15000) {
      setCount(cachedBadgeCount);
      return cachedBadgeCount;
    }

    if (inFlightPromise) {
      const resCount = await inFlightPromise;
      setCount(resCount);
      return resCount;
    }

    inFlightPromise = (async () => {
      try {
        const res = await fetch("/api/suppliers/badge", {
          signal: AbortSignal.timeout(6000),
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
        // Non-critical badge poll error
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
    cachedBadgeCount = 0;
    setCount(0);
  }, []);

  useEffect(() => {
    fetchBadgeCount();
  }, [fetchBadgeCount]);

  useEffect(() => {
    const handleSupplierUpdated = () => fetchBadgeCount(true);
    window.addEventListener("supplier-drop-updated", handleSupplierUpdated);

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchBadgeCount();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const interval = setInterval(() => {
      if (!document.hidden) {
        fetchBadgeCount();
      }
    }, POLLING_INTERVAL_MS);

    return () => {
      window.removeEventListener("supplier-drop-updated", handleSupplierUpdated);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(interval);
    };
  }, [fetchBadgeCount]);

  return {
    count,
    markAsSeen,
    refresh: () => fetchBadgeCount(true),
  };
}

