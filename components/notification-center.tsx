"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Bell,
  CheckCheck,
  Trash2,
  ExternalLink,
  TrendingUp,
  Eye,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  X,
  Inbox,
  Sparkles,
  RefreshCw,
  Flame,
  Moon,
  Globe,
  Crown,
  Rocket,
  ShoppingBag,
  ChevronRight,
  Truck,
  Info,
} from "lucide-react";
import { useToast } from "@/components/toast-context";
import { stripEmojis } from "@/lib/utils";

export interface ActivityNotification {
  id: string;
  type:
    | "count_scan"
    | "ad_spy"
    | "page_merged"
    | "multi_page_detected"
    | "domain_portfolio_linked"
    | "batch_summary"
    | "system_alert"
    | "breakout_alert"
    | "supplier_album_drop";
  title: string;
  message: string;
  severity: "info" | "success" | "warning" | "error";
  trackedPageId?: string | null;
  adArchiveId?: string | null;
  actionUrl?: string | null;
  metadata?: Record<string, any> | null;
  isRead: boolean;
  createdAt: string;
}

function isValidImageUrl(u?: string | null): boolean {
  if (!u || typeof u !== "string") return false;
  const clean = u.trim();
  if (!clean.startsWith("http://") && !clean.startsWith("https://")) return false;
  if (
    clean.includes("permalink.php") ||
    clean.includes("/posts/") ||
    clean.includes("/story.php") ||
    clean.includes("facebook.com/profile.php")
  ) {
    return false;
  }
  return (
    clean.includes("fbcdn.net") ||
    clean.includes("fbsbx.com") ||
    clean.includes("cloudinary.com") ||
    clean.includes("backblazeb2.com") ||
    clean.includes("supabase.co") ||
    /\.(jpg|jpeg|png|webp|gif)($|\?)/i.test(clean)
  );
}

interface NotificationCenterProps {
  layout?: "sidebar" | "navbar" | "collapsed";
  onOpenResolveModal?: (trackedPageId: string) => void;
}

// Shared in-flight deduplicator and memory cache across multiple NotificationCenter instances (desktop + mobile navbar)
let sharedSummaryPromise: Promise<number> | null = null;
let sharedSummaryCache: { count: number; timestamp: number } | null = null;

