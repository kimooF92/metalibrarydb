"use client";

import React, { useState } from "react";
import { Globe, Search, X, Calendar, Layers } from "lucide-react";
import { KEYWORD_GROUPS } from "@/features/discovery/hooks/use-discovery-runs";
import { ScanDepthPicker, ScanDepthPickerProps } from "./scan-depth-picker";

export interface SearchControlsStepProps {
  country: {
    value: string;
    onChange: (val: string) => void;
  };
  keyword: {
    selected: string;
    onChangeSelected: (val: string) => void;
    isCustom: boolean;
    onChangeIsCustom: (val: boolean) => void;
    customText: string;
    onChangeCustomText: (val: string) => void;
  };
  scanDepth: ScanDepthPickerProps;
  dates: {
    startDateMin: string;
    onChangeStartDateMin: (val: string) => void;
    startDateMax: string;
    onChangeStartDateMax: (val: string) => void;
    activeDatePreset: "last7" | "last30" | "today" | "custom";
    onApplyDatePreset: (preset: "today" | "last7" | "last30") => void;
  };
  mediaType: {
    value: "all" | "video" | "image";
    onChange: (val: "all" | "video" | "image") => void;
  };
}

export function SearchControlsStep({
  country,
  keyword,
  scanDepth,
  dates,
  mediaType,
}: SearchControlsStepProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
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
            value={country.value}
            onChange={(e) => country.onChange(e.target.value)}
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
            {keyword.isCustom ? (
              <button
                type="button"
                onClick={() => {
                  keyword.onChangeIsCustom(false);
                  keyword.onChangeSelected("\u200D");
                }}
                className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
              >
                Use Preset
              </button>
            ) : (
              <button
                type="button"
                onClick={() => keyword.onChangeIsCustom(true)}
                className="text-[10px] font-bold text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer"
              >
                Custom Keyword
              </button>
            )}
          </div>

          {keyword.isCustom ? (
            <div className="relative">
              <input
                type="text"
                placeholder='e.g. "شحن مجاني" or "توصيل"'
                value={keyword.customText}
                onChange={(e) => keyword.onChangeCustomText(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 font-medium focus:outline-none focus:border-indigo-500"
                autoFocus
              />
              {keyword.customText && (
                <button
                  type="button"
                  onClick={() => keyword.onChangeCustomText("")}
                  className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ) : (
            <select
              value={keyword.selected}
              onChange={(e) => {
                if (e.target.value === "__CUSTOM__") {
                  keyword.onChangeIsCustom(true);
                } else {
                  keyword.onChangeSelected(e.target.value);
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
      <ScanDepthPicker {...scanDepth} />

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
                    onClick={() => dates.onApplyDatePreset("today")}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition cursor-pointer ${
                      dates.activeDatePreset === "today"
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800"
                    }`}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => dates.onApplyDatePreset("last7")}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition cursor-pointer ${
                      dates.activeDatePreset === "last7"
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800"
                    }`}
                  >
                    Last 7 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => dates.onApplyDatePreset("last30")}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition cursor-pointer ${
                      dates.activeDatePreset === "last30"
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
                    value={dates.startDateMin}
                    onChange={(e) => dates.onChangeStartDateMin(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 font-medium focus:outline-none focus:border-indigo-500 [color-scheme:light] dark:[color-scheme:dark]"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-semibold block mb-0.5">End Date</label>
                  <input
                    type="date"
                    value={dates.startDateMax}
                    onChange={(e) => dates.onChangeStartDateMax(e.target.value)}
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
                value={mediaType.value}
                onChange={(e) => mediaType.onChange(e.target.value as any)}
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
  );
}
