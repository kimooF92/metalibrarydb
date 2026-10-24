"use client";

import React, { useState, useMemo } from "react";
import { useWizard } from "./wizard-context";
import { buildFrontierPrompt, getPromptTelemetryCounts } from "@/lib/opportunities/prompt-generator";
import { useToast } from "@/components/toast-context";
import { useWorkspace } from "@/components/workspace-context";
import { downloadDatasetCsv } from "@/components/analytics/export-dropdown";
import {
  Copy,
  Check,
  Download,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  FileCode,
  ShieldCheck,
  Sparkles,
  Layers,
  ShoppingBag,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
} from "lucide-react";

export function Step5ExportAudit() {
  const { config, telemetry } = useWizard();
  const { showToast } = useToast();
  const { activeWorkspace } = useWorkspace();
  const [copied, setCopied] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [downloadingCsv, setDownloadingCsv] = useState(false);

  // Generate the prompt dynamically from the current wizard state
  const generatedPrompt = useMemo(() => {
    if (!telemetry) return "";
    return buildFrontierPrompt(config, telemetry);
  }, [config, telemetry]);

  const packedCounts = useMemo(() => {
    if (!telemetry) {
      return {
        categoriesCount: 0,
        scalingBrandsCount: 0,
        descalingBrandsCount: 0,
        productsCount: 0,
        creativesCount: 0,
        totalDataPoints: 0,
      };
    }
    return getPromptTelemetryCounts(config, telemetry);
  }, [config, telemetry]);

  const estimatedTokens = useMemo(() => {
    return Math.round(generatedPrompt.length / 4);
  }, [generatedPrompt]);

  const promptBytes = useMemo(() => {
    if (!generatedPrompt) return 0;
    return new Blob([generatedPrompt]).size;
  }, [generatedPrompt]);

  const tokenSafety = useMemo(() => {
    if (estimatedTokens > 80000) {
      return {
        label: "Heavy Context (> 80k)",
        badgeClass: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20",
        isWarning: true,
      };
    }
    if (estimatedTokens > 35000) {
      return {
        label: "Moderate Context (35k - 80k)",
        badgeClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20",
        isWarning: false,
      };
    }
    return {
      label: "Safe Headroom (< 35k)",
      badgeClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20",
      isWarning: false,
    };
  }, [estimatedTokens]);

  const handleCopyPrompt = async () => {
    if (!generatedPrompt) return;
    try {
      await navigator.clipboard.writeText(generatedPrompt);
      setCopied(true);
      showToast({
        type: "success",
        title: "Prompt Copied to Clipboard",
        message: `Packed ~${estimatedTokens.toLocaleString()} tokens of market telemetry. Paste into your target LLM!`,
      });
      setTimeout(() => setCopied(false), 2500);
    } catch {
      showToast({
        type: "error",
        title: "Copy Failed",
        message: "Please manually copy the text from the preview box below.",
      });
    }
  };

  const handleDownloadMd = () => {
    if (!generatedPrompt) return;
    const slug = (activeWorkspace?.slug || "workspace").replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
    const dateStamp = new Date().toISOString().split("T")[0];
    const filename = `${slug}_${config.targetLlm}_prompt_${dateStamp}.md`;

    const blob = new Blob([generatedPrompt], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    showToast({
      type: "success",
      title: "Markdown Prompt Downloaded",
      message: `Saved ${filename}`,
    });
  };

  const handleDownloadCsvDatasets = async () => {
    if (downloadingCsv) return;
    try {
      setDownloadingCsv(true);
      showToast({
        type: "info",
        title: "Downloading Telemetry Datasets",
        message: "Fetching accurate CSV files for brands, products, categories, and ads...",
      });

      // Sequential downloads with 250ms spacing using accurate non-lean mode (lean=false)
      await downloadDatasetCsv("brands", config.timeWindow, activeWorkspace?.id, false);
      await new Promise((r) => setTimeout(r, 250));
      await downloadDatasetCsv("products", config.timeWindow, activeWorkspace?.id, false);
      await new Promise((r) => setTimeout(r, 250));
      await downloadDatasetCsv("categories", config.timeWindow, activeWorkspace?.id, false);
      await new Promise((r) => setTimeout(r, 250));
      await downloadDatasetCsv("ads", config.timeWindow, activeWorkspace?.id, false);

      showToast({
        type: "success",
        title: "All Telemetry CSVs Downloaded",
        message: "Attach these files directly into Claude Projects or ChatGPT Data Analysis.",
      });
    } catch (err: any) {
      console.error("Failed to download CSV datasets:", err);
      showToast({
        type: "error",
        title: "Download Failed",
        message: err.message || "Failed to download full telemetry CSVs",
      });
    } finally {
      setDownloadingCsv(false);
    }
  };

  const handleCopyAndLaunch = (url: string, platformName: string) => {
    // Open target window synchronously to preserve transient browser user activation
    const newTab = window.open(url, "_blank", "noopener,noreferrer");
    // Trigger prompt copying asynchronously
    void handleCopyPrompt();
    if (!newTab) {
      showToast({
        type: "info",
        title: "Popup Blocked",
        message: `Please allow popups to open ${platformName} directly, or copy the prompt above.`,
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Live Telemetry Ingestion Audit */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-teal-500" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Live Ingestion Telemetry Audit
            </h3>
          </div>
          <span className={`flex items-center text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full ${tokenSafety.badgeClass}`}>
            ~{estimatedTokens.toLocaleString()} tokens ({(promptBytes / 1024).toFixed(1)} KB) | {tokenSafety.label}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 text-center">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Packed Niches</span>
            <p className="text-base font-black text-indigo-600 dark:text-indigo-400 font-mono mt-0.5">
              {packedCounts.categoriesCount}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 text-center">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Scaling Brands</span>
            <p className="text-base font-black text-teal-600 dark:text-teal-400 font-mono mt-0.5">
              {packedCounts.scalingBrandsCount}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 text-center">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Descaling</span>
            <p className="text-base font-black text-rose-600 dark:text-rose-400 font-mono mt-0.5">
              {packedCounts.descalingBrandsCount}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 text-center">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Products Packed</span>
            <p className="text-base font-black text-slate-900 dark:text-slate-100 font-mono mt-0.5">
              {packedCounts.productsCount}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 text-center">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Creatives</span>
            <p className="text-base font-black text-purple-600 dark:text-purple-400 font-mono mt-0.5">
              {packedCounts.creativesCount}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 text-center">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Total Rows</span>
            <p className="text-base font-black text-amber-600 dark:text-amber-400 font-mono mt-0.5">
              {packedCounts.totalDataPoints}
            </p>
          </div>
        </div>

        {tokenSafety.isWarning && (
          <div className="mt-2.5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Prompt payload exceeds 80k estimated tokens. Consider narrowing category filters or lowering scaling brands limit to prevent LLM context degradation.</span>
          </div>
        )}
      </div>

      {/* 2. Primary Action Bar */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-teal-500/10 border border-indigo-500/20 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-indigo-500" />
              Frontier Prompt Ready for Ingestion
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Optimized for <strong>{config.targetLlm.toUpperCase()}</strong> with <strong>{config.htmlTheme}</strong> theme.
            </p>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleCopyPrompt}
              className="flex-1 sm:flex-none flex items-center justify-center space-x-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? "Copied!" : "Copy Prompt"}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadMd}
              className="flex items-center justify-center space-x-1.5 px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 font-bold text-xs transition-all cursor-pointer"
              title="Download as .md file"
            >
              <Download className="w-4 h-4 text-slate-500" />
              <span className="hidden sm:inline">.md</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadCsvDatasets}
              disabled={downloadingCsv}
              className="flex items-center justify-center space-x-1.5 px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 font-bold text-xs transition-all cursor-pointer disabled:opacity-50"
              title="Download raw CSV datasets for direct file attachment"
            >
              <Download className="w-4 h-4 text-teal-600" />
              <span className="hidden sm:inline">Full CSVs</span>
            </button>
          </div>
        </div>

        {/* Quick Launchers */}
        <div className="pt-3 border-t border-indigo-500/15 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mr-1">
            Copy & Launch Destination:
          </span>
          <button
            type="button"
            onClick={() => handleCopyAndLaunch("https://claude.ai/new", "Claude")}
            className="flex items-center space-x-1 px-3 py-1 rounded-lg text-xs font-semibold bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-white transition-all cursor-pointer"
          >
            <span>Claude.ai</span>
            <ExternalLink className="w-3 h-3 text-slate-400" />
          </button>
          <button
            type="button"
            onClick={() => handleCopyAndLaunch("https://chatgpt.com", "ChatGPT")}
            className="flex items-center space-x-1 px-3 py-1 rounded-lg text-xs font-semibold bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-white transition-all cursor-pointer"
          >
            <span>ChatGPT</span>
            <ExternalLink className="w-3 h-3 text-slate-400" />
          </button>
          <button
            type="button"
            onClick={() => handleCopyAndLaunch("https://gemini.google.com", "Gemini")}
            className="flex items-center space-x-1 px-3 py-1 rounded-lg text-xs font-semibold bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-white transition-all cursor-pointer"
          >
            <span>Gemini</span>
            <ExternalLink className="w-3 h-3 text-slate-400" />
          </button>
        </div>
      </div>

      {/* 3. Collapsible Live Markdown Preview */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900/60">
        <button
          type="button"
          onClick={() => setPreviewOpen(!previewOpen)}
          className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900/80 flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
        >
          <div className="flex items-center space-x-2">
            <FileCode className="w-4 h-4 text-indigo-500" />
            <span>Interactive Generated Prompt Preview ({generatedPrompt.length.toLocaleString()} characters)</span>
          </div>
          {previewOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {previewOpen && (
          <div className="p-4 bg-slate-950 font-mono text-[11px] text-slate-200 max-h-96 overflow-y-auto leading-relaxed select-text whitespace-pre-wrap">
            {generatedPrompt}
          </div>
        )}
      </div>
    </div>
  );
}
