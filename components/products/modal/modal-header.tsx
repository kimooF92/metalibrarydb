"use client";

import { useState, useRef, useEffect } from "react";
import { ScrapedProduct, Ad } from "@/types";
import { useToast } from "@/components/toast-context";
import {
  X,
  ExternalLink,
  ShoppingBag,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RotateCw,
  Trash2,
  Copy,
  Check,
  Bot,
  FileText,
  Boxes,
  Image as ImageIcon,
  Edit3,
  Star,
  MoreHorizontal,
  Undo2,
  Save,
  Calendar,
  Rocket,
  Tag,
  Layers,
} from "lucide-react";
import { ModalTab, generateAIProductPrompt, generateCleanMarkdown } from "./modal-types";
import { getNicheDisplayLabel, getSubNicheDisplayLabel } from "@/lib/niches-taxonomy";
import { formatDiscoveryDate, formatDiscoveryLabel } from "@/lib/format-date";
import { useAuth } from "@/components/auth-context";

interface ModalHeaderProps {
  product: ScrapedProduct;
  linkedAds: Ad[];
  supplierUrls: string[];
  allImages: string[];
  isEditMode: boolean;
  isSavingEdit?: boolean;
  onCancelEdit?: () => void;
  onSaveEdit?: () => void;
  onStartEdit: () => void;
  onSwitchTab: (tab: ModalTab) => void;
  onFavoriteToggle: () => void;
  onQueueVerify: () => void;
  isQueueingVerify: boolean;
  onRefresh?: () => Promise<void>;
  isRefreshing: boolean;
  onDelete?: (productId: string) => Promise<void>;
  onClose: () => void;
  currentIndex?: number;
  totalCount?: number;
  hasPrev?: boolean;
  hasNext?: boolean;
  onNavigatePrev?: () => void;
  onNavigateNext?: () => void;
}

