"use client";

import { useEffect, useState } from "react";
import {
  Globe,
  Search,
  Sliders,
  Calendar,
  Layers,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  X,
  Link2,
  Loader2,
  Play,
  Filter,
  Sparkles,
  Zap,
  Target,
  Flame,
  Settings2,
} from "lucide-react";
import type { ParsedMetaAdUrl } from "@/lib/url-parser";

export const KEYWORD_GROUPS = [
  {
    groupName: "Popular E-Commerce Hooks",
    options: [
      { label: "Zero Width Joiner (Broadest Search)", value: "\u200D" },
      { label: '"توصيل" (Delivery)', value: "توصيل" },
      { label: '"عرض خاص" (Special Offer)', value: "عرض خاص" },
      { label: '"تخفيض" (Discount)', value: "تخفيض" },
      { label: '"الدفع عند الاستلام" (COD)', value: "الدفع عند الاستلام" },
    ],
  },
  {
    groupName: "Problem Solving",
    options: [
      { label: '"بدون تعب" (Effortless)', value: "بدون تعب" },
      { label: '"يحمي" (Protects)', value: "يحمي" },
      { label: '"في دقائق" (In Minutes)', value: "في دقائق" },
      { label: '"حل مشكلة" (Problem Solved)', value: "حل مشكلة" },
    ],
  },
  {
    groupName: "Transformation",
    options: [
      { label: '"شوف الفرق" (See the Difference)', value: "شوف الفرق" },
      { label: '"النتيجة من أول استعمال" (Results from 1st use)', value: "النتيجة من أول استعمال" },
      { label: '"النتيجة" (Results)', value: "النتيجة" },
    ],
  },
];

interface NewScanModalProps {
  isOpen: boolean;
  onClose: () => void;

