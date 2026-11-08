"use client";

import { useRef, useEffect } from "react";
import type { NotificationCenterProps } from "../types";
import { useNotifications } from "../hooks/use-notifications";
import { NotificationTrigger } from "./notification-trigger";
import { NotificationTabs } from "./notification-tabs";
import { NotificationItem } from "./notification-item";
import { NotificationClearDialog } from "./notification-clear-dialog";
import { CheckCheck, RefreshCw, Inbox } from "lucide-react";

export function NotificationCenter({
  layout = "sidebar",
  onOpenResolveModal,
}: NotificationCenterProps) {
  const {
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
  } = useNotifications();

  const dropdownRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setConfirmClearAll(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, setIsOpen, setConfirmClearAll]);

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

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      {/* Trigger Button */}
      <NotificationTrigger
        layout={layout}
        isOpen={isOpen}
        unreadCount={unreadCount}
        onClick={() => setIsOpen(!isOpen)}
      />

      {/* Dropdown Panel */}
      {isOpen && (
        <div
                ? "left-0 bottom-full mb-2 w-80 sm:w-96"
                : "right-0 top-full w-80 sm:w-96"
              }`}
          style={{ maxHeight: "calc(100vh - 120px)" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-900">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Notifications
              </h3>
              {unreadCount > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-rose-500 text-white">
                  {unreadCount}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => fetchNotifications(true)}
                disabled={isRefreshing}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                title="Refresh notifications"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-indigo-500" : ""}`} />
    </button>

              {
    unreadCount > 0 && (
      <button
        type="button"
        onClick={handleMarkAllRead}
        className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
        title="Mark all as read"
      >
        <CheckCheck className="w-3.5 h-3.5" />
      </button>
    )
  }

  {
    notifications.length > 0 && (
      <NotificationClearDialog
        confirmClearAll={confirmClearAll}
        onConfirmClick={() => setConfirmClearAll(true)}
        onClearConfirm={handleClearAll}
        onClearCancel={() => setConfirmClearAll(false)}
      />
    )
  }
            </div >
          </div >

    {/* Type Filter Tabs */ }
    < NotificationTabs activeTab = { activeTab } onTabChange = { setActiveTab } />

      {/* Notification List Scroll Area */ }
      < div
  ref = { scrollContainerRef }
  className = "flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60 max-h-[460px] scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800 bg-white dark:bg-slate-900"
    >
  {
    notifications.length === 0 ? (
      <div className="py-12 px-4 text-center">
        <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto mb-2">
          <Inbox className="w-5 h-5" />
        </div>
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
          No notifications yet
        </p>
        <p className="text-[11px] text-slate-400 mt-0.5">
          Scan updates, competitor spikes, and system alerts appear here.
        </p>
      </div>
    ) : (
      notifications.map((n) => (
        <NotificationItem
          key={n.id}
          notification={n}
          onMarkRead={(id) => handleMarkSingleRead(id, true)}
          onOpenResolveModal={onOpenResolveModal}
          onCloseDropdown={() => setIsOpen(false)}
        />
      ))
    )
  }

  {/* Infinite Scroll Sentinel */ }
  <div ref={sentinelRef} className="py-2 text-center text-xs text-slate-400">
    {isLoadingMore && (
      <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400 py-1">
        <RefreshCw className="w-3 h-3 animate-spin text-indigo-500" />
        <span>Loading older notifications…</span>
      </div>
    )}
  </div>
          </div >
        </div >
      )
}
    </div >
  );
}
