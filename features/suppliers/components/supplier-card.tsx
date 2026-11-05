"use client";

import { memo } from "react";
import { Supplier } from "@/types";
import {
  ExternalLink,
  MessageCircle,
  Phone,
  Clock,
  Sparkles,
  RefreshCw,
  MoreVertical,
  Check,
  Pause,
  Play,
  Trash2,
  Calendar,
  AlertTriangle,
  Images,
} from "lucide-react";

export interface SupplierCardProps {
  supplier: Supplier;
  isScanning?: boolean;
  onScanNow: (id: string) => void;
  onViewPhotos: (supplier: Supplier) => void;
  onToggleStatus: (id: string, currentStatus: string) => void;
  onMarkAsSeen: (id: string) => void;
  onDelete: (id: string, name: string) => void;
}

export const SupplierCard = memo(function SupplierCard({
  supplier,
  isScanning = false,
  onScanNow,
  onViewPhotos,
  onToggleStatus,
  onMarkAsSeen,
  onDelete,
}: SupplierCardProps) {
  const isDrop = supplier.hasUnseenDrop;
  const isPaused = supplier.status === "paused";
  const isFailed = supplier.lastScrapeStatus === "failed";
  const previews = supplier.previewPhotos || [];

  const formatRelative = (dateStr?: string | null) => {
    if (!dateStr) return "Never";
    const date = new Date(dateStr);
    const diffHours = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60));
    if (diffHours < 1) return "Just now";
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return "Yesterday";
    return `${diffDays}d ago`;
  };

  return (
    <div
      className={`relative rounded-xl border bg-white dark:bg-slate-900 transition-all duration-200 overflow-hidden flex flex-col justify-between ${
        isDrop
          ? "border-fuchsia-500/60 dark:border-fuchsia-500/70 shadow-lg shadow-fuchsia-500/10 ring-1 ring-fuchsia-500/20"
          : "border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700 shadow-xs"
      }`}
    >
      {/* Top Banner when New Drop is Detected */}
      {isDrop && (
        <div className="bg-gradient-to-r from-fuchsia-600 via-purple-600 to-indigo-600 px-3 py-1 text-white flex items-center justify-between text-[11px] font-bold">
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 animate-spin text-amber-300" />
            <span>NEW PRODUCT DROP DETECTED</span>
          </span>
          <button
            onClick={() => onMarkAsSeen(supplier.id)}
            title="Mark drop as seen"
            className="text-[10px] bg-white/20 hover:bg-white/30 px-1.5 py-0.5 rounded transition-colors flex items-center gap-0.5"
          >
            <Check className="w-2.5 h-2.5" /> Mark seen
          </button>
        </div>
      )}

      {/* Card Body */}
      <div className="p-4 space-y-3.5 flex-1">
        {/* Header: Avatar, Name, Status & External Link */}
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Avatar fallback */}
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500/20 to-purple-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 flex items-center justify-center font-bold text-sm shrink-0">
              {supplier.name.slice(0, 2).toUpperCase()}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  {supplier.name}
                </h3>
                {isPaused && (
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 shrink-0">
                    PAUSED
                  </span>
                )}
              </div>
              <a
                href={supplier.facebookUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1 truncate transition-colors"
              >
                <span>View Facebook Page</span>
                <ExternalLink className="w-2.5 h-2.5 shrink-0" />
              </a>
            </div>
          </div>

          {/* Quick Actions (WhatsApp / Phone) */}
          <div className="flex items-center gap-1 shrink-0">
            {supplier.whatsapp && (
              <a
                href={`https://wa.me/${supplier.whatsapp.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                title={`WhatsApp: ${supplier.whatsapp}`}
                className="p-1.5 rounded-md text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border border-emerald-500/20 transition-colors"
              >
                <MessageCircle className="w-3.5 h-3.5" />
              </a>
            )}
            {supplier.phone && (
              <a
                href={`tel:${supplier.phone}`}
                title={`Call: ${supplier.phone}`}
                className="p-1.5 rounded-md text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-colors"
              >
                <Phone className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>

        {/* Cadence & Watermark Badges */}
        <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-50 dark:bg-slate-950/40 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800/60">
          <div>
            <span className="text-slate-400 block text-[10px] font-medium">Last Watchdog Check</span>
            <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
              <Clock className="w-3 h-3 text-slate-400 shrink-0" />
              {formatRelative(supplier.lastCheckedAt)}
            </span>
          </div>

          <div>
            <span className="text-slate-400 block text-[10px] font-medium">Check Schedule</span>
            <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
              <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
              Twice weekly
            </span>
          </div>

          {supplier.lastAlbumTitle && (
            <div className="col-span-2 pt-1 border-t border-slate-100 dark:border-slate-800/60">
              <span className="text-slate-400 block text-[10px] font-medium">Latest Scraped Album</span>
              <span className="font-semibold text-slate-900 dark:text-white truncate block">
                {supplier.lastAlbumTitle} ({supplier.lastAlbumPhotoCount || 0} photos)
              </span>
            </div>
          )}
        </div>

        {/* Scrape Error Warning if any */}
        {isFailed && (
          <div className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-1 rounded border border-amber-500/20 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            <span className="truncate">Last scan failed: {supplier.lastScrapeError || "Timeout"}</span>
          </div>
        )}

        {/* Thumbnail Preview Gallery Strip */}
        {previews.length > 0 ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span>Latest Scraped Photos</span>
              <button
                onClick={() => onViewPhotos(supplier)}
                className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
              >
                Browse All →
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {previews.map((photo, idx) => (
                <div
                  key={photo.id || idx}
                  onClick={() => onViewPhotos(supplier)}
                  className="aspect-square rounded-md overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 relative group cursor-pointer"
                >
                  <img
                    src={photo.photoUrl}
                    alt={photo.caption || "Product photo"}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="py-4 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg text-slate-400 text-xs flex flex-col items-center justify-center space-y-1">
            <Images className="w-5 h-5 opacity-40" />
            <span>No photos scraped yet</span>
          </div>
        )}
      </div>

      {/* Card Footer: Action Buttons */}
      <div className="px-4 py-2.5 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between gap-2">
        <button
          onClick={() => onScanNow(supplier.id)}
          disabled={isScanning || isPaused}
          className="flex-1 py-1.5 px-3 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? "animate-spin" : ""}`} />
          <span>{isScanning ? "Scanning..." : "Check Now"}</span>
        </button>

        <button
          onClick={() => onViewPhotos(supplier)}
          className="py-1.5 px-3 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-colors cursor-pointer"
        >
          Photos
        </button>

        <button
          onClick={() => onToggleStatus(supplier.id, supplier.status)}
          title={isPaused ? "Resume Monitoring" : "Pause Monitoring"}
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-colors cursor-pointer"
        >
          {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
        </button>

        <button
          onClick={() => onDelete(supplier.id, supplier.name)}
          title="Delete Supplier"
          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-slate-200 dark:border-slate-800 transition-colors cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
});

