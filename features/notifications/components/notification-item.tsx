"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ActivityNotification } from "../types";
import { stripEmojis } from "@/lib/utils";
import {
  ExternalLink,
  TrendingUp,
  Eye,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Sparkles,
  RefreshCw,
  Flame,
  Moon,
  Globe,
  Crown,
  Rocket,
  ShoppingBag,
  ChevronRight,
  Truck,
  Info,
} from "lucide-react";

function isValidImageUrl(u?: string | null): boolean {
  if (!u || typeof u !== "string") return false;
  const clean = u.trim();
  if (!clean.startsWith("http://") && !clean.startsWith("https://")) return false;
  if (
    clean.includes("permalink.php") ||
    clean.includes("/posts/") ||
    clean.includes("/story.php") ||
    clean.includes("facebook.com/profile.php")
  ) {
    return false;
  }
  return (
    clean.includes("fbcdn.net") ||
    clean.includes("fbsbx.com") ||
    clean.includes("cloudinary.com") ||
    clean.includes("backblazeb2.com") ||
    clean.includes("supabase.co") ||
    /\.(jpg|jpeg|png|webp|gif)($|\?)/i.test(clean)
  );
}

function formatRelativeTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);

  if (diffSec < 60) return "Just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

function getNotificationIcon(n: ActivityNotification) {
  const type = n.type;
  const isWentDark = n.metadata?.wentDark === true;
  const isMegaBrand =
    n.metadata?.isMegaBrand === true ||
    (typeof n.metadata?.currentResults === "number" && n.metadata.currentResults >= 50);
  const isSurge = n.metadata?.isSurge === true;
  const isDiscovery = n.metadata?.runnerType === "discovery";
  const isProductReextracted =
    n.metadata?.event === "product_re_extracted" ||
    n.title.toLowerCase().startsWith("product re-extracted");
  const isProductAdded =
    n.metadata?.event === "product_added" ||
    n.title.toLowerCase().startsWith("product added");
  const isProductExtractionFailed =
    n.metadata?.event === "product_extraction_failed" ||
    n.title.toLowerCase().startsWith("product extraction failed");

  if (isProductReextracted) {
    return (
      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0 shadow-sm">
        <RefreshCw className="w-4 h-4" />
      </div>
    );
  }

  if (isProductAdded) {
    return (
      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0 shadow-sm">
        <ShoppingBag className="w-4 h-4" />
      </div>
    );
  }

  if (isProductExtractionFailed) {
    return (
      <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 flex items-center justify-center shrink-0 shadow-sm">
        <AlertCircle className="w-4 h-4" />
      </div>
    );
  }

  if (type === "supplier_album_drop") {
    return (
      <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center justify-center shrink-0 shadow-sm">
        <Truck className="w-4 h-4" />
      </div>
    );
  }

  if (type === "breakout_alert") {
    return (
      <div className="w-8 h-8 rounded-lg bg-rose-500/15 text-rose-500 border border-rose-500/20 flex items-center justify-center shrink-0 shadow-sm">
        <Rocket className="w-4 h-4 text-rose-500" />
      </div>
    );
  }

  if (isWentDark) {
    return (
      <div className="w-8 h-8 rounded-lg bg-rose-500/15 text-rose-500 border border-rose-500/30 flex items-center justify-center shrink-0 shadow-sm animate-pulse">
        <Moon className="w-4 h-4" />
      </div>
    );
  }
  if (isMegaBrand) {
    return (
      <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/35 flex items-center justify-center shrink-0 shadow-sm">
        <Crown className="w-4 h-4" />
      </div>
    );
  }
  if (isSurge) {
    return (
      <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-500 border border-amber-500/30 flex items-center justify-center shrink-0 shadow-sm">
        <Flame className="w-4 h-4" />
      </div>
    );
  }
  if (isDiscovery) {
    return (
      <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/25 flex items-center justify-center shrink-0 shadow-sm">
        <Globe className="w-4 h-4" />
      </div>
    );
  }
  if (type === "batch_summary") {
    return (
      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 flex items-center justify-center shrink-0 shadow-sm">
        <Sparkles className="w-4 h-4" />
      </div>
    );
  }
  if (type === "count_scan") {
    return (
      <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center justify-center shrink-0">
        <TrendingUp className="w-4 h-4" />
      </div>
    );
  }
  if (type === "ad_spy") {
    return (
      <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 flex items-center justify-center shrink-0">
        <Eye className="w-4 h-4" />
      </div>
    );
  }
  if (type === "page_merged") {
    return (
      <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center justify-center shrink-0">
        <CheckCircle2 className="w-4 h-4" />
      </div>
    );
  }
  if (type === "multi_page_detected") {
    return (
      <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center justify-center shrink-0">
        <AlertTriangle className="w-4 h-4" />
      </div>
    );
  }
  if (type === "domain_portfolio_linked") {
    return (
      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0">
        <Globe className="w-4 h-4" />
      </div>
    );
  }
  if (n.severity === "success") {
    return (
      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0 shadow-sm">
        <CheckCircle2 className="w-4 h-4" />
      </div>
    );
  }
  if (n.severity === "warning") {
    return (
      <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center justify-center shrink-0 shadow-sm">
        <AlertTriangle className="w-4 h-4" />
      </div>
    );
  }
  if (n.severity === "info") {
    return (
      <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center justify-center shrink-0 shadow-sm">
        <Info className="w-4 h-4" />
      </div>
    );
  }
  return (
    <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 flex items-center justify-center shrink-0 shadow-sm">
      <AlertCircle className="w-4 h-4" />
    </div>
  );
}

