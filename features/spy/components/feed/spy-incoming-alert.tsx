"use client";

import { Sparkles, ArrowUp, X } from "lucide-react";

export interface SpyIncomingAlertProps {
  incomingCount: number;
  autoStream: boolean;
  latestPageName?: string;
  onLoadIntoFeed: () => void;
  onDismiss: () => void;
}

export function SpyIncomingAlert({
  incomingCount,
  autoStream,
  latestPageName,
  onLoadIntoFeed,
  onDismiss,
}: SpyIncomingAlertProps) {
  if (incomingCount <= 0 || autoStream) return null;

  return (
    <div className="sticky top-2 z-30 flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700 text-white shadow-xl shadow-indigo-600/30 backdrop-blur-md animate-in slide-in-from-top-2 duration-200">
      <div className="flex items-center gap-3 min-w-0">
        <div className="relative flex items-center justify-center w-8 h-8 rounded-xl bg-white/20 text-white shrink-0">
          <Sparkles className="w-4 h-4 animate-spin text-amber-300" />
          <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-400"></span>
          </span>
        </div>
        <div className="min-w-0">
          <div className="text-xs font-bold flex items-center gap-2">
            <span>
              ✨ {incomingCount} new{" "}
              {incomingCount === 1 ? "ad creative" : "ad creatives"} discovered!
            </span>
          </div>
          <p className="text-[11px] text-indigo-100 truncate">
            {latestPageName ? `Latest: "${latestPageName}" • ` : ""}
            Click below to inject into feed without losing your scroll position.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onLoadIntoFeed}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white text-indigo-700 hover:bg-indigo-50 font-extrabold text-xs shadow-md transition-all cursor-pointer"
        >
          <ArrowUp className="w-3.5 h-3.5" />
          <span>Load into Feed</span>
        </button>

        <button
          type="button"
          onClick={onDismiss}
          className="p-1.5 text-white/80 hover:text-white rounded-lg hover:bg-white/15 transition-colors cursor-pointer"
          title="Dismiss alert"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

