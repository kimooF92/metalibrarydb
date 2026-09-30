"use client";

import { useEffect, useState, useRef } from "react";
import { Zap, RefreshCw, Key } from "lucide-react";
import { ApifyBalanceInfo } from "@/lib/apify";

export function ApifyCreditBadge() {
  const [balance, setBalance] = useState<ApifyBalanceInfo | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);
  const [isOpen, setIsOpen] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchBalance = async (force = false) => {
    try {
      const url = force ? "/api/apify/balance?force=true" : "/api/apify/balance";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch balance");
      const data = await res.json();
      setBalance(data);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBalance();

    // Auto-refresh every 60s when active
    const interval = setInterval(() => {
      if (!document.hidden) fetchBalance();
    }, 60_000);

    // Refresh on tab focus
    const handleFocus = () => fetchBalance();

    // Refresh when feed or scan completes
    const handleCustomRefresh = () => fetchBalance(true);

    window.addEventListener("focus", handleFocus);
    window.addEventListener("apify:refresh-balance", handleCustomRefresh);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("apify:refresh-balance", handleCustomRefresh);
    };
  }, []);

  // Dismiss on outside click or Escape
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  const handleMouseEnter = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    closeTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 180);
  };

  if (error || (!isLoading && !balance)) {
    return null;
  }

  const remaining = balance ? balance.remainingUsd.toFixed(2) : "5.00";
  const max = balance ? balance.maxMonthlyUsageUsd.toFixed(2) : "5.00";
  const percent = balance ? balance.usagePercent : 0;
  const activeKeyIndex = balance?.activeTokenIndex || 1;
  const totalKeys = balance?.totalTokensCount || 1;

  const totalPoolRemaining = balance?.totalPoolRemainingUsd ?? Number(remaining);
  const totalPoolMax = balance?.totalPoolMaxUsd ?? Number(max);

  return (
    <div
      ref={containerRef}
      className="relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Badge / Trigger */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/20 dark:border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs font-medium shrink-0 cursor-pointer select-none transition-colors hover:bg-amber-500/15"
      >
        <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500/30 shrink-0" />

        {isLoading ? (
          <span className="inline-flex items-center gap-1.5 text-slate-500">
            <RefreshCw className="w-3 h-3 animate-spin" />
            <span>Apify...</span>
          </span>
        ) : (
          <div className="flex items-center gap-1.5">
            {/* Active Key Number Pill (e.g. 1/5, 2/5, etc.) */}
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-900 dark:text-amber-100 font-mono font-bold text-[10px]">
              <Key className="w-2.5 h-2.5 opacity-70" />
              <span>
                {activeKeyIndex}/{totalKeys}
              </span>
            </span>

            {/* Credit amount */}
            <span>
              <strong>${remaining}</strong>
              <span className="text-amber-700/70 dark:text-amber-300/70"> / ${max}</span>
            </span>

            {/* Progress bar */}
            <div className="w-12 h-1.5 bg-amber-200 dark:bg-amber-950/80 rounded-full overflow-hidden hidden sm:block shrink-0">
              <div
                className={`h-full transition-all duration-300 ${
                  percent > 80 ? "bg-rose-500" : percent > 50 ? "bg-amber-500" : "bg-emerald-500"
                }`}
                style={{ width: `${Math.max(5, 100 - percent)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Simplified, Clean Popover on Hover */}
      {isOpen && balance && (
        <div
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          className="absolute right-0 top-full mt-1.5 w-76 sm:w-80 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-3 z-50 animate-in fade-in-0 duration-100 select-none text-slate-800 dark:text-slate-200 overflow-x-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800/80">
            <span className="text-xs font-bold text-slate-900 dark:text-white">
              Apify Keys ({totalKeys})
            </span>
            <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
              Pool: <strong className="text-emerald-600 dark:text-emerald-400">${totalPoolRemaining.toFixed(2)}</strong> / ${totalPoolMax.toFixed(2)}
            </span>
          </div>

          {/* Simple List of Every Key */}
          <div className="divide-y divide-slate-100 dark:divide-slate-800/60 mt-1 max-h-56 overflow-y-auto overflow-x-hidden">
            {balance.keys && balance.keys.length > 0 ? (
              balance.keys.map((k) => (
                <div
                  key={k.index}
                  className={`flex items-center justify-between py-1.5 px-1.5 text-xs rounded-md ${
                    k.isActive ? "bg-emerald-500/10" : ""
                  }`}
                >
                  {/* Left: Key index + Status badge + Masked token */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-mono font-bold text-[10px] text-slate-500 shrink-0 w-3.5">
                      #{k.index}
                    </span>

                    {k.isActive ? (
                      <span className="px-1.5 py-0.5 rounded text-[9.5px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shrink-0">
                        In Use
                      </span>
                    ) : k.isExhausted ? (
                      <span className="px-1.5 py-0.5 rounded text-[9.5px] font-medium bg-rose-500/10 text-rose-500 dark:text-rose-400 shrink-0">
                        Exhausted
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded text-[9.5px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-400 shrink-0">
                        Standby
                      </span>
                    )}

                    <span className="font-mono text-[10px] text-slate-400 truncate max-w-[85px]">
                      {k.token}
                    </span>
                  </div>

                  {/* Right: Balance */}
                  <div className="font-mono text-right shrink-0 text-xs pl-2">
                    <span
                      className={
                        k.isActive
                          ? "font-bold text-slate-900 dark:text-white"
                          : k.isExhausted
                          ? "text-slate-400 line-through"
                          : "text-slate-600 dark:text-slate-300"
                      }
                    >
                      ${k.remainingUsd.toFixed(2)}
                    </span>
                    <span className="text-[10px] text-slate-400"> / ${k.maxMonthlyUsageUsd.toFixed(2)}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-2 text-center text-xs text-slate-400">No keys configured</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
