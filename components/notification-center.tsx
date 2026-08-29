"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
} from "lucide-react";
import { useToast } from "@/components/toast-context";

export interface ActivityNotification {
  id: string;
  type: "count_scan" | "ad_spy" | "page_merged" | "multi_page_detected" | "batch_summary" | "system_alert";
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

interface NotificationCenterProps {
  layout?: "sidebar" | "navbar" | "collapsed";
  onOpenResolveModal?: (trackedPageId: string) => void;
}

export function NotificationCenter({ layout = "sidebar", onOpenResolveModal }: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<ActivityNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeTab, setActiveTab] = useState<string>("all");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

  const fetchNotifications = useCallback(async (showLoading = false) => {
    if (showLoading) setIsRefreshing(true);
    try {
      // Best-effort background sync for active Apify cloud scans
      fetch("/api/spy/scans/sync", { method: "POST" }).catch(() => {});

      const typeParam = activeTab === "all" ? "" : `&type=${activeTab}`;
      const res = await fetch(`/api/notifications?limit=40${typeParam}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setNotifications(data.notifications || []);
          setUnreadCount(data.unreadCount || 0);
        }
      }
    } catch (err) {
      console.error("Error fetching notifications:", err);
    } finally {
      if (showLoading) {
        setTimeout(() => setIsRefreshing(false), 400);
      }
    }
  }, [activeTab]);

  // Adaptive Polling: 8 seconds when panel is open, 25 seconds when idle
  useEffect(() => {
    fetchNotifications();
    const pollIntervalMs = isOpen ? 8000 : 25000;
    const interval = setInterval(() => fetchNotifications(), pollIntervalMs);
    return () => clearInterval(interval);
  }, [activeTab, isOpen, fetchNotifications]);

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
        showToast({ type: "success", title: "Marked all notifications as read" });
      }
    } catch {
      showToast({ type: "error", title: "Failed to mark notifications as read" });
    }
  };

  const handleMarkSingleRead = async (id: string) => {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isRead: true }),
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {}
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
    const isSurge = n.metadata?.isSurge === true;
    const isDiscovery = n.metadata?.runnerType === "discovery";

    if (isWentDark) {
      return (
        <div className="w-8 h-8 rounded-lg bg-rose-500/15 text-rose-500 border border-rose-500/30 flex items-center justify-center shrink-0 shadow-sm animate-pulse">
          <Moon className="w-4 h-4" />
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
    return (
      <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 flex items-center justify-center shrink-0">
        <AlertCircle className="w-4 h-4" />
      </div>
    );
  };

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      {/* Trigger Button */}
      {layout === "navbar" ? (
        <button
          onClick={() => setIsOpen(!isOpen)}
          title={`Notifications (${unreadCount} unread)`}
          aria-label={`Notifications (${unreadCount} unread)`}
          className={`relative flex items-center justify-center w-8.5 h-8.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm transition-all cursor-pointer ${
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
              ? "right-0 top-full mt-2"
              : layout === "collapsed"
              ? "left-16 bottom-0"
              : "left-0 sm:left-full sm:bottom-0 sm:ml-2 bottom-4 sm:bottom-auto"
          } w-[calc(100vw-2rem)] sm:w-[460px] max-h-[82vh] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-bold text-slate-900 dark:text-white">
                Live Activity & Summaries
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
          <div className="flex items-center px-3 py-2 border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/30 dark:bg-slate-900/30 overflow-x-auto gap-1 text-[11px] font-semibold">
            {[
              { id: "all", label: "All" },
              { id: "batch_summary", label: "Summaries" },
              { id: "count_scan", label: "Surges & Drops" },
              { id: "ad_spy", label: "Ad Spy" },
              { id: "page_merged,multi_page_detected,system_alert", label: "Alerts & Merges" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-2.5 py-1 rounded-lg transition-colors shrink-0 ${
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
          <div className="overflow-y-auto max-h-[480px] divide-y divide-slate-100 dark:divide-slate-800/60">
            {notifications.length === 0 ? (
              <div className="py-12 px-4 text-center flex flex-col items-center justify-center space-y-2 text-slate-400">
                <Inbox className="w-8 h-8 opacity-40" />
                <p className="text-xs">No activity notifications yet.</p>
              </div>
            ) : (
              notifications.map((n) => {
                const movers = (n.metadata?.movers as any[]) || [];
                const topBrands = (n.metadata?.topBrands as any[]) || [];
                const isWentDark = n.metadata?.wentDark === true;
                const isSurge = n.metadata?.isSurge === true;

                return (
                  <div
                    key={n.id}
                    onClick={() => !n.isRead && handleMarkSingleRead(n.id)}
                    className={`relative p-3.5 flex items-start space-x-3 transition-colors cursor-pointer ${
                      n.isRead
                        ? "bg-transparent hover:bg-slate-50/50 dark:hover:bg-slate-800/30 opacity-75 hover:opacity-100"
                        : isWentDark
                        ? "bg-rose-500/[0.06] dark:bg-rose-500/[0.1] hover:bg-rose-500/[0.09]"
                        : isSurge
                        ? "bg-amber-500/[0.06] dark:bg-amber-500/[0.1] hover:bg-amber-500/[0.09]"
                        : "bg-indigo-500/[0.04] dark:bg-indigo-500/[0.07] hover:bg-indigo-500/[0.08] dark:hover:bg-indigo-500/[0.12]"
                    }`}
                  >
                    {getNotificationIcon(n)}

                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 truncate">
                          <h4
                            className={`text-xs font-bold truncate ${
                              n.isRead ? "text-slate-700 dark:text-slate-300" : "text-slate-900 dark:text-white"
                            }`}
                          >
                            {n.title}
                          </h4>
                          {isWentDark && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-rose-500/20 text-rose-600 dark:text-rose-400 shrink-0">
                              DARK
                            </span>
                          )}
                          {isSurge && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0">
                              SURGE
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 shrink-0">
                          {formatRelativeTime(n.createdAt)}
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed break-words">
                        {n.message}
                      </p>

                      {/* Movers Pills for Batch Count Summaries */}
                      {n.type === "batch_summary" && movers.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {movers.slice(0, 4).map((m, idx) => (
                            <Link
                              key={idx}
                              href={m.trackedPageId ? `/spy?trackedPageId=${m.trackedPageId}` : `/?search=${encodeURIComponent(m.name)}`}
                              onClick={() => setIsOpen(false)}
                              className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/60 text-[10px] font-semibold text-slate-700 dark:text-slate-200 hover:border-indigo-500/40 dark:hover:border-indigo-500/40 transition-colors"
                            >
                              <span>{m.name}</span>
                              <span className="text-emerald-600 dark:text-emerald-400 font-extrabold">
                                +{m.extractedCount || m.diff || 1}
                              </span>
                            </Link>
                          ))}
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
                              onClick={() => setIsOpen(false)}
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

                      {/* Action Buttons */}
                      <div className="flex items-center gap-2 pt-0.5">
                        {n.type === "multi_page_detected" && n.trackedPageId && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsOpen(false);
                              onOpenResolveModal?.(n.trackedPageId!);
                            }}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 text-[10px] font-bold border border-amber-500/20 transition-all active:scale-95 cursor-pointer"
                          >
                            <span>Review Brand Pages</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </button>
                        )}

                        {n.actionUrl && n.type !== "multi_page_detected" && (
                          <Link
                            href={n.actionUrl}
                            onClick={() => setIsOpen(false)}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800/90 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-200 dark:hover:bg-slate-700/80 text-[10px] font-semibold border border-slate-200 dark:border-slate-700/80 transition-all active:scale-95 shadow-2xs"
                          >
                            <span>View Details</span>
                            <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                          </Link>
                        )}
                      </div>
                    </div>

                    {!n.isRead && (
                      <span className="w-2 h-2 rounded-full bg-indigo-500 ring-2 ring-white dark:ring-slate-900 shrink-0 mt-1 shadow-xs" />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
