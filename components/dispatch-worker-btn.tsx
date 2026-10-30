"use client";

import { useState, useRef, useEffect } from "react";
import { Zap, Loader2, ChevronDown, Bot, Eye, ShoppingBag, Star, ExternalLink, CheckCircle2 } from "lucide-react";
import { triggerGithubWorkerAction, TriggerGithubWorkerOptions } from "@/actions/trigger-actions";
import { useToast } from "@/components/toast-context";

interface DispatchWorkerBtnProps {
  variant?: "navbar" | "full" | "icon";
  className?: string;
}

const WORKER_OPTIONS: Array<{
  id: "worker" | "spy" | "scraper" | "favorites";
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}> = [
  {
    id: "worker",
    label: "Ad Count Scanner",
    description: "Scan active ad counts across all tracked brands",
    icon: Zap,
    badge: "Cloud Fleet",
  },
  {
    id: "spy",
    label: "New Ads Scanner",
    description: "Find new creatives for brands scaling up",
    icon: Eye,
    badge: "Fast",
  },
  {
    id: "scraper",
    label: "Product Page Scraper",
    description: "Extract product images, prices, and offers",
    icon: ShoppingBag,
  },
  {
    id: "favorites",
    label: "Check Favorite Ads",
    description: "Verify active status of saved products",
    icon: Star,
  },
];

export function DispatchWorkerBtn({ variant = "navbar", className = "" }: DispatchWorkerBtnProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  const [activeWorker, setActiveWorker] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const handleDispatch = async (target: "worker" | "spy" | "scraper" | "favorites" = "worker") => {
    setIsDispatching(true);
    setActiveWorker(target);
    setIsOpen(false);

    try {
      const res = await triggerGithubWorkerAction({ target });

      if (res.success) {
        showToast({
          type: "success",
          title: `🚀 Background Scan Started!`,
          message: res.message || "Background workers are scanning your tracked brands now.",
          link: "https://github.com/kimooF92/metalibrarydb/actions",
          linkLabel: "View Live Activity",
          duration: 6000,
        });
      } else {
        showToast({
          type: "error",
          title: "Scan Failed to Start",
          message: res.error || "Could not start background scan. Please check your credentials.",
          duration: 6000,
        });
      }
    } catch (err: any) {
      showToast({
        type: "error",
        title: "Scan Error",
        message: err.message || "An unexpected error occurred.",
      });
    } finally {
      setIsDispatching(false);
      setActiveWorker(null);
    }
  };

  if (variant === "full") {
    return (
      <div className={`p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-4 ${className}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <Zap className="w-4 h-4 text-amber-500 fill-amber-500/20" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Cloud Scan Actions</h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Run cloud scans anytime in the background using your GitHub Actions quota.
            </p>
          </div>
          <a
            href="https://github.com/kimooF92/metalibrarydb/actions"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 shrink-0"
          >
            <span>Live Activity</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
          {WORKER_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const isThisRunning = isDispatching && activeWorker === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => handleDispatch(opt.id)}
                disabled={isDispatching}
                className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 hover:border-indigo-300 dark:hover:border-indigo-800 transition-all text-left cursor-pointer disabled:opacity-50 group"
              >
                <div className="flex items-center space-x-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    {isThisRunning ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                    ) : (
                      <Icon className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300 group-hover:text-indigo-500" />
                    )}
                  </div>
                  <div className="truncate">
                    <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {opt.label}
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                      {opt.badge || "Manual Trigger"}
                    </div>
                  </div>
                </div>
                <Zap className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-500 transition-colors shrink-0 ml-2" />
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Default navbar variant (Single, subtle cohesive button)
  return (
    <div className={`relative inline-flex items-center ${className}`} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        disabled={isDispatching}
        title="Run background scans"
        className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-all cursor-pointer shadow-xs select-none ${
          isOpen
            ? "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border-slate-300 dark:border-slate-700"
            : "bg-white/80 dark:bg-slate-900/50 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
        } disabled:opacity-60`}
      >
        {isDispatching ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500 shrink-0" />
        ) : (
          <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500/20 shrink-0" />
        )}
        <span>{isDispatching ? "Starting..." : "Run Scans"}</span>
        <ChevronDown
          className={`w-3 h-3 text-slate-400 transition-transform duration-150 ${
            isOpen ? "rotate-180 text-slate-600 dark:text-slate-200" : ""
          }`}
        />
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <div className="absolute top-full right-0 mt-1.5 w-68 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150 p-1.5 space-y-1">
          <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
            <span>Background Scans</span>
            <span className="text-[9px] lowercase font-mono text-slate-400">Cloud Runners</span>
          </div>

          {WORKER_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const isDefault = opt.id === "worker";
            return (
              <button
                key={opt.id}
                onClick={() => handleDispatch(opt.id)}
                className={`w-full flex items-start space-x-2.5 p-2 rounded-lg text-left transition-all cursor-pointer group ${
                  isDefault
                    ? "hover:bg-amber-500/10 dark:hover:bg-amber-500/10"
                    : "hover:bg-slate-100 dark:hover:bg-slate-800/70"
                }`}
              >
                <div className="p-1.5 rounded-md bg-slate-100 dark:bg-slate-800 group-hover:bg-white dark:group-hover:bg-slate-700 text-slate-600 dark:text-slate-300 group-hover:text-amber-500 mt-0.5 shrink-0 transition-colors shadow-xs">
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors truncate">
                      {opt.label}
                    </span>
                    {opt.badge && (
                      <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-hover:bg-amber-500/20 group-hover:text-amber-600 dark:group-hover:text-amber-300">
                        {opt.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                    {opt.description}
                  </p>
                </div>
              </button>
            );
          })}

          <div className="pt-1 border-t border-slate-100 dark:border-slate-800/80 px-2 py-1">
            <a
              href="https://github.com/kimooF92/metalibrarydb/actions"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center justify-between font-semibold py-0.5"
            >
              <span>View Live Activity</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
