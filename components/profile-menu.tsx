"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Settings,
  Lock,
  Sun,
  Moon,
  ChevronsUpDown,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/components/auth-context";
import { useLogout } from "@/hooks/use-logout";
import { useSidebar } from "@/components/sidebar-context";
import { applyTheme, getStoredTheme, onThemeChange, type Theme } from "@/lib/theme-controller";

interface ProfileMenuProps {
  layout?: "sidebar";
  className?: string;
}

export function ProfileMenu({ layout = "sidebar", className = "" }: ProfileMenuProps) {
  const pathname = usePathname();
  const { isStaff } = useAuth();
  const { logout, isLoggingOut } = useLogout();
  const { isCollapsed } = useSidebar();

  const [isOpen, setIsOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    setTheme(getStoredTheme());
    return onThemeChange((nextTheme: Theme) => setTheme(nextTheme));
  }, []);

  // Close on outside click or Escape key
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleSelectTheme = (newTheme: Theme) => {
    setTheme(newTheme);
    applyTheme(newTheme);
  };

  const displayName = isStaff ? "Staff Member" : "Super Admin";
  const displayRole = isStaff ? "Restricted Access" : "Full Control";
  const initials = isStaff ? "ST" : "SA";

  return (
    <div ref={menuRef} className={`relative ${className}`}>
      {/* Sidebar Trigger */}
      {isCollapsed ? (
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-label={`${displayName} menu`}
          title={`${displayName} - Settings, Theme & Session`}
          className="w-9 h-9 mx-auto rounded-lg flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors relative cursor-pointer group outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        >
          {/* Solid Mono Avatar */}
          <div className="w-7 h-7 rounded-md bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950 flex items-center justify-center text-[10px] font-mono font-bold tracking-tight shadow-xs border border-slate-700/60 dark:border-slate-300">
            {initials}
          </div>
          <span className="absolute bottom-1 right-1 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#010202]" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="w-full flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/[0.05] border border-transparent hover:border-slate-200/60 dark:hover:border-slate-800 transition-all cursor-pointer group text-left outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        >
          <div className="flex items-center space-x-2.5 min-w-0">
            {/* Solid Mono Avatar */}
            <div className="relative shrink-0">
              <div className="w-7 h-7 rounded-md bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950 flex items-center justify-center text-[11px] font-mono font-bold tracking-tight shadow-xs border border-slate-700/60 dark:border-slate-300">
                {initials}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#010202]" />
            </div>
            <div className="min-w-0 flex-1 truncate">
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block truncate group-hover:text-slate-950 dark:group-hover:text-white transition-colors">
                {displayName}
              </span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 block truncate font-medium">
                {displayRole}
              </span>
            </div>
          </div>
          <ChevronsUpDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 shrink-0" />
        </button>
      )}

      {/* Popover Dropdown Card (Opens upwards or sideways from sidebar) */}
      {isOpen && (
        <div
          className={`absolute ${
            isCollapsed ? "bottom-0 left-full ml-3" : "bottom-full left-0 mb-2"
          } w-68 rounded-2xl bg-white dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 shadow-xl shadow-slate-900/10 dark:shadow-black/50 z-50 p-2 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-md select-none`}
        >
          {/* Section 1: User Identity Card */}
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800/80 mb-2">
            <div className="flex items-center space-x-2.5">
              {/* Solid Mono Identity Avatar */}
              <div className="w-8 h-8 rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950 flex items-center justify-center text-xs font-mono font-bold shadow-xs border border-slate-700/60 dark:border-slate-300 shrink-0">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center space-x-1.5">
                  <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {displayName}
                  </span>
                  <span className="px-1.5 py-0.2 rounded-md text-[9px] font-mono font-bold tracking-tight bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300/60 dark:border-slate-700">
                    {isStaff ? "STAFF" : "ROOT"}
                  </span>
                </div>
                <div className="flex items-center space-x-1.5 mt-0.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                    Session Active • Verified
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Appearance Mode Toggle */}
          <div className="px-2 py-1.5 mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-1.5">
              Appearance
            </span>
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80">
              <button
                type="button"
                onClick={() => handleSelectTheme("light")}
                className={`flex items-center justify-center space-x-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  theme === "light"
                    ? "bg-white text-slate-900 shadow-xs border border-slate-200"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <Sun className={`w-3.5 h-3.5 ${theme === "light" ? "text-amber-500" : ""}`} />
                <span>Light</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectTheme("dark")}
                className={`flex items-center justify-center space-x-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  theme === "dark"
                    ? "bg-slate-900 text-white dark:bg-slate-800 dark:border dark:border-slate-700 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <Moon className={`w-3.5 h-3.5 ${theme === "dark" ? "text-slate-200" : ""}`} />
                <span>Dark</span>
              </button>
            </div>
          </div>

          <div className="h-px bg-slate-200/80 dark:bg-slate-800/80 my-1 mx-1" />

          {/* Section 3: Navigation Links */}
          <div className="flex flex-col space-y-0.5 my-1">
            {!isStaff && (
              <Link
                href="/settings"
                onClick={() => setIsOpen(false)}
                className={`flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-medium transition-colors ${
                  pathname === "/settings"
                    ? "bg-slate-100 dark:bg-slate-800/80 text-slate-900 dark:text-white font-semibold"
                    : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60"
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <Settings className="w-4 h-4 text-slate-400 dark:text-slate-400" />
                  <span>Settings & System</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              </Link>
            )}
          </div>

          <div className="h-px bg-slate-200/80 dark:bg-slate-800/80 my-1 mx-1" />

          {/* Section 4: Lock Session / Sign Out */}
          <div className="p-1">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                logout();
              }}
              disabled={isLoggingOut}
              className="w-full flex items-center space-x-2.5 px-2.5 py-2 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer disabled:opacity-50"
            >
              {isLoggingOut ? (
                <div className="w-4 h-4 rounded-full border-2 border-rose-500 border-t-transparent animate-spin shrink-0" />
              ) : (
                <Lock className="w-4 h-4 shrink-0 text-rose-500" />
              )}
              <span>{isLoggingOut ? "Locking Session..." : "Lock Session (Sign Out)"}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