export function NotificationCenter({ layout = "sidebar", onOpenResolveModal }: NotificationCenterProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<ActivityNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeTab, setActiveTab] = useState<string>("all");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

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

  // Infinite scroll intersection observer attached to the inner scroll container
  useEffect(() => {
    if (!isOpen || !hasMore || isLoadingMore) return;
    const sentinel = sentinelRef.current;
    const container = scrollContainerRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMore();
        }
      },
      {
        root: container,
        rootMargin: "80px",
        threshold: 0.1,
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [isOpen, hasMore, isLoadingMore, loadMore]);

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

  // Close on outside click and reset confirmation state
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setConfirmClearAll(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

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

  const formatRelativeTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);

    if (diffSec < 60) return "Just now";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return `${Math.floor(diffSec / 86400)}d ago`;
  };

  const getNotificationIcon = (n: ActivityNotification) => {
    const type = n.type;
    const isWentDark = n.metadata?.wentDark === true;
    const isMegaBrand = n.metadata?.isMegaBrand === true || (typeof n.metadata?.currentResults === "number" && n.metadata.currentResults >= 50);
    const isSurge = n.metadata?.isSurge === true;
    const isDiscovery = n.metadata?.runnerType === "discovery";
    const isProductReextracted =
      n.metadata?.event === "product_re_extracted" ||
      n.title.toLowerCase().startsWith("product re-extracted");
    const isProductAdded =
      n.metadata?.event === "product_added" ||
      n.title.toLowerCase().startsWith("product added");
    const isProductExtractionFailed =
      n.metadata?.event === "product_extraction_failed" ||
      n.title.toLowerCase().startsWith("product extraction failed");

    if (isProductReextracted) {
      return (
        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0 shadow-sm">
          <RefreshCw className="w-4 h-4" />
        </div>
      );
    }

    if (isProductAdded) {
      return (
        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0 shadow-sm">
          <ShoppingBag className="w-4 h-4" />
        </div>
      );
    }

    if (isProductExtractionFailed) {
      return (
        <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 flex items-center justify-center shrink-0 shadow-sm">
          <AlertCircle className="w-4 h-4" />
        </div>
      );
    }

    if (type === "supplier_album_drop") {
      return (
        <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center justify-center shrink-0 shadow-sm">
          <Truck className="w-4 h-4" />
        </div>
      );
    }

    if (type === "breakout_alert") {
      return (
        <div className="w-8 h-8 rounded-lg bg-rose-500/15 text-rose-500 border border-rose-500/20 flex items-center justify-center shrink-0 shadow-sm">
          <Rocket className="w-4 h-4 text-rose-500" />
        </div>
      );
    }

    if (isWentDark) {
      return (
        <div className="w-8 h-8 rounded-lg bg-rose-500/15 text-rose-500 border border-rose-500/30 flex items-center justify-center shrink-0 shadow-sm animate-pulse">
          <Moon className="w-4 h-4" />
        </div>
      );
    }
    if (isMegaBrand) {
      return (
        <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/35 flex items-center justify-center shrink-0 shadow-sm">
          <Crown className="w-4 h-4" />
        </div>
      );
    }
    if (isSurge) {
      return (
        <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-500 border border-amber-500/30 flex items-center justify-center shrink-0 shadow-sm">
          <Flame className="w-4 h-4" />
        </div>
      );
    }
    if (isDiscovery) {
      return (
        <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/25 flex items-center justify-center shrink-0 shadow-sm">
          <Globe className="w-4 h-4" />
        </div>
      );
    }
    if (type === "batch_summary") {
      return (
        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 flex items-center justify-center shrink-0 shadow-sm">
          <Sparkles className="w-4 h-4" />
        </div>
      );
    }
    if (type === "count_scan") {
      return (
        <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center justify-center shrink-0">
          <TrendingUp className="w-4 h-4" />
        </div>
      );
    }
    if (type === "ad_spy") {
      return (
        <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 flex items-center justify-center shrink-0">
          <Eye className="w-4 h-4" />
        </div>
      );
    }
    if (type === "page_merged") {
      return (
        <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-4 h-4" />
        </div>
      );
    }
    if (type === "multi_page_detected") {
      return (
        <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center justify-center shrink-0">
          <AlertTriangle className="w-4 h-4" />
        </div>
      );
    }
    if (type === "domain_portfolio_linked") {
      return (
        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0">
          <Globe className="w-4 h-4" />
        </div>
      );
    }
    if (n.severity === "success") {
      return (
        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0 shadow-sm">
          <CheckCircle2 className="w-4 h-4" />
        </div>
      );
    }
    if (n.severity === "warning") {
      return (
        <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center justify-center shrink-0 shadow-sm">
          <AlertTriangle className="w-4 h-4" />
        </div>
      );
    }
    if (n.severity === "info") {
      return (
        <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center justify-center shrink-0 shadow-sm">
          <Info className="w-4 h-4" />
        </div>
      );
    }
    return (
      <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 flex items-center justify-center shrink-0 shadow-sm">
        <AlertCircle className="w-4 h-4" />
      </div>
    );
  };

  return (
    <div className="relative inline-flex items-center" ref={dropdownRef}>
      {/* Trigger Button */}
      {layout === "navbar" ? (
        <button
          onClick={() => setIsOpen(!isOpen)}
          title={`Notifications (${unreadCount} unread)`}
          aria-label={`Notifications (${unreadCount} unread)`}
          className={`relative flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm transition-all cursor-pointer ${
            isOpen ? "border-indigo-500/40 text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30" : ""
          }`}
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9.5px] font-black leading-none shadow-sm ring-2 ring-white dark:ring-slate-900 animate-in zoom-in-75">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      ) : layout === "collapsed" ? (
        <button
          onClick={() => setIsOpen(!isOpen)}
          title={`Notifications (${unreadCount} unread)`}
          className="relative flex items-center justify-center w-10 h-10 mx-auto rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/40 dark:hover:bg-slate-800/40 transition-all border border-transparent"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900 animate-pulse" />
          )}
        </button>
      ) : (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`flex items-center justify-between w-full px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all border ${
            isOpen
              ? "bg-indigo-600/10 border-indigo-500/30 text-indigo-600 dark:text-indigo-400 shadow-sm"
              : "bg-slate-100/70 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700"
          }`}
        >
          <div className="flex items-center space-x-2.5">
            <div className="relative">
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-rose-500 ring-1 ring-white dark:ring-slate-900 animate-pulse" />
              )}
            </div>
            <span>Activity Center</span>
          </div>

          {unreadCount > 0 ? (
            <span className="px-2 py-0.5 text-[10px] font-black rounded-full bg-rose-500 text-white shadow-sm shadow-rose-500/30">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : (
            <span className="text-[10px] text-slate-400 font-normal">All read</span>
          )}
        </button>
      )}

      {/* Floating Dropdown Panel */}
      {isOpen && (
        <div
          className={`fixed sm:absolute z-50 ${
            layout === "navbar"
              ? "inset-x-3 top-16 w-auto sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[460px]"
              : layout === "collapsed"
              ? "left-16 bottom-0 w-[calc(100vw-2rem)] sm:w-[460px]"
              : "left-0 sm:left-full sm:bottom-0 sm:ml-2 bottom-4 sm:bottom-auto w-[calc(100vw-2rem)] sm:w-[460px]"
          } max-h-[82vh] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-bold text-slate-900 dark:text-white">
                Activity & Updates
              </span>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                  {unreadCount} New
                </span>
              )}
            </div>

            <div className="flex items-center space-x-1">
              <button
                onClick={() => fetchNotifications(true)}
                title="Refresh notifications"
                className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-indigo-500" : ""}`} />
              </button>

              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  title="Mark all as read"
                  className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                >
                  <CheckCheck className="w-4 h-4" />
                </button>
              )}

              {notifications.length > 0 && (
                confirmClearAll ? (
                  <div className="flex items-center gap-1 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-lg border border-rose-200 dark:border-rose-800 animate-in fade-in">
                    <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400">Clear all?</span>
                    <button
                      onClick={handleClearAll}
                      className="px-1.5 py-0.5 text-[10px] font-black bg-rose-600 text-white rounded hover:bg-rose-700 transition-colors"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setConfirmClearAll(false)}
                      className="px-1.5 py-0.5 text-[10px] font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmClearAll(true)}
                    title="Clear all notifications"
                    className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )
              )}

              <button
                onClick={() => {
                  setIsOpen(false);
                  setConfirmClearAll(false);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center px-3 py-2 border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/30 dark:bg-slate-900/30 gap-1.5 text-[11px] font-semibold overflow-x-auto">
            {[
              { id: "all", label: "All" },
              { id: "breakout_alert", label: "Trending" },
              { id: "activity", label: "Activity" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1 rounded-lg transition-colors shrink-0 ${
                  activeTab === tab.id
                    ? "bg-indigo-600 text-white shadow-sm font-bold"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-slate-800/50"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Notifications Scroll List */}
          <div
            ref={scrollContainerRef}
            className="overflow-y-auto max-h-[480px] divide-y divide-slate-100 dark:divide-slate-800/60"
          >
            {notifications.length === 0 ? (
              <div className="py-12 px-4 text-center flex flex-col items-center justify-center space-y-2 text-slate-400">
                <Inbox className="w-8 h-8 opacity-40" />
                <p className="text-xs">No notifications yet.</p>
              </div>
            ) : (
              <>
                {notifications.map((n) => {
                const movers = (n.metadata?.movers as any[]) || [];
                const topBrands = (n.metadata?.topBrands as any[]) || [];
                const isBreakout = n.type === "breakout_alert";
                const isSupplierDrop = n.type === "supplier_album_drop";
                const dropPreviewImages = (n.metadata?.previewImages as string[]) || [];
                const isWentDark = n.metadata?.wentDark === true;
                const isMegaBrand = n.metadata?.isMegaBrand === true || (typeof n.metadata?.currentResults === "number" && n.metadata.currentResults >= 50);
                const isSurge = n.metadata?.isSurge === true;
                const isQueued = n.metadata?.queuedForLocalScan === true;
                const newProductsCount = (n.metadata?.newProductsCount as number) || 0;
                const isProductReextracted =
                  n.metadata?.event === "product_re_extracted" ||
                  n.title.toLowerCase().startsWith("product re-extracted");
                const isProductAdded =
                  n.metadata?.event === "product_added" ||
                  n.title.toLowerCase().startsWith("product added");
                const isProductExtractionFailed =
                  n.metadata?.event === "product_extraction_failed" ||
                  n.title.toLowerCase().startsWith("product extraction failed");

                return (
                  <div
                    key={n.id}
                    onClick={() => {
                      if (!n.isRead) handleMarkSingleRead(n.id);
                      if (n.type === "multi_page_detected" && n.trackedPageId) {
                        setIsOpen(false);
                        onOpenResolveModal?.(n.trackedPageId);
                      } else if (n.actionUrl) {
                        setIsOpen(false);
                        router.push(n.actionUrl);
                      }
                    }}
                    className={`relative py-2.5 px-3.5 flex items-start space-x-3 transition-all cursor-pointer group active:scale-[0.99] ${
                      n.isRead
                        ? "bg-transparent hover:bg-slate-100/70 dark:hover:bg-slate-800/50 opacity-75 hover:opacity-100"
                        : isSupplierDrop
                        ? "bg-indigo-500/[0.04] dark:bg-indigo-500/[0.07] hover:bg-indigo-500/[0.1] dark:hover:bg-indigo-500/[0.14] border-l-2 border-indigo-500"
                        : isBreakout
                        ? "bg-gradient-to-r from-rose-500/[0.08] via-pink-500/[0.06] to-amber-500/[0.08] hover:from-rose-500/[0.14] hover:to-amber-500/[0.14]"
                        : isWentDark
                        ? "bg-rose-500/[0.06] dark:bg-rose-500/[0.1] hover:bg-rose-500/[0.12]"
                        : isMegaBrand
                        ? "bg-purple-500/[0.08] dark:bg-purple-500/[0.14] hover:bg-purple-500/[0.15]"
                        : isSurge
                        ? "bg-amber-500/[0.06] dark:bg-amber-500/[0.1] hover:bg-amber-500/[0.12]"
                        : isQueued
                        ? "bg-emerald-500/[0.05] dark:bg-emerald-500/[0.08] hover:bg-emerald-500/[0.12]"
                        : isProductReextracted || isProductAdded
                        ? "bg-emerald-500/[0.04] dark:bg-emerald-500/[0.07] hover:bg-emerald-500/[0.1] dark:hover:bg-emerald-500/[0.14]"
                        : isProductExtractionFailed
                        ? "bg-rose-500/[0.05] dark:bg-rose-500/[0.08] hover:bg-rose-500/[0.12]"
                        : "bg-indigo-500/[0.04] dark:bg-indigo-500/[0.07] hover:bg-indigo-500/[0.1] dark:hover:bg-indigo-500/[0.15]"
                    }`}
                  >
                    {getNotificationIcon(n)}

                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 truncate">
                          <h4
                            className={`text-xs font-bold truncate transition-colors ${
                              n.isRead
                                ? "text-slate-700 dark:text-slate-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400"
                                : "text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400"
                            }`}
                            dir="auto"
                          >
                            <bdi>{stripEmojis(n.title)}</bdi>
                          </h4>
                          {isProductReextracted && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 shrink-0 border border-emerald-500/30 inline-flex items-center gap-1">
                              <RefreshCw className="w-2.5 h-2.5 shrink-0" />
                              <span>UPDATED</span>
                            </span>
                          )}
                          {isProductAdded && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 shrink-0 border border-emerald-500/30 inline-flex items-center gap-1">
                              <ShoppingBag className="w-2.5 h-2.5 shrink-0" />
                              <span>NEW</span>
                            </span>
                          )}
                          {isProductExtractionFailed && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-rose-500/20 text-rose-600 dark:text-rose-400 shrink-0 border border-rose-500/30 inline-flex items-center gap-1">
                              <AlertCircle className="w-2.5 h-2.5 shrink-0" />
                              <span>FAILED</span>
                            </span>
                          )}
                          {isSupplierDrop && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 shrink-0 border border-indigo-500/30 inline-flex items-center gap-1">
                              <Truck className="w-2.5 h-2.5 shrink-0" />
                              <span>DROP</span>
                            </span>
                          )}
                          {isBreakout && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-gradient-to-r from-pink-500 to-rose-600 text-white shrink-0 shadow-xs shadow-rose-500/20">
                              BREAKOUT
                            </span>
                          )}
                          {newProductsCount > 0 && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 shrink-0 border border-indigo-500/30 inline-flex items-center gap-1">
                              <ShoppingBag className="w-2.5 h-2.5 shrink-0" />
                              <span>+{newProductsCount} {newProductsCount === 1 ? "Product" : "Products"}</span>
                            </span>
                          )}
                          {isWentDark && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-rose-500/20 text-rose-600 dark:text-rose-400 shrink-0">
                              DARK
                            </span>
                          )}
                          {isMegaBrand && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-purple-500/20 text-purple-600 dark:text-purple-400 shrink-0 border border-purple-500/30 inline-flex items-center gap-1">
                              <Crown className="w-2.5 h-2.5 shrink-0" />
                              <span>MEGA 50+</span>
                            </span>
                          )}
                          {isSurge && !isMegaBrand && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0">
                              SURGE
                            </span>
                          )}
                          {isQueued && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 shrink-0">
                              QUEUED ($0)
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 shrink-0 group-hover:text-slate-500 dark:group-hover:text-slate-300 transition-colors">
                          {formatRelativeTime(n.createdAt)}
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug break-words" dir="auto">
                        <bdi>{stripEmojis(n.message)}</bdi>
                      </p>

                      {/* Supplier Drop Preview Thumbnails */}
                      {isSupplierDrop && dropPreviewImages.filter(isValidImageUrl).length > 0 && (
                        <div className="flex items-center gap-1.5 pt-1">
                          {dropPreviewImages.filter(isValidImageUrl).slice(0, 4).map((imgUrl, idx) => (
                            <img
                              key={idx}
                              src={imgUrl}
                              alt="Product thumbnail"
                              referrerPolicy="no-referrer"
                              className="w-9 h-9 object-cover rounded-md border border-slate-200 dark:border-slate-800 shrink-0"
                              loading="lazy"
                              onError={(e) => {
                                (e.currentTarget as HTMLElement).style.display = "none";
                              }}
                            />
                          ))}
                        </div>
                      )}

                      {/* Direct Post Link for Supplier Drop */}
                      {isSupplierDrop && n.metadata?.postUrl && (
                        <div className="pt-0.5">
                          <a
                            href={n.metadata.postUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                          >
                            <span>Open Facebook Post</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        </div>
                      )}

                      {/* Breakout Velocity Indicators */}
                      {isBreakout && n.metadata && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                            {n.metadata.prevDuplication ?? 1} ➔ {n.metadata.currentDuplication} Copies
                          </span>
                          {n.metadata.winnerScore && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                              Score {n.metadata.winnerScore}/100
                            </span>
                          )}
                          {typeof n.metadata.daysRunning === "number" && (
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                              • Launched {n.metadata.daysRunning === 0 ? "today" : `${n.metadata.daysRunning}d ago`}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Movers Pills for Batch Count Summaries */}
                      {n.type === "batch_summary" && movers.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {movers.slice(0, 4).map((m, idx) => {
                            const isUuidStr = (s?: string | null) => Boolean(s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s));
                            const moverUrl = m.pageId && !isUuidStr(m.pageId)
                              ? `/spy/brand/${encodeURIComponent(m.pageId)}`
                              : m.name && !isUuidStr(m.name)
                              ? `/spy/brand/${encodeURIComponent(m.name)}`
                              : `/?search=${encodeURIComponent(m.name || "")}`;
                            return (
                              <Link
                                key={idx}
                                href={moverUrl}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setIsOpen(false);
                                }}
                                className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/60 text-[10px] font-semibold text-slate-700 dark:text-slate-200 hover:border-indigo-500/40 dark:hover:border-indigo-500/40 transition-colors"
                              >
                                <span>{m.name}</span>
                                <span className="text-emerald-600 dark:text-emerald-400 font-extrabold">
                                  +{m.extractedCount || m.diff || 1}
                                </span>
                                {m.newProductsCount && m.newProductsCount > 0 ? (
                                  <span className="text-indigo-600 dark:text-indigo-400 font-extrabold text-[9.5px] inline-flex items-center gap-0.5">
                                    <ShoppingBag className="w-2.5 h-2.5 shrink-0" />
                                    <span>+{m.newProductsCount}</span>
                                  </span>
                                ) : null}
                              </Link>
                            );
                          })}
                          {movers.length > 4 && (
                            <span className="text-[10px] text-slate-400 self-center">
                              +{movers.length - 4} more
                            </span>
                          )}
                        </div>
                      )}

                      {/* Top Discovered Brands for Discovery Summaries */}
                      {n.type === "batch_summary" && topBrands.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {topBrands.slice(0, 3).map((b, idx) => (
                            <Link
                              key={idx}
                              href={`/?search=${encodeURIComponent(b.name)}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsOpen(false);
                              }}
                              className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200/80 dark:border-cyan-800/60 text-[10px] font-semibold text-cyan-800 dark:text-cyan-200 hover:border-cyan-500 transition-colors"
                            >
                              <span>{b.name}</span>
                              <span className="text-cyan-600 dark:text-cyan-400 font-bold">
                                {b.adCount} ads
                              </span>
                            </Link>
                          ))}
                        </div>
                      )}

                      {/* Multi-page conflict hint */}
                      {n.type === "multi_page_detected" && n.trackedPageId && (
                        <div className="pt-0.5">
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-bold border border-amber-500/20">
                            <span>Select Page</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Right indicator column: unread dot button and subtle hover chevron */}
                    <div className="flex items-center self-center shrink-0 pl-1">
                      {!n.isRead && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMarkSingleRead(n.id, true);
                          }}
                          title="Mark as read"
                          aria-label="Mark as read"
                          className="p-1 -m-1 rounded-full hover:bg-indigo-50 dark:hover:bg-indigo-950/60 transition-colors cursor-pointer group/dot flex items-center justify-center mr-1"
                        >
                          <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 ring-2 ring-white dark:ring-slate-900 shadow-xs group-hover/dot:scale-125 transition-transform" />
                        </button>
                      )}
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400/60 dark:text-slate-500 group-hover:text-indigo-500 dark:group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all opacity-0 group-hover:opacity-100" />
                    </div>
                  </div>
                );
              })}

              {/* Infinite Scroll Sentinel / Loading Spinner */}
              {hasMore && (
                <div
                  ref={sentinelRef}
                  className="py-3 px-4 flex items-center justify-center text-xs text-slate-400 bg-slate-50/40 dark:bg-slate-900/40"
                >
                  {isLoadingMore ? (
                    <div className="flex items-center space-x-2 text-indigo-600 dark:text-indigo-400 font-medium">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Loading earlier updates...</span>
                    </div>
                  ) : (
                    <span className="text-[10px] text-slate-400">Loading more activity...</span>
                  )}
                </div>
              )}

              {!hasMore && notifications.length > 0 && (
                <div className="py-2.5 text-center text-[10px] text-slate-400 dark:text-slate-500 bg-slate-50/20 dark:bg-slate-900/20">
                  You&apos;re all caught up
                </div>
              )}
            </>
          )}
        </div>
        </div>
      )}
    </div>
  );
}
