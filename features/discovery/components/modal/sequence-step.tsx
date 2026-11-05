"use client";

import React from "react";
import { Link2, Filter, Globe, Layers, ShieldCheck } from "lucide-react";

export interface SequenceStepProps {
  sequenceSubMode: "urls" | "keywords";
  onSequenceSubModeChange: (mode: "urls" | "keywords") => void;
  sequenceUrlsText: string;
  onSequenceUrlsTextChange: (val: string) => void;
  sequenceKeywordsText: string;
  onSequenceKeywordsTextChange: (val: string) => void;
  country: string;
  onCountryChange: (val: string) => void;
  mediaType: "all" | "video" | "image";
  onMediaTypeChange: (val: "all" | "video" | "image") => void;
}

export function SequenceStep({
  sequenceSubMode,
  onSequenceSubModeChange,
  sequenceUrlsText,
  onSequenceUrlsTextChange,
  sequenceKeywordsText,
  onSequenceKeywordsTextChange,
  country,
  onCountryChange,
  mediaType,
  onMediaTypeChange,
}: SequenceStepProps) {
  const sequenceUrlLines = sequenceUrlsText
    .split("\n")
    .map((u) => u.trim())
    .filter(Boolean);
  const sequenceKwLines = sequenceKeywordsText
    .split(/[\n,]+/)
    .map((k) => k.trim())
    .filter(Boolean);

  return (
    <div className="space-y-4">
      {/* Sequence Type Selector (Pills) */}
      <div className="flex items-center gap-2 p-1 bg-slate-100 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 w-fit">
        <button
          type="button"
          onClick={() => onSequenceSubModeChange("urls")}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
            sequenceSubMode === "urls"
              ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          <Link2 className="w-3.5 h-3.5" />
          <span>Multi-URL Batch</span>
          {sequenceUrlLines.length > 0 && (
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 font-mono">
              {sequenceUrlLines.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => onSequenceSubModeChange("keywords")}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
            sequenceSubMode === "keywords"
              ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          <Filter className="w-3.5 h-3.5" />
          <span>Keyword Sequence</span>
          {sequenceKwLines.length > 0 && (
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 font-mono">
              {sequenceKwLines.length}
            </span>
          )}
        </button>
      </div>

      {sequenceSubMode === "urls" ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Link2 className="w-4 h-4 text-indigo-500" />
              Meta Ad Library URLs (One URL per line, max 15)
            </label>
            <span className="text-[11px] font-mono text-slate-400">
              {sequenceUrlLines.length} URL{sequenceUrlLines.length === 1 ? "" : "s"}
            </span>
          </div>
          <textarea
            value={sequenceUrlsText}
            onChange={(e) => onSequenceUrlsTextChange(e.target.value)}
            rows={5}
            placeholder={`https://www.facebook.com/ads/library/?active_status=active&country=TN&q="robes"\nhttps://www.facebook.com/ads/library/?active_status=active&country=TN&q="lingerie"\nhttps://www.facebook.com/ads/library/?active_status=active&country=TN&q="chaussures"`}
            className="w-full p-3 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 font-mono placeholder:font-sans placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 transition shadow-inner resize-y"
          />
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Paste individual Meta Ad Library search URLs. Each URL will be parsed and executed in exact sequence.
          </p>
        </div>
      ) : (
        <div className="space-y-3.5">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Filter className="w-4 h-4 text-indigo-500" />
                Keywords Sequence (Comma or newline separated, max 15)
              </label>
              <span className="text-[11px] font-mono text-slate-400">
                {sequenceKwLines.length} keyword{sequenceKwLines.length === 1 ? "" : "s"}
              </span>
            </div>
            <textarea
              value={sequenceKeywordsText}
              onChange={(e) => onSequenceKeywordsTextChange(e.target.value)}
              rows={3}
              placeholder="robes, pyjamas, lingerie, sac à main, montres"
              className="w-full p-3 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 font-medium placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 transition shadow-inner resize-y"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <Globe className="w-3 h-3 text-indigo-500" />
                Target Country
              </label>
              <select
                value={country}
                onChange={(e) => onCountryChange(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 font-bold focus:outline-none focus:border-indigo-500 transition cursor-pointer"
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

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <Layers className="w-3 h-3 text-indigo-500" />
                Media Format
              </label>
              <select
                value={mediaType}
                onChange={(e) => onMediaTypeChange(e.target.value as any)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 font-medium focus:outline-none focus:border-indigo-500 transition cursor-pointer"
              >
                <option value="video">Video Ads Only</option>
                <option value="image">Image Ads Only</option>
                <option value="all">All Formats</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Queue Protection Notice */}
      <div className="p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-900 dark:text-indigo-200 text-xs flex items-start gap-2.5 shadow-xs">
        <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-extrabold text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5">
            <span>Smart Queue Protection Active</span>
            <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-indigo-500/20 font-mono">1 by 1</span>
          </div>
          <p className="text-[11px] leading-relaxed text-indigo-800/80 dark:text-indigo-300/80">
            Searches run one after another with short pauses in between. This keeps your computer fast and avoids search limits.
          </p>
        </div>
      </div>
    </div>
  );
}
