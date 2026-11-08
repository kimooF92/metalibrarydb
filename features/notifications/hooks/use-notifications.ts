"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { ActivityNotification, NotificationTab } from "../types";
import { useToast } from "@/components/toast-context";

// Shared in-flight deduplicator and memory cache across multiple NotificationCenter instances (desktop + mobile navbar)
let sharedSummaryPromise: Promise<number> | null = null;
let sharedSummaryCache: { count: number; timestamp: number } | null = null;

export function useNotifications() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<ActivityNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeTab, setActiveTab] = useState<NotificationTab | string>("all");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const requestInFlightRef = useRef(false);
  const isLoadingMoreRef = useRef(false);
  isLoadingMoreRef.current = isLoadingMore;
  const hasMoreRef = useRef(false);
  hasMoreRef.current = hasMore;
  const nextCursorRef = useRef<string | null>(null);
  nextCursorRef.current = nextCursor;
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const { showToast } = useToast();

  const fetchNotifications = useCallback(
    async (showLoading = false, isBackground = false) => {
      if (requestInFlightRef.current || document.hidden) return;
      requestInFlightRef.current = true;
      if (showLoading) setIsRefreshing(true);

      try {
        if (!isOpen) {
          const now = Date.now();
          if (sharedSummaryCache && now - sharedSummaryCache.timestamp < 10000) {
            setUnreadCount(sharedSummaryCache.count);
            return;
          }

          if (sharedSummaryPromise) {
            const count = await sharedSummaryPromise;
            setUnreadCount(count);
            return;
          }

          sharedSummaryPromise = (async () => {
            try {
              const res = await fetch("/api/notifications?summary=true", {
                signal: AbortSignal.timeout(8000),
              });
              if (res.ok) {
                const data = await res.json();
                if (data.success) {
                  const count = data.unreadCount || 0;
                  sharedSummaryCache = { count, timestamp: Date.now() };
                  return count;
                }
              }
            } catch (e) {
              console.warn("[NotificationCenter] summary fetch failed:", e);
            } finally {
              sharedSummaryPromise = null;
            }
            return sharedSummaryCache?.count || 0;
          })();

          const count = await sharedSummaryPromise;
          setUnreadCount(count);
          return;
        }

        const query = `limit=20${activeTab === "all" ? "" : `&type=${encodeURIComponent(activeTab)}`}`;
        const res = await fetch(`/api/notifications?${query}`, {
          signal: AbortSignal.timeout(10000),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            const incoming: ActivityNotification[] = data.notifications || [];

            if (isBackground) {
              // In background poll, merge new items to top so the user's scroll state isn't reset
              setNotifications((prev) => {
                if (prev.length === 0) return incoming;
                const existingIds = new Set(prev.map((n) => n.id));
                const newItems = incoming.filter((n) => !existingIds.has(n.id));
                if (newItems.length === 0) return prev;
                return [...newItems, ...prev];
              });
            } else {
              setNotifications(incoming);
              setNextCursor(data.nextCursor || null);
              setHasMore(Boolean(data.hasMore));
            }

            if (typeof data.unreadCount === "number") {
              setUnreadCount(data.unreadCount);
              sharedSummaryCache = { count: data.unreadCount, timestamp: Date.now() };
            }
          }
        }
      } catch (err) {
        console.error("Error fetching notifications:", err);
      } finally {
        requestInFlightRef.current = false;
        if (showLoading) {
          setTimeout(() => setIsRefreshing(false), 400);
        }
      }
    },
    [activeTab, isOpen]
  );

  const loadMore = useCallback(async () => {
    if (
      isLoadingMoreRef.current ||
      !hasMoreRef.current ||
      !nextCursorRef.current ||
      requestInFlightRef.current ||
      document.hidden
    ) {
      return;
    }

    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);

    try {
      const currentTab = activeTabRef.current;
      const cursorParam = encodeURIComponent(nextCursorRef.current);
      const query = `limit=20&cursor=${cursorParam}${currentTab === "all" ? "" : `&type=${encodeURIComponent(currentTab)}`}`;

      const res = await fetch(`/api/notifications?${query}`, {
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          const incoming: ActivityNotification[] = data.notifications || [];
          setNotifications((prev) => {
            const seen = new Set(prev.map((item) => item.id));
            const fresh = incoming.filter((item) => !seen.has(item.id));
            return [...prev, ...fresh];
          });
          setNextCursor(data.nextCursor || null);
          setHasMore(Boolean(data.hasMore));
        }
      }
    } catch (err) {
      console.warn("[NotificationCenter] Load more error:", err);
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, []);

  // Adaptive polling: secondary UI state, pauses while tab is hidden
  useEffect(() => {
    fetchNotifications(false, false);
    const pollIntervalMs = isOpen ? 30000 : 180000;
    const interval = setInterval(() => {
      fetchNotifications(false, isOpen);
    }, pollIntervalMs);
    const handleVisibility = () => {
      if (!document.hidden) fetchNotifications(false, isOpen);
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [isOpen, fetchNotifications]);

  const handleMarkAllRead = async () => {
    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_all_read" }),
      });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
        setUnreadCount(0);
        if (sharedSummaryCache) sharedSummaryCache.count = 0;
        showToast({ type: "success", title: "Marked all notifications as read" });
      }
    } catch {
      showToast({ type: "error", title: "Failed to mark notifications as read" });
    }
  };

  const handleMarkSingleRead = async (id: string, isRead = true) => {
    // Optimistic UI update: immediately remove dot and decrement count
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead } : n))
    );
    setUnreadCount((prev) => {
      const next = isRead ? Math.max(0, prev - 1) : prev + 1;
      if (sharedSummaryCache) sharedSummaryCache.count = next;
      return next;
    });

    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isRead }),
        keepalive: true,
      });
    } catch (err) {
      console.warn("[NotificationCenter] Failed to update read status:", err);
    }
  };

  const handleClearAll = async () => {
    try {
      const res = await fetch("/api/notifications", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clearAll: true }),
      });
      if (res.ok) {
        setNotifications([]);
        setUnreadCount(0);
        setNextCursor(null);
        setHasMore(false);
        if (sharedSummaryCache) sharedSummaryCache.count = 0;
        setConfirmClearAll(false);
        showToast({ type: "info", title: "Cleared notification history" });
      }
    } catch {
      showToast({ type: "error", title: "Failed to clear notifications" });
    }
  };

  return {
    isOpen,
    setIsOpen,
    notifications,
    unreadCount,
    activeTab,
    setActiveTab,
    isRefreshing,
    isLoadingMore,
    hasMore,
    confirmClearAll,
    setConfirmClearAll,
    fetchNotifications,
    loadMore,
    handleMarkAllRead,
    handleMarkSingleRead,
    handleClearAll,
  };
}

