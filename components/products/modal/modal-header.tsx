"use client";

import { useState, useRef, useEffect } from "react";
import { ScrapedProduct, Ad } from "@/types";
import { useToast } from "@/components/toast-context";
import {
  X,
  ExternalLink,
  ShoppingBag,
  Sparkles,
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
} from "lucide-react";
import { ModalTab, generateAIProductPrompt, generateCleanMarkdown } from "./modal-types";

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
  onSwitchTab,
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
  const { showToast } = useToast();
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [showCopyMenu, setShowCopyMenu] = useState(false);
  const copyMenuRef = useRef<HTMLDivElement>(null);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const actionsMenuRef = useRef<HTMLDivElement>(null);

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
    <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 shrink-0 bg-slate-50 dark:bg-slate-950/40">
      <div className="flex items-center gap-2.5 truncate">
        <ShoppingBag className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
        <div className="truncate">
          {isEditMode ? (
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                ✏️ Editing Product Details
              </span>
              <span className="text-xs text-slate-500 truncate">{product.title}</span>
            </div>
          ) : (
            <>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                {product.title || "Product Landing Page"}
              </h2>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {product.brandPageId ? (
                  <a
                    href={`/spy/brand/${encodeURIComponent(product.brandPageId)}?tab=products`}
                    className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline uppercase tracking-wider"
                  >
                    {product.brandName || "Brand"} &rarr;
                  </a>
                ) : product.brandName ? (
                  <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                    {product.brandName}
                  </span>
                ) : null}

                {product.domain && (
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    • {product.domain}
                  </span>
                )}

                {product.url && (
                  <a
                    href={product.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-mono text-indigo-600 dark:text-indigo-400 hover:underline truncate max-w-xs"
                    title={product.url}
                  >
                    <ExternalLink className="w-3 h-3 shrink-0" />
                    <span className="truncate">{product.url}</span>
                  </a>
                )}

                {typeof product.activeAdsCount === "number" && product.activeAdsCount === 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                    ⚫ Inactive / Off-Air
                  </span>
                )}

                {linkedAds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onSwitchTab("ads")}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/80 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 cursor-pointer transition-colors"
                    title="Switch directly to Linked Ad Creatives"
                  >
                    <Sparkles className="w-2.5 h-2.5" />
                    <span>{linkedAds.length} Ad {linkedAds.length === 1 ? "Creative" : "Creatives"}</span>
                    <ChevronDown className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {isEditMode ? (
          <>
            <button
              type="button"
              onClick={onCancelEdit}
              disabled={isSavingEdit}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>Cancel</span>
            </button>
            <button
              type="button"
              onClick={onSaveEdit}
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
          </>
        ) : (
          <>
            {/* Sequential Product Navigation Indicator & Controls */}
            {totalCount > 1 && currentIndex >= 0 && (
              <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800/90 rounded-lg p-0.5 border border-slate-200 dark:border-slate-700/80 shrink-0 mr-1">
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
                  className="text-[10px] font-bold text-slate-600 dark:text-slate-300 px-1.5 select-none whitespace-nowrap"
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
            )}

            {/* Edit Icon-only Button */}
            <button
              type="button"
              onClick={onStartEdit}
              className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xs transition-all cursor-pointer"
              title="Edit Product Details, Prices, Links & Taxonomy"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>

            {/* Star Favorite Toggle */}
            <button
              type="button"
              onClick={onFavoriteToggle}
              className={`p-1.5 rounded-lg border transition-all cursor-pointer shadow-xs ${
                product.isFavorite
                  ? "bg-amber-500 text-slate-950 border-amber-400 font-bold"
                  : "bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:text-amber-500"
              }`}
              title={product.isFavorite ? "Remove from Favorites" : "Add to Favorites"}
            >
              <Star className={`w-3.5 h-3.5 ${product.isFavorite ? "fill-current" : ""}`} />
            </button>

            {/* 1-Click Copy Dropdown */}
            <div className="relative" ref={copyMenuRef}>
              <button
                type="button"
                onClick={() => setShowCopyMenu(!showCopyMenu)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 rounded-lg shadow-sm transition-all cursor-pointer"
                title="Copy Product Pack for AI Copywriting & Store Builders"
              >
                {copiedType ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-300" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-indigo-200" />
                    <span>Copy AI</span>
                    <ChevronDown className="w-3 h-3 text-indigo-200" />
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

            {/* Visit Store Button */}
            {product.url && (
              <a
                href={product.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition-all"
                title="Open Store Landing Page in New Tab"
              >
                <span>Visit</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}

            {/* More Actions Dropdown */}
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
          </>
        )}

        <button
          type="button"
          onClick={onClose}
          className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
