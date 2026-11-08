"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

export interface AnalyticsErrorBannerProps {
  error: string | null;
  onRetry: () => void;
}

export function AnalyticsErrorBanner({ error, onRetry }: AnalyticsErrorBannerProps) {
  if (!error) return null;

  return (
    <div className="flex items-center justify-between p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs">
      <div className="flex items-center space-x-2">
        <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
        <span>{error}</span>
      </div>
      <button
        onClick={onRetry}
        className="flex items-center space-x-1 font-bold bg-rose-600 hover:bg-rose-700 text-white px-3 py-1 rounded-xl transition-all cursor-pointer shrink-0"
      >
        <RefreshCw className="w-3 h-3" />
        <span>Retry</span>
      </button>
    </div>
  );
}