export function ModalHeader({
  product,
  linkedAds,
  supplierUrls,
  allImages,
  isEditMode,
  isSavingEdit = false,
  onCancelEdit,
  onSaveEdit,
  onStartEdit,
  onFavoriteToggle,
  onQueueVerify,
  isQueueingVerify,
  onRefresh,
  isRefreshing,
  onDelete,
  onClose,
  currentIndex = -1,
  totalCount = 0,
  hasPrev = false,
  hasNext = false,
  onNavigatePrev,
  onNavigateNext,
}: ModalHeaderProps) {
  const { isStaff } = useAuth();
  const { showToast } = useToast();
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [showCopyMenu, setShowCopyMenu] = useState(false);
  const copyMenuRef = useRef<HTMLDivElement>(null);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const actionsMenuRef = useRef<HTMLDivElement>(null);

  const isUuid = (s?: string | null) => Boolean(s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s));
  const rawPageId = (product.pageId && !isUuid(product.pageId) ? product.pageId : null) ||
    (product.brandPageId && !isUuid(product.brandPageId) && product.brandPageId !== "0" ? product.brandPageId : null) ||
    (linkedAds[0]?.pageId && !isUuid(linkedAds[0].pageId) ? linkedAds[0].pageId : null);

  const metaAdLibraryUrl = rawPageId
    ? `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&view_all_page_id=${encodeURIComponent(rawPageId)}`
    : (product.brandName && !isUuid(product.brandName)
      ? `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&search_type=page&q=${encodeURIComponent(product.brandName)}`
      : null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (copyMenuRef.current && !copyMenuRef.current.contains(event.target as Node)) {
        setShowCopyMenu(false);
      }
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(event.target as Node)) {
        setShowActionsMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleCopy = async (type: "ai" | "markdown" | "images" | "suppliers") => {
    let textToCopy = "";
    let label = "";

    if (type === "ai") {
      textToCopy = generateAIProductPrompt(product, linkedAds, supplierUrls, allImages);
      label = "Full AI Copywriting Prompt";
    } else if (type === "markdown") {
      textToCopy = generateCleanMarkdown(product, allImages, supplierUrls);
      label = "Clean Product Specs & Offers";
    } else if (type === "images") {
      textToCopy = allImages.join("\n");
      label = `${allImages.length} Image URL${allImages.length === 1 ? "" : "s"}`;
    } else if (type === "suppliers") {
      textToCopy = supplierUrls.join("\n");
      label = `${supplierUrls.length} Supplier URL${supplierUrls.length === 1 ? "" : "s"}`;
    }

    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedType(type);
      setShowCopyMenu(false);
      showToast({
        type: "success",
        title: "Copied to Clipboard!",
        message: `${label} copied. Ready to paste into ChatGPT, Claude, or your store builder.`,
      });
      setTimeout(() => setCopiedType(null), 2500);
    } catch {
      showToast({
        type: "error",
        title: "Copy Failed",
        message: "Could not access clipboard.",
      });
    }
  };

  return (
    <div className="px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 shrink-0 flex flex-col gap-2.5">
      {/* Tier 1: Title, Status/Niche Tags, and Modal Navigation Chrome */}
      <div className="flex items-center justify-between gap-3 min-w-0">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
            <ShoppingBag className="w-4 h-4" />
          </div>

          {isEditMode ? (
            <div className="flex items-center gap-2 min-w-0">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 shrink-0">
                <Edit3 className="w-3 h-3 text-indigo-500 shrink-0" />
                <span>Editing Product Details</span>
              </span>
              <span className="text-xs text-slate-500 truncate">{product.title}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 min-w-0 flex-wrap sm:flex-nowrap">
              <h2
                className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 truncate"
                title={product.title || "Product Landing Page"}
              >
                {product.title || "Product Landing Page"}
              </h2>

              {/* Status Indicator Dot Tag */}
              {product.brandHoldStatus === "on_hold" ? (
                <span
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border border-amber-200/80 dark:border-amber-800/80 shrink-0"
                  title="Brand account is on pause / hold (under grace period recheck)"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                  <span>Paused</span>
                </span>
              ) : product.brandHoldStatus === "inactive" || (typeof product.activeAdsCount === "number" && product.activeAdsCount === 0) ? (
                <span
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 shrink-0"
                  title="No active ads detected"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
                  <span>Off-Air</span>
                </span>
              ) : (
                <span
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-800/80 shrink-0"
                  title="Active ads running"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
                  <span>Active</span>
                </span>
              )}

              {/* Carousel Ad Format Badge */}
              {(product.hasCarouselAd || linkedAds.some((a) => a.mediaType === "carousel")) && (
                <span
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-400 border border-indigo-200/80 dark:border-indigo-800/80 shrink-0"
                  title="Promoted in Meta Carousel Ad format"
                >
                  <Layers className="w-3 h-3 text-indigo-500 shrink-0" />
                  <span>Carousel Ad</span>
                </span>
              )}

              {/* Category / Niche Badge */}
              {product.category && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700/80 truncate shrink-0 max-w-[220px]"
                  title={`Niche: ${getNicheDisplayLabel(product.category)}${product.subCategory ? ` > ${getSubNicheDisplayLabel(product.subCategory)}` : ""}${product.targetAudience ? ` (${product.targetAudience})` : ""}`}
                >
                  <Tag className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0" />
                  <span className="truncate">{getNicheDisplayLabel(product.category)}</span>
                  {product.subCategory && (
                    <span className="text-slate-400 dark:text-slate-500 font-normal truncate">
                      › {getSubNicheDisplayLabel(product.subCategory)}
                    </span>
                  )}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Top Right: Modal Controls (Nav Pager & Close or Edit Save/Cancel) */}
        <div className="flex items-center gap-2 shrink-0">
          {isEditMode ? (
            <div className="flex items-center gap-2">
              <button
                key="modal-header-cancel-btn"
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onCancelEdit?.();
                }}
                disabled={isSavingEdit}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>Cancel</span>
              </button>
              <button
                key="modal-header-save-btn"
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onSaveEdit?.();
                }}
                disabled={isSavingEdit}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm transition-all cursor-pointer disabled:opacity-50"
              >
                {isSavingEdit ? (
                  <RotateCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>{isSavingEdit ? "Saving..." : "Save Changes"}</span>
              </button>
            </div>
          ) : (
            totalCount > 1 && currentIndex >= 0 && (
              <div key="modal-header-nav-group" className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800/90 rounded-lg p-0.5 border border-slate-200 dark:border-slate-700/80 shrink-0">
                <button
                  type="button"
                  onClick={onNavigatePrev}
                  disabled={!hasPrev}
                  className="p-1 rounded-md text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer transition-colors"
                  title="Previous Product (Arrow Left ←)"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span
                  className="text-[11px] font-bold text-slate-600 dark:text-slate-300 px-1.5 select-none whitespace-nowrap"
                  title="Use ← and → arrow keys to browse products"
                >
                  {currentIndex + 1} / {totalCount}
                </span>
                <button
                  type="button"
                  onClick={onNavigateNext}
                  disabled={!hasNext}
                  className="p-1 rounded-md text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer transition-colors"
                  title="Next Product (Arrow Right →)"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )
          )}

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            title="Close modal (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tier 2: Product Context (Store & Launch Date) + Action Bar */}
      {!isEditMode && (
        <div className="flex items-center justify-between gap-3 pt-1 border-t border-slate-200/60 dark:border-slate-800/60 min-w-0 flex-wrap sm:flex-nowrap">
          {/* Left: Brand / Domain link & Date */}
          <div className="flex items-center gap-2 min-w-0 text-xs text-slate-500 dark:text-slate-400 truncate">
            {(() => {
              const brandTarget = (product.brandPageId && !isUuid(product.brandPageId) && product.brandPageId !== "0")
                ? product.brandPageId
                : (product.domain || (product.brandName && !isUuid(product.brandName) ? product.brandName : null));

              const displayName = product.brandName || product.domain || "Store";

              if (brandTarget) {
                if (isStaff) {
                  return metaAdLibraryUrl ? (
                    <a
                      href={metaAdLibraryUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1 truncate"
                      title="Open brand in Meta Ad Library"
                    >
                      <span className="truncate">{displayName}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  ) : (
                    <span className="font-semibold text-indigo-600 dark:text-indigo-400 truncate">
                      {displayName}
                    </span>
                  );
                }

                return (
                  <a
                    href={`/spy/brand/${encodeURIComponent(brandTarget)}?tab=products`}
                    className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1 truncate"
                    title={`View all products from ${displayName}`}
                  >
                    <span className="truncate">{displayName}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                );
              }

              return null;
            })()}

            {/* Date Badge: Discovery & Ad Launch */}
            {(product.createdAt || product.earliestAdDate) && (
              <>
                <span className="text-slate-300 dark:text-slate-700 select-none">•</span>
                <span
                  className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 select-none shrink-0"
                  title={
                    product.createdAt
                      ? product.earliestAdDate
                        ? `${formatDiscoveryLabel(product.createdAt)} • First Ad Launched: ${new Date(product.earliestAdDate).toLocaleDateString()} (${product.daysRunning || 1}d running)`
                        : formatDiscoveryLabel(product.createdAt)
                      : `First Ad Launched: ${new Date(product.earliestAdDate!).toLocaleDateString()}`
                  }
                >
                  {product.earliestAdDate ? (
                    <Rocket className="w-3 h-3 text-amber-500" />
                  ) : (
                    <Calendar className="w-3 h-3 text-slate-400" />
                  )}
                  <span>
                    {product.createdAt
                      ? `Discovered ${formatDiscoveryDate(product.createdAt)}`
                      : `Launched ${formatDiscoveryDate(product.earliestAdDate)}`}
                  </span>
                </span>
              </>
            )}
          </div>

          {/* Right: Unified Action Toolbar */}
          <div className="flex items-center gap-1.5 shrink-0 ml-auto">
            {/* Star Favorite Toggle */}
            <button
              type="button"
              onClick={onFavoriteToggle}
              className={`p-1.5 rounded-lg border transition-all cursor-pointer shadow-xs ${
                product.isFavorite
                  ? "bg-amber-500 text-slate-950 border-amber-400 font-bold"
                  : "bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:text-amber-500 hover:bg-slate-50 dark:hover:bg-slate-700"
              }`}
              title={product.isFavorite ? "Remove from Favorites" : "Add to Favorites"}
            >
              <Star className={`w-3.5 h-3.5 ${product.isFavorite ? "fill-current" : ""}`} />
            </button>

            {/* Edit Icon Button */}
            <button
              key="modal-header-edit-btn"
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onStartEdit();
              }}
              className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xs transition-all cursor-pointer"
              title="Edit Product Details, Prices, Links & Taxonomy"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>

            {/* 1-Click Copy Dropdown */}
            <div className="relative" ref={copyMenuRef}>
              <button
                type="button"
                onClick={() => setShowCopyMenu(!showCopyMenu)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xs transition-all cursor-pointer"
                title="Copy Product Pack for AI Copywriting & Store Builders"
              >
                {copiedType ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Copy AI</span>
                    <ChevronDown className="w-3 h-3 text-slate-400" />
                  </>
                )}
              </button>

              {/* Copy Menu Dropdown */}
              {showCopyMenu && (
                <div className="absolute right-0 mt-1.5 w-64 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl py-1.5 z-50 animate-in fade-in slide-in-from-top-2">
                  <div className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-800 text-[10px] uppercase font-bold text-slate-400">
                    1-Click Content Export
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy("ai")}
                    className="w-full px-3 py-2 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-start gap-2 transition-colors cursor-pointer"
                  >
                    <Bot className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-slate-900 dark:text-slate-100">Full AI Prompt Pack</div>
                      <div className="text-[10px] text-slate-400">Ready for ChatGPT/Claude (Hooks, Description, Video Scripts)</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCopy("markdown")}
                    className="w-full px-3 py-2 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-start gap-2 transition-colors cursor-pointer"
                  >
                    <FileText className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-slate-900 dark:text-slate-100">Clean Specs & Offers</div>
                      <div className="text-[10px] text-slate-400">Markdown format for store builders</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCopy("images")}
                    className="w-full px-3 py-2 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-start gap-2 transition-colors cursor-pointer"
                  >
                    <ImageIcon className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-slate-900 dark:text-slate-100">All Image URLs Only</div>
                      <div className="text-[10px] text-slate-400">{allImages.length} high-res photo links</div>
                    </div>
                  </button>

                  {supplierUrls.length > 0 && (
                    <button
                      type="button"
                      onClick={() => handleCopy("suppliers")}
                      className="w-full px-3 py-2 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-start gap-2 transition-colors cursor-pointer border-t border-slate-100 dark:border-slate-800"
                    >
                      <Boxes className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold text-slate-900 dark:text-slate-100">Supplier URLs Only</div>
                        <div className="text-[10px] text-slate-400">{supplierUrls.length} sourcing link{supplierUrls.length === 1 ? "" : "s"}</div>
                      </div>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Meta Ad Library Button */}
            {metaAdLibraryUrl && (
              <a
                href={metaAdLibraryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50/70 dark:bg-blue-950/40 hover:bg-blue-100/70 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-800/80 rounded-lg shadow-xs transition-all"
                title="Open brand in Meta Ad Library"
              >
                <span>Meta Ads</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}

            {/* Primary Action: Visit Store Button */}
            {product.url && (
              <a
                href={product.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition-all"
                title="Open Store Landing Page in New Tab"
              >
                <span>Visit Store</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}

            {/* More Actions Dropdown (Admin Only) */}
            {!isStaff && (
              <div className="relative" ref={actionsMenuRef}>
                <button
                  type="button"
                  onClick={() => setShowActionsMenu(!showActionsMenu)}
                  className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                  title="More actions (Recheck Ads, Re-scrape, Delete)"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>

                {showActionsMenu && (
                  <div className="absolute right-0 mt-1.5 w-60 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl py-1.5 z-50 animate-in fade-in slide-in-from-top-2">
                    <div className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-800 text-[10px] uppercase font-bold text-slate-400">
                      Product Operations
                    </div>

                    {/* Recheck Ads */}
                    <button
                      type="button"
                      onClick={() => {
                        setShowActionsMenu(false);
                        onQueueVerify();
                      }}
                      disabled={isQueueingVerify}
                      className="w-full px-3 py-2 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <RotateCw className={`w-3.5 h-3.5 text-indigo-500 ${isQueueingVerify ? "animate-spin" : ""}`} />
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-slate-100">Recheck Linked Ads</div>
                        <div className="text-[10px] text-slate-400">Queue for verifier status check</div>
                      </div>
                    </button>

                    {/* Re-scrape Store Data */}
                    {onRefresh && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowActionsMenu(false);
                          onRefresh();
                        }}
                        disabled={isRefreshing}
                        className="w-full px-3 py-2 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <RotateCw className={`w-3.5 h-3.5 text-purple-500 ${isRefreshing ? "animate-spin" : ""}`} />
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-slate-100">Re-scrape Store Page</div>
                          <div className="text-[10px] text-slate-400">Re-fetches price, offers, and images</div>
                        </div>
                      </button>
                    )}

                    {/* Delete Product */}
                    {onDelete && (
                      <div className="border-t border-slate-100 dark:border-slate-800 mt-1 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setShowActionsMenu(false);
                            onClose();
                            onDelete(product.id);
                          }}
                          className="w-full px-3 py-2 text-left text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 flex items-center gap-2 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                          <div>
                            <div className="font-semibold">Delete Product</div>
                            <div className="text-[10px] text-rose-400/80">Permanently removes from catalog</div>
                          </div>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
