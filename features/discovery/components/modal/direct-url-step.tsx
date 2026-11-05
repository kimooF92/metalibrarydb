"use client";

import React from "react";
import { Link2, X, CheckCircle2, Globe, Search, Layers, AlertCircle, Sparkles } from "lucide-react";
import type { ParsedMetaAdUrl } from "@/lib/url-parser";

export interface DirectUrlStepProps {
  directUrlInput: string;
  onDirectUrlInputChange: (val: string) => void;
  parsedUrlPreview: ParsedMetaAdUrl | null;
  onPopulateControlsFromUrl: (parsed: ParsedMetaAdUrl) => void;
}

export function DirectUrlStep({
  directUrlInput,
  onDirectUrlInputChange,
  parsedUrlPreview,
  onPopulateControlsFromUrl,
}: DirectUrlStepProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
          <Link2 className="w-4 h-4 text-indigo-500" />
          Meta Ad Library URL
        </label>
        <div className="relative">
          <input
            type="text"
            value={directUrlInput}
            onChange={(e) => onDirectUrlInputChange(e.target.value)}
            placeholder="https://www.facebook.com/ads/library/?active_status=active&country=TN&q=..."
            className="w-full pl-3.5 pr-8 py-2.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 font-mono placeholder:font-sans placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 transition shadow-inner"
            autoFocus
          />
          {directUrlInput && (
            <button
              type="button"
              onClick={() => onDirectUrlInputChange("")}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
              title="Clear URL"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Parsed Live URL Preview */}
      {directUrlInput.trim() ? (
        parsedUrlPreview?.isValid ? (
          <div className="p-3.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5 text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Valid Meta Search URL
              </span>
              <button
                type="button"
                onClick={() => onPopulateControlsFromUrl(parsedUrlPreview)}
                className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
              >
                Load into Filters ›
              </button>
            </div>

            <div className="flex flex-wrap gap-2 pt-1 text-xs">
              <span className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2.5 py-1 rounded-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-indigo-500" />
                Country: <strong className="text-indigo-600 dark:text-indigo-400">{parsedUrlPreview.country}</strong>
              </span>
              <span className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2.5 py-1 rounded-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5 text-indigo-500" />
                {parsedUrlPreview.query === "\u200D" || parsedUrlPreview.query === "%E2%80%8D"
                  ? "Broad Search (ZWJ)"
                  : parsedUrlPreview.query || "All ads"}
              </span>
              <span className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2.5 py-1 rounded-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 capitalize">
                <Layers className="w-3.5 h-3.5 text-indigo-500" />
                {parsedUrlPreview.mediaType}
              </span>
            </div>
          </div>
        ) : (
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-200 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>{parsedUrlPreview?.error || "Please enter a valid Meta Ad Library search URL."}</span>
          </div>
        )
      ) : (
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
          <span>Tip: Apply filters directly on Facebook Ad Library in your browser, then paste the URL here to harvest without re-typing.</span>
        </div>
      )}
    </div>
  );
}

