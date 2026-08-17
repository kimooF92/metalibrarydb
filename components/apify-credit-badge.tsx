"use client";

import { useEffect, useState } from "react";
import { Zap, RefreshCw, AlertCircle } from "lucide-react";
import { ApifyBalanceInfo } from "@/lib/apify";

export function ApifyCreditBadge() {
  const [balance, setBalance] = useState<ApifyBalanceInfo | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);

  const fetchBalance = async () => {
    setIsLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/apify/balance");
      if (!res.ok) throw new Error("Failed to fetch balance");
      const data = await res.json();
      setBalance(data);
    } catch {
      setError(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBalance();
  }, []);

  if (error || (!isLoading && !balance)) {
    return null; // Graceful fallback if Apify token not set
  }

  const remaining = balance ? balance.remainingUsd.toFixed(2) : "5.00";
  const max = balance ? balance.maxMonthlyUsageUsd.toFixed(2) : "5.00";
  const percent = balance ? balance.usagePercent : 0;

  return (
    <div
      title={`Apify Monthly Credit Balance: $${remaining} remaining out of $${max} limit (${percent}% used). Used for Meta Ad Library scraper scans.`}
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 dark:border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs font-medium shrink-0 cursor-help"
    >
      <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500/20 shrink-0" />
      
      {isLoading ? (
        <span className="inline-flex items-center gap-1.5 text-slate-500">
          <RefreshCw className="w-3 h-3 animate-spin" />
          <span>Apify Credit...</span>
        </span>
      ) : (
        <div className="flex items-center gap-2">
          <span>
            <strong>${remaining}</strong> / ${max} Apify Credit
          </span>

          <div className="w-16 h-1.5 bg-amber-200 dark:bg-amber-950 rounded-full overflow-hidden hidden sm:block">
            <div
              className={`h-full transition-all duration-500 ${
                percent > 80 ? "bg-rose-500" : percent > 50 ? "bg-amber-500" : "bg-emerald-500"
              }`}
              style={{ width: `${Math.max(5, 100 - percent)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
