"use client";

import { useEffect, useState } from "react";
import { Play, Filter, Link2, ListOrdered, X, Loader2 } from "lucide-react";
import type { ParsedMetaAdUrl } from "@/lib/url-parser";
import { KEYWORD_GROUPS } from "@/features/discovery/hooks/use-discovery-runs";
import { SearchControlsStep } from "@/features/discovery/components/modal/search-controls-step";
import { DirectUrlStep } from "@/features/discovery/components/modal/direct-url-step";
import { SequenceStep } from "@/features/discovery/components/modal/sequence-step";

export { KEYWORD_GROUPS };

export interface NewScanModalProps {
  isOpen: boolean;
  onClose: () => void;

  // Search mode & inputs
  searchMode: "controls" | "url" | "sequence";
  onSetSearchMode: (mode: "controls" | "url" | "sequence") => void;

  // Controls mode
  country: string;
  onCountryChange: (val: string) => void;
  mediaType: "all" | "video" | "image";
  onMediaTypeChange: (val: "all" | "video" | "image") => void;
  selectedKeyword: string;
  onSelectedKeywordChange: (val: string) => void;
  isCustomKeyword: boolean;
  onIsCustomKeywordChange: (val: boolean) => void;
  customKeywordText: string;
  onCustomKeywordTextChange: (val: string) => void;

  // Dates
  startDateMin: string;
  onStartDateMinChange: (val: string) => void;
  startDateMax: string;
  onStartDateMaxChange: (val: string) => void;
  activeDatePreset: "last7" | "last30" | "today" | "custom";
  onApplyDatePreset: (preset: "today" | "last7" | "last30") => void;

  // Scan Depth
  scanDepthPreset: "quick" | "balanced" | "deep" | "custom";
  onScanDepthPresetChange: (val: "quick" | "balanced" | "deep" | "custom") => void;
  customMaxAds: string;
  onCustomMaxAdsChange: (val: string) => void;
  customMaxScrolls: string;
  onCustomMaxScrollsChange: (val: string) => void;
  effectiveTargetMaxAds: number;
  effectiveMaxScrolls: number;

  // Direct URL mode
  directUrlInput: string;
  onDirectUrlInputChange: (val: string) => void;
  parsedUrlPreview: ParsedMetaAdUrl | null;
  onPopulateControlsFromUrl: (parsed: ParsedMetaAdUrl) => void;

  // Scan Actions
  isLaunchingScan: boolean;
  onLaunchScan: () => Promise<void>;
  onLaunchUrlScan: () => Promise<void>;
  onLaunchSequenceScan: (payload: {
    sequenceType: "urls" | "keywords";
    urlsText?: string;
    keywordsText?: string;
    country?: string;
    mediaType?: string;
    startDateMin?: string;
    startDateMax?: string;
  }) => Promise<void>;
}

