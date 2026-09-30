"use client";

import { useState, useEffect, useMemo } from "react";
import {
  X,
  Link2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  PlusCircle,
  Sparkles,
  ExternalLink,
  Store,
  Layers,
  Search,
  Laptop,
  Zap,
} from "lucide-react";
import { useToast } from "@/components/toast-context";

interface AddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function AddProductModal({ isOpen, onClose, onSuccess }: AddProductModalProps) {
  const { showToast } = useToast();
  const [url, setUrl] = useState("");
  const [runner, setRunner] = useState<"local" | "apify">("local");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    isNewBrand?: boolean;
    message: string;
    targetDomain?: string;
    pageName?: string;
    runner?: "local" | "apify";
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset state on open/close
  useEffect(() => {
    if (isOpen) {
      setUrl("");
      setRunner("local");
      setLoading(false);
      setResult(null);
      setError(null);
    }
  }, [isOpen]);

  // Live client-side URL analysis for instant feedback
  const detectedInfo = useMemo(() => {
    const trimmed = url.trim();
    if (!trimmed) return null;

    try {
      const urlToTest = trimmed.match(/^https?:\/\//i) ? trimmed : `https://${trimmed}`;
      const parsed = new URL(urlToTest);
      const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
      const isProduct =
        (parsed.pathname && parsed.pathname !== "/" && parsed.pathname.length > 1) ||
        Boolean(parsed.search && parsed.search.length > 1);

      return {
        host,
        isProduct,
        pathname: parsed.pathname,
      };
    } catch {
      return null;
    }
  }, [url]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/products/add-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed, runner }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || data.message || "Failed to add product URL.");
        return;
      }

      setResult({
        success: true,
        isNewBrand: data.isNewBrand,
        message: data.message,
        targetDomain: data.targetDomain || data.page?.displayName,
        pageName: data.page?.displayName,
        runner: data.creativeScan?.runner || runner,
      });

      showToast({
        type: "success",
        title: data.isNewBrand ? "Brand Registered & Creative Scan Set" : "Product Linked & Creative Scan Set",
        message: data.message,
      });

      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      setError(err?.message || "Network error while submitting product link.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <PlusCircle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Add Product Page Link
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Track products, resolve brand domains & monitor Meta ads
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Product Page URL or Store Domain
            </label>
            <div className="relative">
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://brand.com/products/jacket or store.youcan.shop"
                disabled={loading}
                autoFocus
                className="w-full bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 rounded-xl pl-4 pr-10 py-3 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-inner"
              />
              {url && !loading && (
                <button
                  type="button"
                  onClick={() => setUrl("")}
                  className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded-full cursor-pointer transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Live Detected Info Badge */}
            {detectedInfo && (
              <div className="mt-2.5 p-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200/60 dark:border-indigo-800/40 text-xs text-indigo-700 dark:text-indigo-300 flex items-center justify-between animate-in fade-in duration-150">
                <div className="flex items-center space-x-2 truncate">
                  <Store className="w-3.5 h-3.5 shrink-0" />
                  <span className="font-medium truncate">
                    Domain Target: <strong className="font-bold">{detectedInfo.host}</strong>
                  </span>
                </div>
                {detectedInfo.isProduct && (
                  <span className="shrink-0 text-[10px] font-semibold bg-indigo-600/10 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded border border-indigo-400/20">
                    Product Page
                  </span>
                )}
              </div>
            )}

            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
              Paste any product page link. If the brand is already tracked, it links immediately. If it's a new website, the system automatically enqueues a Meta Ad Library search to locate its Facebook Page and active ads.
            </p>
          </div>

          {/* Creative Scan Workflow Runner Selection */}
          <div className="pt-1">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Brand Creative Scan Workflow
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRunner("local")}
                disabled={loading}
                className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                  runner === "local"
                    ? "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-600 text-indigo-700 dark:text-indigo-300 shadow-xs"
                    : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                }`}
              >
                <div className="w-5 h-5 rounded-md bg-indigo-500/10 flex items-center justify-center shrink-0">
                  <Laptop className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="text-left">
                  <div className="leading-tight">Local Playwright</div>
                  <div className="text-[10px] text-slate-400 font-normal">Browser ad extraction</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setRunner("apify")}
                disabled={loading}
                className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                  runner === "apify"
                    ? "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-600 text-indigo-700 dark:text-indigo-300 shadow-xs"
                    : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                }`}
              >
                <div className="w-5 h-5 rounded-md bg-amber-500/10 flex items-center justify-center shrink-0">
                  <Zap className="w-3 h-3 text-amber-500" />
                </div>
                <div className="text-left">
                  <div className="leading-tight">⚡ Apify Cloud</div>
                  <div className="text-[10px] text-slate-400 font-normal">Cloud actor run</div>
                </div>
              </button>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">
              The brand page will automatically run this creative scan to discover and index its active Meta ad creatives.
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/40 text-rose-700 dark:text-rose-300 text-xs flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Success Message Card */}
          {result && (
            <div
              className={`p-4 rounded-xl border text-xs space-y-2.5 animate-in fade-in duration-200 ${
                result.isNewBrand
                  ? "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-500/30 text-indigo-900 dark:text-indigo-200"
                  : "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-500/30 text-emerald-900 dark:text-emerald-200"
              }`}
            >
              <div className="flex items-start space-x-2.5">
                <CheckCircle2
                  className={`w-4 h-4 shrink-0 mt-0.5 ${
                    result.isNewBrand ? "text-indigo-500" : "text-emerald-500"
                  }`}
                />
                <div className="space-y-1">
                  <p className="font-semibold text-sm">
                    {result.isNewBrand ? "🎉 Brand Target Registered" : "✅ Product Linked to Brand"}
                  </p>
                  <p className="text-slate-600 dark:text-slate-300 text-xs leading-relaxed">
                    {result.message}
                  </p>
                </div>
              </div>

              <div
                className={`pt-2 border-t text-[11px] space-y-1 ${
                  result.isNewBrand
                    ? "border-indigo-200/60 dark:border-indigo-500/20 text-indigo-700 dark:text-indigo-300"
                    : "border-emerald-200/60 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                }`}
              >
                <div className="flex items-center space-x-1.5">
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    Brand page set to <strong>{result.runner?.toUpperCase() || runner.toUpperCase()}</strong> creative scan workflow.
                  </span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <Search className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    Ad creatives &amp; landing page intelligence will automatically sync into your dashboard.
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end space-x-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {result ? "Close" : "Cancel"}
            </button>

            {!result && (
              <button
                type="submit"
                disabled={loading || !url.trim()}
                className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 disabled:opacity-50 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all cursor-pointer disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <PlusCircle className="w-4 h-4" />
                    <span>Add Product</span>
                  </>
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
