"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ActivityNotification } from "../types";
import { stripEmojis } from "@/lib/utils";
import {
  ExternalLink,
  TrendingUp,
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
  PauseCircle,
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

interface ParsedNotification {
  brandName: string;
  initials: string;
  badgeLabel: string;
  badgeClass: string;
  avatarBg: string;
  IconComponent: React.ComponentType<{ className?: string }>;
  headline: string;
  bodyText: string;
  category: "product" | "scaling" | "error" | "alert" | "summary" | "drop";
}

function parseNotification(n: ActivityNotification): ParsedNotification {
  const meta = n.metadata || {};
  const rawTitle = stripEmojis(n.title).trim();
  const rawMessage = stripEmojis(n.message).trim();

  // Event detections
  const isProductAdded =
    meta.category === "product" ||
    meta.event === "product_added" ||
    (typeof meta.newProductsCount === "number" && meta.newProductsCount > 0) ||
    rawTitle.toLowerCase().includes("product added") ||
    rawTitle.toLowerCase().includes("new products added");

  const isProductUpdated =
    meta.event === "product_re_extracted" ||
    rawTitle.toLowerCase().includes("product re-extracted") ||
    rawTitle.toLowerCase().includes("product updated");

  const isProductError =
    meta.event === "product_extraction_failed" ||
    rawTitle.toLowerCase().includes("product extraction failed");

  const isBreakout = n.type === "breakout_alert" || meta.isBreakout === true;
  const isMegaBrand =
    meta.isMegaBrand === true ||
    (typeof meta.currentResults === "number" && meta.currentResults >= 50) ||
    rawTitle.toLowerCase().includes("large brand scaling");
  const isSurge =
    meta.isSurge === true ||
    (typeof meta.difference === "number" && meta.difference >= 5) ||
    rawTitle.toLowerCase().includes("scaling up") ||
    rawTitle.toLowerCase().includes("scaling surge");

  const isWentDark =
    meta.wentDark === true ||
    rawTitle.toLowerCase().includes("all ads stopped") ||
    rawTitle.toLowerCase().includes("went dark");
  const isPaused =
    meta.isOnHold === true ||
    rawTitle.toLowerCase().includes("ads inactive");
  const isResumed =
    meta.isRelaunch === true ||
    rawTitle.toLowerCase().includes("ads resumed");
  const isConflict = n.type === "multi_page_detected";
  const isSupplierDrop = n.type === "supplier_album_drop";
  const isSummary = n.type === "batch_summary";
  const isError =
    n.severity === "error" ||
    isProductError ||
    rawTitle.toLowerCase().includes("failed") ||
    rawTitle.toLowerCase().includes("incomplete");

  // Resolve Brand Name prominently
  let brandName = "";

  if (meta.brandName && typeof meta.brandName === "string" && meta.brandName.trim()) {
    brandName = meta.brandName.trim();
  } else if (meta.supplierName && typeof meta.supplierName === "string" && meta.supplierName.trim()) {
    brandName = meta.supplierName.trim();
  } else if (meta.domainName && typeof meta.domainName === "string" && meta.domainName.trim()) {
    brandName = meta.domainName.trim();
  } else if (isSummary) {
    brandName = meta.runnerType === "discovery" ? "Brand Discovery" : "Catalog Sync";
  } else {
    // Parse from title by stripping standard prefixes
    const colonParts = rawTitle.split(":");
    if (colonParts.length >= 2) {
      const prefix = colonParts[0].trim().toLowerCase();
      const after = colonParts.slice(1).join(":").trim();
      const knownActionPrefixes = [
        "scaling up", "large brand scaling", "new ads added", "new ads & products",
        "new products added", "ads inactive", "ads resumed", "all ads stopped",
        "breakout winner", "product extraction failed", "product re-extracted",
        "product added", "count check incomplete", "brand linked", "multiple pages found",
        "brands grouped", "ad fetch failed", "ad fetch incomplete", "ad fetch delayed",
        "verification incomplete",
      ];
      if (knownActionPrefixes.some((p) => prefix.startsWith(p))) {
        brandName = after;
      } else {
        brandName = colonParts[0].trim();
      }
    } else {
      brandName = rawTitle;
    }
  }

  // Clean brand name: remove (+10 Ads), URLs protocol prefixes
  brandName = brandName
    .replace(/\(\+?[0-9]+\s*(ads?)?\)/gi, "")
    .replace(/\(\s*\)/g, "")
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .trim();

  if (!brandName) brandName = "Tracked Brand";

  // Derive 2-letter Initials for Brand Chip
  const cleanTokens = brandName.split(/[\s.\-_]+/).filter(Boolean);
  let initials = "BR";
  if (cleanTokens.length >= 2) {
    initials = (cleanTokens[0][0] + cleanTokens[1][0]).toUpperCase();
  } else if (cleanTokens.length === 1 && cleanTokens[0].length >= 2) {
    initials = cleanTokens[0].slice(0, 2).toUpperCase();
  } else if (cleanTokens.length === 1) {
    initials = cleanTokens[0][0].toUpperCase();
  }

  // Determine Category, Badge, and Theme Colors
  if (isProductAdded || isProductUpdated) {
    const count = meta.newProductsCount || 1;
    const badgeLabel = isProductUpdated
      ? "Updated"
      : `+${count} Product${count === 1 ? "" : "s"}`;

    return {
      brandName,
      initials,
      badgeLabel,
      badgeClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
      avatarBg: "bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-emerald-500/20",
      IconComponent: isProductUpdated ? RefreshCw : ShoppingBag,
      headline: brandName,
      bodyText: rawMessage,
      category: "product",
    };
  }

  if (isBreakout) {
    return {
      brandName,
      initials,
      badgeLabel: "Breakout",
      badgeClass: "bg-gradient-to-r from-pink-500/20 via-rose-500/20 to-amber-500/20 text-rose-600 dark:text-rose-400 border-rose-500/30 font-black",
      avatarBg: "bg-gradient-to-br from-rose-500 via-pink-600 to-amber-500 text-white shadow-rose-500/25",
      IconComponent: Rocket,
      headline: brandName,
      bodyText: rawMessage,
      category: "scaling",
    };
  }

  if (isMegaBrand) {
    return {
      brandName,
      initials,
      badgeLabel: "Mega 50+",
      badgeClass: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30 font-black",
      avatarBg: "bg-gradient-to-br from-purple-500 to-indigo-600 text-white shadow-purple-500/20",
      IconComponent: Crown,
      headline: brandName,
      bodyText: rawMessage,
      category: "scaling",
    };
  }

  if (isSurge) {
    const diff = meta.difference ? ` (+${meta.difference})` : "";
    return {
      brandName,
      initials,
      badgeLabel: `Surge${diff}`,
      badgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 font-black",
      avatarBg: "bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-amber-500/20",
      IconComponent: Flame,
      headline: brandName,
      bodyText: rawMessage,
      category: "scaling",
    };
  }

  if (isResumed) {
    return {
      brandName,
      initials,
      badgeLabel: "Resumed",
      badgeClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30 font-bold",
      avatarBg: "bg-gradient-to-br from-blue-500 to-cyan-600 text-white shadow-blue-500/20",
      IconComponent: TrendingUp,
      headline: brandName,
      bodyText: rawMessage,
      category: "scaling",
    };
  }

  if (isWentDark) {
    return {
      brandName,
      initials,
      badgeLabel: "Ads Stopped",
      badgeClass: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30 font-bold",
      avatarBg: "bg-gradient-to-br from-slate-700 to-rose-700 text-white shadow-rose-500/20",
      IconComponent: Moon,
      headline: brandName,
      bodyText: rawMessage,
      category: "alert",
    };
  }

  if (isPaused) {
    return {
      brandName,
      initials,
      badgeLabel: "Inactive",
      badgeClass: "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30 font-medium",
      avatarBg: "bg-gradient-to-br from-slate-600 to-stone-700 text-white",
      IconComponent: PauseCircle,
      headline: brandName,
      bodyText: rawMessage,
      category: "alert",
    };
  }

  if (isError || isProductError) {
    return {
      brandName,
      initials,
      badgeLabel: "Error",
      badgeClass: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30 font-bold",
      avatarBg: "bg-gradient-to-br from-rose-600 to-red-700 text-white shadow-rose-500/20",
      IconComponent: AlertCircle,
      headline: brandName,
      bodyText: rawMessage,
      category: "error",
    };
  }

  if (isConflict) {
    return {
      brandName,
      initials,
      badgeLabel: "Conflict",
      badgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 font-bold",
      avatarBg: "bg-gradient-to-br from-amber-500 to-yellow-600 text-white shadow-amber-500/20",
      IconComponent: AlertTriangle,
      headline: brandName,
      bodyText: rawMessage,
      category: "alert",
    };
  }

  if (isSupplierDrop) {
    return {
      brandName,
      initials,
      badgeLabel: "Drop",
      badgeClass: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30 font-bold",
      avatarBg: "bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-indigo-500/20",
      IconComponent: Truck,
      headline: brandName,
      bodyText: rawMessage,
      category: "drop",
    };
  }

  if (isSummary) {
    return {
      brandName,
      initials,
      badgeLabel: "Summary",
      badgeClass: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/30 font-bold",
      avatarBg: "bg-gradient-to-br from-cyan-600 to-blue-600 text-white shadow-cyan-500/20",
      IconComponent: Sparkles,
      headline: brandName,
      bodyText: rawMessage,
      category: "summary",
    };
  }

  // Fallback
  return {
    brandName,
    initials,
    badgeLabel: n.severity === "warning" ? "Notice" : "Activity",
    badgeClass: "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/25",
    avatarBg: "bg-gradient-to-br from-indigo-500 to-slate-700 text-white",
    IconComponent: Info,
    headline: brandName,
    bodyText: rawMessage,
    category: "alert",
  };
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
  const parsed = parseNotification(n);

  const [imgError, setImgError] = useState(false);
  const logoUrl = n.brandLogoUrl || (n.metadata as any)?.brandLogoUrl || (n.metadata as any)?.profilePicUrl;
  const hasValidLogo = !imgError && isValidImageUrl(logoUrl);

  const movers = (n.metadata?.movers as any[]) || [];
  const topBrands = (n.metadata?.topBrands as any[]) || [];
  const dropPreviewImages = (n.metadata?.previewImages as string[]) || [];

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

  const Icon = parsed.IconComponent;

  return (
    <div
      onClick={handleClick}
      className={`relative p-3.5 flex items-start gap-3 transition-colors cursor-pointer group active:scale-[0.99] ${
        n.isRead
          ? "bg-transparent hover:bg-slate-100/70 dark:hover:bg-slate-800/40 opacity-75 hover:opacity-100"
          : "bg-slate-50/60 dark:bg-slate-800/25 hover:bg-slate-100/80 dark:hover:bg-slate-800/60"
      }`}
    >
      {/* Brand Avatar: Official Logo with Monogram Fallback */}
      {hasValidLogo ? (
        <img
          src={logoUrl!}
          alt={parsed.brandName}
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setImgError(true)}
          className="w-9 h-9 rounded-xl object-cover shrink-0 border border-slate-200 dark:border-slate-800 shadow-2xs select-none"
        />
      ) : (
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs shadow-xs tracking-wider border border-white/20 select-none ${parsed.avatarBg}`}
        >
          <span className="leading-none">{parsed.initials}</span>
        </div>
      )}

      {/* Main Content Column */}
      <div className="flex-1 min-w-0 space-y-1">
        {/* Brand Name Header & Badge Row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <h4
              className={`text-xs font-bold truncate transition-colors leading-tight ${
                n.isRead
                  ? "text-slate-700 dark:text-slate-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400"
                  : "text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400"
              }`}
              title={parsed.headline}
              dir="auto"
            >
              <bdi>{parsed.headline}</bdi>
            </h4>

            {/* Event Tag / Badge */}
            <span
              className={`px-1.5 py-0.5 rounded-md text-[9.5px] shrink-0 border inline-flex items-center gap-1 leading-none shadow-2xs ${parsed.badgeClass}`}
            >
              <Icon className="w-2.5 h-2.5 shrink-0" />
              <span>{parsed.badgeLabel}</span>
            </span>
          </div>

          {/* Timestamp */}
          <span className="text-[10px] text-slate-400 shrink-0 font-medium whitespace-nowrap">
            {formatRelativeTime(n.createdAt)}
          </span>
        </div>

        {/* Structured Context Description */}
        <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug break-words" dir="auto">
          <bdi>{parsed.bodyText}</bdi>
        </p>

        {/* Breakout Velocity Indicators */}
        {n.type === "breakout_alert" && n.metadata && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
              {n.metadata.prevDuplication ?? 1} -&gt; {n.metadata.currentDuplication} Copies
            </span>
            {n.metadata.winnerScore && (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                Score {n.metadata.winnerScore}/100
              </span>
            )}
            {typeof n.metadata.daysRunning === "number" && (
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                • {n.metadata.daysRunning === 0 ? "Launched today" : `Active for ${n.metadata.daysRunning}d`}
              </span>
            )}
          </div>
        )}

        {/* Supplier Drop Preview Thumbnails */}
        {n.type === "supplier_album_drop" && dropPreviewImages.filter(isValidImageUrl).length > 0 && (
          <div className="flex items-center gap-1.5 pt-1">
            {dropPreviewImages
              .filter(isValidImageUrl)
              .slice(0, 4)
              .map((imgUrl, idx) => (
                <img
                  key={idx}
                  src={imgUrl}
                  alt="Product preview"
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

        {/* Movers Pills for Batch Count Summaries */}
        {n.type === "batch_summary" && movers.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
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
                  <span className="font-bold">{m.name}</span>
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
              <span className="text-[10px] text-slate-400 self-center font-medium">
                +{movers.length - 4} more
              </span>
            )}
          </div>
        )}

        {/* Top Discovered Brands */}
        {n.type === "batch_summary" && topBrands.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
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

        {/* Multi-page conflict hint button */}
        {n.type === "multi_page_detected" && n.trackedPageId && (
          <div className="pt-1">
            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-bold border border-amber-500/20 hover:bg-amber-500/20 transition-colors">
              <span>Disambiguate Page</span>
              <ExternalLink className="w-2.5 h-2.5" />
            </span>
          </div>
        )}
      </div>

      {/* Right Indicator: Unread Dot Button & Hover Arrow */}
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