interface NotificationItemProps {
  notification: ActivityNotification;
  onMarkRead: (id: string) => void;
  onCloseDropdown: () => void;
  onOpenResolveModal?: (trackedPageId: string) => void;
}

export function NotificationItem({
  notification: n,
  onMarkRead,
  onCloseDropdown,
  onOpenResolveModal,
}: NotificationItemProps) {
  const router = useRouter();

  const movers = (n.metadata?.movers as any[]) || [];
  const topBrands = (n.metadata?.topBrands as any[]) || [];
  const isBreakout = n.type === "breakout_alert";
  const isSupplierDrop = n.type === "supplier_album_drop";
  const dropPreviewImages = (n.metadata?.previewImages as string[]) || [];
  const isWentDark = n.metadata?.wentDark === true;
  const isMegaBrand =
    n.metadata?.isMegaBrand === true ||
    (typeof n.metadata?.currentResults === "number" && n.metadata.currentResults >= 50);
  const isSurge = n.metadata?.isSurge === true;
  const isQueued = n.metadata?.queuedForLocalScan === true;
  const newProductsCount = (n.metadata?.newProductsCount as number) || 0;
  const isProductReextracted =
    n.metadata?.event === "product_re_extracted" ||
    n.title.toLowerCase().startsWith("product re-extracted");
  const isProductAdded =
    n.metadata?.event === "product_added" ||
    n.title.toLowerCase().startsWith("product added");
  const isProductExtractionFailed =
    n.metadata?.event === "product_extraction_failed" ||
    n.title.toLowerCase().startsWith("product extraction failed");

  const handleClick = () => {
    if (!n.isRead) onMarkRead(n.id);
    if (n.type === "multi_page_detected" && n.trackedPageId) {
      onCloseDropdown();
      if (onOpenResolveModal) {
        onOpenResolveModal(n.trackedPageId);
      } else {
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("open-resolve-modal", { detail: n.trackedPageId })
          );
        }
        router.push(n.actionUrl || `/?resolveModal=${n.trackedPageId}`);
      }
    } else if (n.actionUrl) {
      onCloseDropdown();
      router.push(n.actionUrl);
    }
  };

  return (
    <div
      onClick={handleClick}
      className={`relative py-2.5 px-3.5 flex items-start space-x-3 transition-all cursor-pointer group active:scale-[0.99] ${
        n.isRead
          ? "bg-transparent hover:bg-slate-100/70 dark:hover:bg-slate-800/50 opacity-75 hover:opacity-100"
          : isSupplierDrop
          ? "bg-indigo-500/[0.04] dark:bg-indigo-500/[0.07] hover:bg-indigo-500/[0.1] dark:hover:bg-indigo-500/[0.14]"
          : isBreakout
          ? "bg-gradient-to-r from-rose-500/[0.08] via-pink-500/[0.06] to-amber-500/[0.08] hover:from-rose-500/[0.14] hover:to-amber-500/[0.14]"
          : isWentDark
          ? "bg-rose-500/[0.06] dark:bg-rose-500/[0.1] hover:bg-rose-500/[0.12]"
          : isMegaBrand
          ? "bg-purple-500/[0.08] dark:bg-purple-500/[0.14] hover:bg-purple-500/[0.15]"
          : isSurge
          ? "bg-amber-500/[0.06] dark:bg-amber-500/[0.1] hover:bg-amber-500/[0.12]"
          : isQueued
          ? "bg-emerald-500/[0.05] dark:bg-emerald-500/[0.08] hover:bg-emerald-500/[0.12]"
          : isProductReextracted || isProductAdded
          ? "bg-emerald-500/[0.04] dark:bg-emerald-500/[0.07] hover:bg-emerald-500/[0.1] dark:hover:bg-emerald-500/[0.14]"
          : isProductExtractionFailed
          ? "bg-rose-500/[0.05] dark:bg-rose-500/[0.08] hover:bg-rose-500/[0.12]"
          : "bg-indigo-500/[0.04] dark:bg-indigo-500/[0.07] hover:bg-indigo-500/[0.1] dark:hover:bg-indigo-500/[0.15]"
      }`}
    >
      {getNotificationIcon(n)}

      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 truncate">
            <h4
              className={`text-xs font-bold truncate transition-colors ${
                n.isRead
                  ? "text-slate-700 dark:text-slate-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400"
                  : "text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400"
              }`}
              dir="auto"
            >
              <bdi>{stripEmojis(n.title)}</bdi>
            </h4>
            {isProductReextracted && (
              <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 shrink-0 border border-emerald-500/30 inline-flex items-center gap-1">
                <RefreshCw className="w-2.5 h-2.5 shrink-0" />
                <span>UPDATED</span>
              </span>
            )}
            {isProductAdded && (
              <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 shrink-0 border border-emerald-500/30 inline-flex items-center gap-1">
                <ShoppingBag className="w-2.5 h-2.5 shrink-0" />
                <span>NEW</span>
              </span>
            )}
            {isProductExtractionFailed && (
              <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-rose-500/20 text-rose-600 dark:text-rose-400 shrink-0 border border-rose-500/30 inline-flex items-center gap-1">
                <AlertCircle className="w-2.5 h-2.5 shrink-0" />
                <span>FAILED</span>
              </span>
            )}
            {isSupplierDrop && (
              <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 shrink-0 border border-indigo-500/30 inline-flex items-center gap-1">
                <Truck className="w-2.5 h-2.5 shrink-0" />
                <span>DROP</span>
              </span>
            )}
            {isBreakout && (
              <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-gradient-to-r from-pink-500 to-rose-600 text-white shrink-0 shadow-xs shadow-rose-500/20">
                BREAKOUT
              </span>
            )}
            {newProductsCount > 0 && (
              <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 shrink-0 border border-indigo-500/30 inline-flex items-center gap-1">
                <ShoppingBag className="w-2.5 h-2.5 shrink-0" />
                <span>
                  +{newProductsCount} {newProductsCount === 1 ? "Product" : "Products"}
                </span>
              </span>
            )}
            {isWentDark && (
              <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-rose-500/20 text-rose-600 dark:text-rose-400 shrink-0">
                DARK
              </span>
            )}
            {isMegaBrand && (
              <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-purple-500/20 text-purple-600 dark:text-purple-400 shrink-0 border border-purple-500/30 inline-flex items-center gap-1">
                <Crown className="w-2.5 h-2.5 shrink-0" />
                <span>MEGA 50+</span>
              </span>
            )}
            {isSurge && !isMegaBrand && (
              <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0">
                SURGE
              </span>
            )}
            {isQueued && (
              <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 shrink-0">
                QUEUED ($0)
              </span>
            )}
          </div>
          <span className="text-[10px] text-slate-400 shrink-0 group-hover:text-slate-500 dark:group-hover:text-slate-300 transition-colors">
            {formatRelativeTime(n.createdAt)}
          </span>
        </div>

        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug break-words" dir="auto">
          <bdi>{stripEmojis(n.message)}</bdi>
        </p>

        {/* Supplier Drop Preview Thumbnails */}
        {isSupplierDrop && dropPreviewImages.filter(isValidImageUrl).length > 0 && (
          <div className="flex items-center gap-1.5 pt-1">
            {dropPreviewImages
              .filter(isValidImageUrl)
              .slice(0, 4)
              .map((imgUrl, idx) => (
                <img
                  key={idx}
                  src={imgUrl}
                  alt="Product thumbnail"
                  referrerPolicy="no-referrer"
                  className="w-9 h-9 object-cover rounded-md border border-slate-200 dark:border-slate-800 shrink-0"
                  loading="lazy"
                  onError={(e) => {
                    (e.currentTarget as HTMLElement).style.display = "none";
                  }}
                />
              ))}
          </div>
        )}

        {/* Direct Post Link for Supplier Drop */}
        {isSupplierDrop && n.metadata?.postUrl && (
          <div className="pt-0.5">
            <a
              href={n.metadata.postUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              <span>Open Facebook Post</span>
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </div>
        )}

        {/* Breakout Velocity Indicators */}
        {isBreakout && n.metadata && (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
              {n.metadata.prevDuplication ?? 1} ➔ {n.metadata.currentDuplication} Copies
            </span>
            {n.metadata.winnerScore && (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                Score {n.metadata.winnerScore}/100
              </span>
            )}
            {typeof n.metadata.daysRunning === "number" && (
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                • Launched {n.metadata.daysRunning === 0 ? "today" : `${n.metadata.daysRunning}d ago`}
              </span>
            )}
          </div>
        )}

        {/* Movers Pills for Batch Count Summaries */}
        {n.type === "batch_summary" && movers.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {movers.slice(0, 4).map((m, idx) => {
              const isUuidStr = (s?: string | null) =>
                Boolean(
                  s &&
                    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
                );
              const moverUrl =
                m.pageId && !isUuidStr(m.pageId)
                  ? `/spy/brand/${encodeURIComponent(m.pageId)}`
                  : m.name && !isUuidStr(m.name)
                  ? `/spy/brand/${encodeURIComponent(m.name)}`
                  : `/?search=${encodeURIComponent(m.name || "")}`;
              return (
                <Link
                  key={idx}
                  href={moverUrl}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseDropdown();
                  }}
                  className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/60 text-[10px] font-semibold text-slate-700 dark:text-slate-200 hover:border-indigo-500/40 dark:hover:border-indigo-500/40 transition-colors"
                >
                  <span>{m.name}</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-extrabold">
                    +{m.extractedCount || m.diff || 1}
                  </span>
                  {m.newProductsCount && m.newProductsCount > 0 ? (
                    <span className="text-indigo-600 dark:text-indigo-400 font-extrabold text-[9.5px] inline-flex items-center gap-0.5">
                      <ShoppingBag className="w-2.5 h-2.5 shrink-0" />
                      <span>+{m.newProductsCount}</span>
                    </span>
                  ) : null}
                </Link>
              );
            })}
            {movers.length > 4 && (
              <span className="text-[10px] text-slate-400 self-center">
                +{movers.length - 4} more
              </span>
            )}
          </div>
        )}

        {/* Top Discovered Brands for Discovery Summaries */}
        {n.type === "batch_summary" && topBrands.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {topBrands.slice(0, 3).map((b, idx) => (
              <Link
                key={idx}
                href={`/?search=${encodeURIComponent(b.name)}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseDropdown();
                }}
                className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200/80 dark:border-cyan-800/60 text-[10px] font-semibold text-cyan-800 dark:text-cyan-200 hover:border-cyan-500 transition-colors"
              >
                <span>{b.name}</span>
                <span className="text-cyan-600 dark:text-cyan-400 font-bold">
                  {b.adCount} ads
                </span>
              </Link>
            ))}
          </div>
        )}

        {/* Multi-page conflict hint */}
        {n.type === "multi_page_detected" && n.trackedPageId && (
          <div className="pt-0.5">
            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-bold border border-amber-500/20">
              <span>Select Page</span>
              <ExternalLink className="w-2.5 h-2.5" />
            </span>
          </div>
        )}
      </div>

      {/* Right indicator column: unread dot button and subtle hover chevron */}
      <div className="flex items-center self-center shrink-0 pl-1">
        {!n.isRead && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMarkRead(n.id);
            }}
            title="Mark as read"
            aria-label="Mark as read"
            className="p-1 -m-1 rounded-full hover:bg-indigo-50 dark:hover:bg-indigo-950/60 transition-colors cursor-pointer group/dot flex items-center justify-center mr-1"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 ring-2 ring-white dark:ring-slate-900 shadow-xs group-hover/dot:scale-125 transition-transform" />
          </button>
        )}
        <ChevronRight className="w-3.5 h-3.5 text-slate-400/60 dark:text-slate-500 group-hover:text-indigo-500 dark:group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all opacity-0 group-hover:opacity-100" />
      </div>
    </div>
  );
}