  // Search mode & inputs
  searchMode: "controls" | "url";
  onSetSearchMode: (mode: "controls" | "url") => void;

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
}: NewScanModalProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

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
                Launch Meta Brand Discovery
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                  Shop Now & Order Now
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Scan active ads in Meta Ad Library to identify new e-commerce brands & product opportunities.
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
              <span>Direct Meta Ad URL</span>
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {searchMode === "url" ? (
            /* Mode 2: Direct URL Input */
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
          ) : (
            /* Mode 1: Search Controls Form */
            <div className="space-y-4">
              {/* Country & Keyword in 2 Columns */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Target Country */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-indigo-500" />
                    Target Country
                  </label>
                  <select
                    value={country}
                    onChange={(e) => onCountryChange(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 font-bold focus:outline-none focus:border-indigo-500 transition cursor-pointer"
                  >
                    <option value="TN">TN — Tunisia</option>
                    <option value="FR">FR — France</option>
                    <option value="US">US — United States</option>
                    <option value="AE">AE — UAE</option>
                    <option value="SA">SA — Saudi Arabia</option>
                    <option value="MA">MA — Morocco</option>
                    <option value="DZ">DZ — Algeria</option>
                    <option value="EG">EG — Egypt</option>
                  </select>
                </div>

                {/* Target Keyword */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Search className="w-3.5 h-3.5 text-indigo-500" />
                      Target Keyword
                    </label>
                    {isCustomKeyword ? (
                      <button
                        type="button"
                        onClick={() => {
                          onIsCustomKeywordChange(false);
                          onSelectedKeywordChange("\u200D");
                        }}
                        className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                      >
                        Use Preset
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onIsCustomKeywordChange(true)}
                        className="text-[10px] font-bold text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer"
                      >
                        Custom Keyword
                      </button>
                    )}
                  </div>

                  {isCustomKeyword ? (
                    <div className="relative">
                      <input
                        type="text"
                        placeholder='e.g. "شحن مجاني" or "توصيل"'
                        value={customKeywordText}
                        onChange={(e) => onCustomKeywordTextChange(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 font-medium focus:outline-none focus:border-indigo-500"
                        autoFocus
                      />
                      {customKeywordText && (
                        <button
                          type="button"
                          onClick={() => onCustomKeywordTextChange("")}
                          className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ) : (
                    <select
                      value={selectedKeyword}
                      onChange={(e) => {
                        if (e.target.value === "__CUSTOM__") {
                          onIsCustomKeywordChange(true);
                        } else {
                          onSelectedKeywordChange(e.target.value);
                        }
                      }}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:border-indigo-500 transition cursor-pointer"
                    >
                      {KEYWORD_GROUPS.map((group) => (
                        <optgroup key={group.groupName} label={`— ${group.groupName} —`}>
                          {group.options.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                      <optgroup label="— Custom —">
                        <option value="__CUSTOM__">Custom Keyword...</option>
                      </optgroup>
                    </select>
                  )}
                </div>
              </div>

              {/* Scan Depth Limit Selection */}
              <div className="space-y-1.5 pt-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-indigo-500" />
                    Scan Depth Limit
                  </span>
                  <span className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400 font-extrabold">
                    {effectiveTargetMaxAds.toLocaleString()} ads · {effectiveMaxScrolls} scrolls max
                  </span>
                </label>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => onScanDepthPresetChange("quick")}
                    className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                      scanDepthPreset === "quick"
                        ? "bg-indigo-50 dark:bg-indigo-950/60 border-indigo-600 text-slate-900 dark:text-white shadow-xs ring-1 ring-indigo-500/30"
                        : "bg-slate-50 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
                    }`}
                  >
                    <div className="font-extrabold text-xs flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span>Quick</span>
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 font-mono">
                      300 ads · 30 scrolls
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => onScanDepthPresetChange("balanced")}
                    className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                      scanDepthPreset === "balanced"
                        ? "bg-indigo-50 dark:bg-indigo-950/60 border-indigo-600 text-slate-900 dark:text-white shadow-xs ring-1 ring-indigo-500/30"
                        : "bg-slate-50 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
                    }`}
                  >
                    <div className="font-extrabold text-xs flex items-center gap-1.5">
                      <Target className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      <span>Balanced</span>
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 font-mono">
                      1,000 ads · 75 scrolls
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => onScanDepthPresetChange("deep")}
                    className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                      scanDepthPreset === "deep"
                        ? "bg-indigo-50 dark:bg-indigo-950/60 border-indigo-600 text-slate-900 dark:text-white shadow-xs ring-1 ring-indigo-500/30"
                        : "bg-slate-50 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
                    }`}
                  >
                    <div className="font-extrabold text-xs flex items-center gap-1.5">
                      <Flame className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                      <span>Deep</span>
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 font-mono">
                      2,500 ads · 150 scrolls
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => onScanDepthPresetChange("custom")}
                    className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                      scanDepthPreset === "custom"
                        ? "bg-indigo-50 dark:bg-indigo-950/60 border-indigo-600 text-slate-900 dark:text-white shadow-xs ring-1 ring-indigo-500/30"
                        : "bg-slate-50 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
                    }`}
                  >
                    <div className="font-extrabold text-xs flex items-center gap-1.5">
                      <Settings2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>Custom</span>
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 font-mono">
                      Configure...
                    </div>
                  </button>
                </div>

                {scanDepthPreset === "custom" && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-950/80 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-3 animate-in fade-in duration-150">
                    <div className="flex-1 space-y-1">
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">Target Ads Limit</label>
                      <input
                        type="number"
                        min="50"
                        max="10000"
                        step="50"
                        value={customMaxAds}
                        onChange={(e) => onCustomMaxAdsChange(e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="flex-1 space-y-1">
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">Max Scroll Attempts</label>
                      <input
                        type="number"
                        min="5"
                        max="500"
                        step="5"
                        value={customMaxScrolls}
                        onChange={(e) => onCustomMaxScrollsChange(e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Collapsible Advanced Settings (Dates & Media Format) */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800/60">
                <button
                  type="button"
                  onClick={() => setShowAdvanced((prev) => !prev)}
                  className="flex items-center space-x-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  <span>{showAdvanced ? "▾ Hide Advanced Settings" : "▸ Show Advanced Settings (Dates & Format)"}</span>
                </button>

                {showAdvanced && (
                  <div className="pt-3 space-y-3 animate-in fade-in duration-150">
                    {/* Date Presets Row */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                          Ad Creation Window
                        </label>
                        <div className="flex items-center space-x-1">
                          <button
                            type="button"
                            onClick={() => onApplyDatePreset("today")}
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition cursor-pointer ${
                              activeDatePreset === "today"
                                ? "bg-indigo-600 text-white border-indigo-600"
                                : "bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800"
                            }`}
                          >
                            Today
                          </button>
                          <button
                            type="button"
                            onClick={() => onApplyDatePreset("last7")}
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition cursor-pointer ${
                              activeDatePreset === "last7"
                                ? "bg-indigo-600 text-white border-indigo-600"
                                : "bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800"
                            }`}
                          >
                            Last 7 Days
                          </button>
                          <button
                            type="button"
                            onClick={() => onApplyDatePreset("last30")}
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition cursor-pointer ${
                              activeDatePreset === "last30"
                                ? "bg-indigo-600 text-white border-indigo-600"
                                : "bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800"
                            }`}
                          >
                            Last 30 Days
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-slate-400 font-semibold block mb-0.5">Start Date</label>
                          <input
                            type="date"
                            value={startDateMin}
                            onChange={(e) => onStartDateMinChange(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 font-medium focus:outline-none focus:border-indigo-500 [color-scheme:light] dark:[color-scheme:dark]"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-400 font-semibold block mb-0.5">End Date</label>
                          <input
                            type="date"
                            value={startDateMax}
                            onChange={(e) => onStartDateMaxChange(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 font-medium focus:outline-none focus:border-indigo-500 [color-scheme:light] dark:[color-scheme:dark]"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Media Format */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-indigo-500" />
                        Media Format Filter
                      </label>
                      <select
                        value={mediaType}
                        onChange={(e) => onMediaTypeChange(e.target.value as any)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-100 font-medium focus:outline-none focus:border-indigo-500 cursor-pointer"
                      >
                        <option value="video">Video Ads Only (Best for COD & E-Commerce)</option>
                        <option value="image">Image Ads Only</option>
                        <option value="all">All Formats (Video + Image)</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>
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
              onClick={searchMode === "url" ? onLaunchUrlScan : onLaunchScan}
              disabled={isLaunchingScan || (searchMode === "url" && !parsedUrlPreview?.isValid)}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold shadow-md shadow-indigo-600/30 flex items-center space-x-2 transition cursor-pointer disabled:opacity-50"
            >
              {isLaunchingScan ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Harvesting Pages...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Launch Discovery ({effectiveTargetMaxAds.toLocaleString()} Ads)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
