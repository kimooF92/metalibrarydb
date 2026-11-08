"use client";

import { Bell } from "lucide-react";

interface NotificationTriggerProps {
  layout?: "sidebar" | "navbar" | "collapsed";
  isOpen: boolean;
  unreadCount: number;
  onClick: () => void;
}

export function NotificationTrigger({
  layout = "sidebar",
  isOpen,
  unreadCount,
  onClick,
}: NotificationTriggerProps) {
  if (layout === "navbar") {
    return (
      <button
        onClick={onClick}
        title={`Notifications (${unreadCount} unread)`}
        aria-label={`Notifications (${unreadCount} unread)`}
        className={`relative flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm transition-all cursor-pointer ${
          isOpen
            ? "border-indigo-500/40 text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30"
            : ""
        }`}
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9.5px] font-black leading-none shadow-sm ring-2 ring-white dark:ring-slate-900 animate-in zoom-in-75">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
    );
  }

  if (layout === "collapsed") {
    return (
      <button
        onClick={onClick}
        title={`Notifications (${unreadCount} unread)`}
        className="relative flex items-center justify-center w-10 h-10 mx-auto rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/40 dark:hover:bg-slate-800/40 transition-all border border-transparent cursor-pointer"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900 animate-pulse" />
        )}
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-between w-full px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
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
  );
}