export function NewScanModal({
  isOpen,
  onClose,
  searchMode,
  onSetSearchMode,
  country,
  onCountryChange,
  mediaType,
  onMediaTypeChange,
  selectedKeyword,
  onSelectedKeywordChange,
  isCustomKeyword,
  onIsCustomKeywordChange,
  customKeywordText,
  onCustomKeywordTextChange,
  startDateMin,
  onStartDateMinChange,
  startDateMax,
  onStartDateMaxChange,
  activeDatePreset,
  onApplyDatePreset,
  scanDepthPreset,
  onScanDepthPresetChange,
  customMaxAds,
  onCustomMaxAdsChange,
  customMaxScrolls,
  onCustomMaxScrollsChange,
  effectiveTargetMaxAds,
  effectiveMaxScrolls,
  directUrlInput,
  onDirectUrlInputChange,
  parsedUrlPreview,
  onPopulateControlsFromUrl,
  isLaunchingScan,
  onLaunchScan,
  onLaunchUrlScan,
  onLaunchSequenceScan,
}: NewScanModalProps) {
  const [sequenceSubMode, setSequenceSubMode] = useState<"urls" | "keywords">("urls");
  const [sequenceUrlsText, setSequenceUrlsText] = useState("");
  const [sequenceKeywordsText, setSequenceKeywordsText] = useState("");

  const sequenceUrlLines = sequenceUrlsText
    .split("\n")
    .map((u) => u.trim())
    .filter(Boolean);
  const sequenceKwLines = sequenceKeywordsText
    .split(/[\n,]+/)
    .map((k) => k.trim())
    .filter(Boolean);
  const sequenceCount = sequenceSubMode === "urls" ? sequenceUrlLines.length : sequenceKwLines.length;

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm shrink-0">
              <Play className="w-5 h-5 fill-current ml-0.5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                Discover New Brands
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                  Shop Now & Order Now
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Search Meta's ad library to uncover rising stores and trending products.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition cursor-pointer"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Selector Tabs */}
        <div className="px-5 pt-4 pb-2 shrink-0 border-b border-slate-100 dark:border-slate-800/60 bg-white dark:bg-slate-900">
          <div className="inline-flex items-center bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => onSetSearchMode("controls")}
              className={`flex-1 sm:flex-initial flex items-center justify-center space-x-2 px-4 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                searchMode === "controls"
                  ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Search Filters</span>
            </button>
            <button
              type="button"
              onClick={() => onSetSearchMode("url")}
              className={`flex-1 sm:flex-initial flex items-center justify-center space-x-2 px-4 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                searchMode === "url"
                  ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <Link2 className="w-3.5 h-3.5" />
              <span>Paste Ad Library Link</span>
            </button>
            <button
              type="button"
              onClick={() => onSetSearchMode("sequence")}
              className={`flex-1 sm:flex-initial flex items-center justify-center space-x-2 px-4 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                searchMode === "sequence"
                  ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <ListOrdered className="w-3.5 h-3.5" />
              <span>Batch Queue</span>
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {searchMode === "sequence" ? (
            <SequenceStep
              sequenceSubMode={sequenceSubMode}
              onSequenceSubModeChange={setSequenceSubMode}
              sequenceUrlsText={sequenceUrlsText}
              onSequenceUrlsTextChange={setSequenceUrlsText}
              sequenceKeywordsText={sequenceKeywordsText}
              onSequenceKeywordsTextChange={setSequenceKeywordsText}
              country={country}
              onCountryChange={onCountryChange}
              mediaType={mediaType}
              onMediaTypeChange={onMediaTypeChange}
            />
          ) : searchMode === "url" ? (
            <DirectUrlStep
              directUrlInput={directUrlInput}
              onDirectUrlInputChange={onDirectUrlInputChange}
              parsedUrlPreview={parsedUrlPreview}
              onPopulateControlsFromUrl={onPopulateControlsFromUrl}
            />
          ) : (
            <SearchControlsStep
              country={{
                value: country,
                onChange: onCountryChange,
              }}
              keyword={{
                selected: selectedKeyword,
                onChangeSelected: onSelectedKeywordChange,
                isCustom: isCustomKeyword,
                onChangeIsCustom: onIsCustomKeywordChange,
                customText: customKeywordText,
                onChangeCustomText: onCustomKeywordTextChange,
              }}
              scanDepth={{
                scanDepthPreset,
                onScanDepthPresetChange,
                customMaxAds,
                onCustomMaxAdsChange,
                customMaxScrolls,
                onCustomMaxScrollsChange,
                effectiveTargetMaxAds,
                effectiveMaxScrolls,
              }}
              dates={{
                startDateMin,
                onChangeStartDateMin: onStartDateMinChange,
                startDateMax,
                onChangeStartDateMax: onStartDateMaxChange,
                activeDatePreset,
                onApplyDatePreset,
              }}
              mediaType={{
                value: mediaType,
                onChange: onMediaTypeChange,
              }}
            />
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center space-x-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <span>
              Target: <strong className="text-slate-800 dark:text-slate-200">{effectiveTargetMaxAds.toLocaleString()} ads</strong> in{" "}
              <strong className="text-indigo-600 dark:text-indigo-400">{country}</strong>
            </span>
          </div>

          <div className="flex items-center space-x-2.5 justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isLaunchingScan}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={
                searchMode === "sequence"
                  ? () =>
                      onLaunchSequenceScan({
                        sequenceType: sequenceSubMode,
                        urlsText: sequenceUrlsText,
                        keywordsText: sequenceKeywordsText,
                        country,
                        mediaType,
                        startDateMin,
                        startDateMax,
                      })
                  : searchMode === "url"
                  ? onLaunchUrlScan
                  : onLaunchScan
              }
              disabled={
                isLaunchingScan ||
                (searchMode === "url" && !parsedUrlPreview?.isValid) ||
                (searchMode === "sequence" && sequenceCount === 0)
              }
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold shadow-md shadow-indigo-600/30 flex items-center space-x-2 transition cursor-pointer disabled:opacity-50"
            >
              {isLaunchingScan ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Searching for Ads...</span>
                </>
              ) : searchMode === "sequence" ? (
                <>
                  <ListOrdered className="w-3.5 h-3.5" />
                  <span>
                    Start Batch ({sequenceCount} Search{sequenceCount === 1 ? "" : "es"})
                  </span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Start Search ({effectiveTargetMaxAds.toLocaleString()} Ads)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
