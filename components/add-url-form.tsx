"use client";

import { useState, useEffect, useRef } from "react";
import {
  PlusCircle,
  Loader2,
  Link2,
  AlertCircle,
  CheckCircle2,
  X,
  Globe,
  Sparkles,
  RefreshCw,
  ShoppingBag,
  ExternalLink,
  Layers,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "./auth-context";
import { parseTrackableUrl, ParsedTrackableUrl } from "@/lib/url-parser";

interface AddUrlFormProps {
  onSuccess?: () => void;
}

export function detectPlatformBadge(url: string, type?: string): {
  name: string;
  colorClass: string;
  icon: string;
} {
  const lower = url.toLowerCase();
  if (type === "meta_ad_library" || lower.includes("facebook.com/ads/library")) {
    return {
      name: "Meta Ad Library",
      colorClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
      icon: "📘",
    };
  }
  if (lower.includes("myshopify.com") || lower.includes("shopify")) {
    return {
      name: "Shopify Store",
      colorClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
      icon: "🛍️",
    };
  }
  if (lower.includes("youcan.shop") || lower.includes("youcan.store") || lower.includes("youcan")) {
    return {
      name: "YouCan Shop",
      colorClass: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30",
      icon: "🛒",
    };
  }
  if (lower.includes("stocki.tn") || lower.includes("stocki.co")) {
    return {
      name: "Stocki COD",
      colorClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
      icon: "📦",
    };
  }
  if (lower.includes("woocommerce") || lower.includes("wp-content")) {
    return {
      name: "WooCommerce",
      colorClass: "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30",
      icon: "🔌",
    };
  }
  return {
    name: type === "product_url" ? "Product Landing Page" : "Store Website",
    colorClass: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30",
    icon: "🌐",
  };
}

export function AddUrlForm({ onSuccess }: AddUrlFormProps) {
  const { isStaff } = useAuth();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [duplicatePage, setDuplicatePage] = useState<any | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error" | "duplicate";
    message: string;
  } | null>(null);

  // Live URL preview & duplicate pre-check states
  const [parsedPreview, setParsedPreview] = useState<ParsedTrackableUrl | null>(null);
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);
  const [liveDuplicate, setLiveDuplicate] = useState<{
    id: string;
    displayName: string | null;
    url: string;
    currentResults: number | null;
    pageId: string | null;
    landingPage: string | null;
    status: string | null;
  } | null>(null);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Real-time client parsing & debounced backend duplicate check
  useEffect(() => {
    const trimmed = url.trim();

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    if (!trimmed || trimmed.length < 3) {
      setParsedPreview(null);
      setLiveDuplicate(null);
      setIsCheckingDuplicate(false);
      return;
    }

    // 1. Instant client-side parsing (0ms latency, zero network)
    const parsed = parseTrackableUrl(trimmed);
    setParsedPreview(parsed);

    // 2. Debounced API check against active workspace (300ms)
    debounceTimerRef.current = setTimeout(async () => {
      setIsCheckingDuplicate(true);
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const queryParams = new URLSearchParams();
        queryParams.set("url", trimmed);
        if (parsed?.targetDomain) {
          queryParams.set("domain", parsed.targetDomain);
        }

        const res = await fetch(`/api/pages/check-duplicate?${queryParams.toString()}`, {
          signal: controller.signal,
        });

        if (res.ok) {
          const data = await res.json();
          setLiveDuplicate(data.isDuplicate ? data.page : null);
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          // Silent fallback on network drop
        }
      } finally {
        setIsCheckingDuplicate(false);
      }
    }, 300);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [url]);

  const handleSubmit = async (e?: React.FormEvent, force = false) => {
    if (e) e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setFeedback(null);
    setDuplicatePage(null);

    try {
      const res = await fetch("/api/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), allowDuplicate: force }),
      });

      const data = await res.json();

      if (res.status === 201) {
        setFeedback({
          type: "success",
          message: force
            ? "URL added as a separate entry!"
            : "Added! We're now tracking this page.",
        });
        setUrl("");
        setDuplicatePage(null);
        setParsedPreview(null);
        setLiveDuplicate(null);
        if (onSuccess) onSuccess();
        setTimeout(() => setFeedback(null), 4500);
      } else if (res.status === 409) {
        setDuplicatePage(data.page || liveDuplicate || null);
        setFeedback({
          type: "duplicate",
          message: data.error || "A matching page is already being tracked.",
        });
      } else {
        setFeedback({
          type: "error",
          message: data.error || "Failed to add URL. Please verify format.",
        });
      }
    } catch {
      setFeedback({
        type: "error",
        message: "Network error while adding URL.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshExisting = async (targetId?: string) => {
    const idToRefresh = targetId || duplicatePage?.id || liveDuplicate?.id;
    if (!idToRefresh) return;

    setLoading(true);
    try {
      const res = await fetch("/api/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [idToRefresh] }),
      });
      if (res.ok) {
        const brandLabel =
          duplicatePage?.displayName ||
          liveDuplicate?.displayName ||
          duplicatePage?.url ||
          liveDuplicate?.url ||
          "existing page";
        setFeedback({
          type: "success",
          message: `Refreshing ads for "${brandLabel}" now.`,
        });
        setDuplicatePage(null);
        setLiveDuplicate(null);
        setParsedPreview(null);
        setUrl("");
        if (onSuccess) onSuccess();
        setTimeout(() => setFeedback(null), 4500);
      }
    } catch {
      setFeedback({ type: "error", message: "Failed to refresh existing page." });
    } finally {
      setLoading(false);
    }
  };

  const platformInfo = url.trim() ? detectPlatformBadge(url, parsedPreview?.type) : null;

  return (
    <div className="glass-card rounded-xl p-4 sm:p-5">
      <div className="flex items-center space-x-2 mb-3">
        <Link2 className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          Track a Website or Product Page
        </h3>
      </div>

      <form onSubmit={(e) => handleSubmit(e, false)} className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="website domain, product link, or Meta Ad Library URL"
            className="w-full bg-white dark:bg-slate-950/80 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 rounded-lg pl-4 pr-10 py-2.5 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all"
            disabled={loading}
          />
          {url && !loading && (
            <button
              type="button"
              onClick={() => {
                setUrl("");
                setParsedPreview(null);
                setLiveDuplicate(null);
                setFeedback(null);
              }}
              className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded-full cursor-pointer transition-colors"
              title="Clear input"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
            Enter a website domain, product page URL, or paste the full Meta Ad Library link directly.
          </p>
        </div>

        <button
          type="submit"
          disabled={loading || !url.trim()}
          className="flex items-center justify-center space-x-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 disabled:opacity-50 text-white font-medium text-sm px-5 py-2.5 rounded-lg shadow-md shadow-indigo-600/20 transition-all cursor-pointer disabled:cursor-not-allowed self-start"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <PlusCircle className="w-4 h-4" />
          )}
          <span>Track URL</span>
        </button>
      </form>

      {/* Feature 1: Live Interactive URL Add Preview Card */}
      {parsedPreview && url.trim().length > 3 && (
        <div className="mt-3.5 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-900/60 backdrop-blur-sm animate-in fade-in slide-in-from-top-1 duration-200 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center space-x-2 min-w-0">
              <span className="text-base select-none">{platformInfo?.icon || "🌐"}</span>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {parsedPreview.targetDomain || "Unknown Target"}
                  </span>
                  {platformInfo && (
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${platformInfo.colorClass}`}
                    >
                      {platformInfo.name}
                    </span>
                  )}
                  {parsedPreview.type === "product_url" && (
                    <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                      Product Page
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Live Duplicate vs Ready Status Badge */}
            <div className="flex items-center gap-1.5">
              {isCheckingDuplicate ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 dark:text-slate-500">
                  <Loader2 className="w-3 h-3 animate-spin text-indigo-500" />
                  Checking library...
                </span>
              ) : liveDuplicate ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                  <AlertCircle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                  Already Tracked
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                  <ShieldCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  Ready to Track
                </span>
              )}
            </div>
          </div>

          {/* Conditional Detail: If Duplicate Found in Pre-check */}
          {liveDuplicate && (
            <div className="p-2.5 rounded-lg bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-500/30 text-xs text-amber-900 dark:text-amber-200 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="font-semibold">Brand Monitored: </span>
                  <span className="font-medium text-slate-900 dark:text-white">
                    "{liveDuplicate.displayName || liveDuplicate.url}"
                  </span>
                  {liveDuplicate.currentResults !== null && liveDuplicate.currentResults !== undefined && (
                    <span className="text-amber-700 dark:text-amber-300 font-semibold ml-1">
                      ({liveDuplicate.currentResults} active ads)
                    </span>
                  )}
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    This brand is already tracked in this workspace. You can refresh it immediately or add a separate entry.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-amber-200/60 dark:border-amber-500/20">
                <button
                  type="button"
                  onClick={() => handleRefreshExisting(liveDuplicate.id)}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                  <span>1-Click Refresh Now</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSubmit(undefined, true)}
                  disabled={loading}
                  className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium text-xs border border-slate-300 dark:border-slate-700 transition-all cursor-pointer disabled:opacity-50"
                >
                  Add as Separate Entry
                </button>
              </div>
            </div>
          )}

          {/* Conditional Detail: If URL is clean & Ready to Track */}
          {!liveDuplicate && !isCheckingDuplicate && (
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 px-0.5">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                Store domain: <strong className="text-slate-700 dark:text-slate-300">{parsedPreview.targetDomain}</strong>
              </span>
              <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium">
                Click "Track URL" to start
              </span>
            </div>
          )}
        </div>
      )}

      {/* Post-submit Interactive Duplicate Choice Banner (Fallback if API returns 409) */}
      {feedback?.type === "duplicate" && duplicatePage && !parsedPreview && (
        <div className="mt-3 p-3.5 rounded-xl border bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs space-y-3 animate-in fade-in duration-200">
          <div className="flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-900 dark:text-white">Duplicate Found: </span>
              <span>"{duplicatePage.displayName || duplicatePage.url}" is already being tracked</span>
              {duplicatePage.currentResults !== null && duplicatePage.currentResults !== undefined && (
                <span className="text-amber-600 dark:text-amber-300 font-medium"> ({duplicatePage.currentResults} active ads)</span>
              )}.
              <p className="text-slate-500 dark:text-slate-400 text-[11px] mt-0.5">
                {isStaff
                  ? "This page is already monitored in this workspace. You may add it anyway as a separate entry if needed."
                  : "Would you like to refresh the existing page or force add a separate entry?"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-amber-200 dark:border-amber-500/20">
            {!isStaff && (
              <button
                onClick={() => handleRefreshExisting()}
                disabled={loading}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all cursor-pointer shadow-xs"
              >
                Refresh Existing Page
              </button>
            )}
            <button
              onClick={() => handleSubmit(undefined, true)}
              disabled={loading}
              className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium border border-slate-300 dark:border-slate-700 transition-all cursor-pointer"
            >
              Keep Separate / Add Anyway
            </button>
            <button
              onClick={() => {
                setFeedback(null);
                setDuplicatePage(null);
              }}
              className="px-2.5 py-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* General Feedback Messages */}
      {feedback && feedback.type !== "duplicate" && (
        <div
          className={`mt-3 flex items-start space-x-2 text-xs p-3 rounded-lg border ${
            feedback.type === "success"
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20"
              : "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}
    </div>
  );
}
