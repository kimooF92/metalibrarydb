"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import Link from "next/link";
import { CheckCircle2, AlertTriangle, Info, X, ExternalLink, Sparkles, ShoppingBag } from "lucide-react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastOptions {
  type: ToastType;
  title: string;
  message?: string;
  link?: string;
  linkLabel?: string;
  duration?: number;
}

interface ToastContextType {
  showToast: (options: ToastOptions) => void;
  hideToast: (id: string) => void;
}

interface ToastItem extends ToastOptions {
  id: string;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const hideToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((options: ToastOptions) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast: ToastItem = { ...options, id };

    setToasts((prev) => [...prev.slice(-3), newToast]); // Keep max 4 toasts

    const duration = options.duration || 4500;
    setTimeout(() => {
      hideToast(id);
    }, duration);
  }, [hideToast]);

  return (
    <ToastContext.Provider value={{ showToast, hideToast }}>
      {children}

      {/* Toast Container */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl border shadow-xl backdrop-blur-md transition-all duration-300 animate-in slide-in-from-bottom-5 fade-in ${
              toast.type === "success"
                ? "bg-slate-900/95 border-emerald-500/40 text-slate-100 shadow-emerald-950/30"
                : toast.type === "error"
                ? "bg-slate-900/95 border-rose-500/40 text-slate-100 shadow-rose-950/30"
                : toast.type === "warning"
                ? "bg-slate-900/95 border-amber-500/40 text-slate-100 shadow-amber-950/30"
                : "bg-slate-900/95 border-indigo-500/40 text-slate-100 shadow-indigo-950/30"
            }`}
          >
            {/* Icon */}
            <div className="shrink-0 mt-0.5">
              {toast.type === "success" ? (
                <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              ) : toast.type === "error" ? (
                <div className="w-7 h-7 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4" />
                </div>
              ) : toast.type === "warning" ? (
                <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4" />
                </div>
              ) : (
                <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </div>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-bold text-white leading-tight">
                {toast.title}
              </h4>
              {toast.message && (
                <p className="text-[11px] text-slate-300 mt-1 leading-relaxed line-clamp-3">
                  {toast.message}
                </p>
              )}
              {toast.link && (
                <Link
                  href={toast.link}
                  onClick={() => hideToast(toast.id)}
                  className="inline-flex items-center gap-1 mt-2 text-[11px] font-bold text-indigo-400 hover:text-indigo-300 hover:underline"
                >
                  <span>{toast.linkLabel || "View in Products Hub"}</span>
                  <ExternalLink className="w-3 h-3" />
                </Link>
              )}
            </div>

            {/* Close Button */}
            <button
              onClick={() => hideToast(toast.id)}
              className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
