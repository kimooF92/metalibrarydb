"use client";

import { useState } from "react";
import { ScrapedProduct, Ad } from "@/types";
import { useAuth } from "@/components/auth-context";
import { useToast } from "@/components/toast-context";
import {
  ExternalLink,
  Star,
  Edit3,
  Check,
  Copy,
  ChevronDown,
  Bot,
  FileText,
  Boxes,
  Image as ImageIcon,
  MoreHorizontal,
  RotateCw,
  MapPin,
  Trash2,
  Calendar,
  Rocket,
} from "lucide-react";
import { generateAIProductPrompt, generateCleanMarkdown } from "@/components/products/modal/modal-types";
import { formatDiscoveryDate, formatDiscoveryLabel } from "@/lib/format-date";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export interface ModalHeaderActionsHandlers {
  onFavoriteToggle: () => void;
  onStartEdit: () => void;
  onQueueVerify: () => void;
  isQueueingVerify: boolean;
  onRefresh?: () => Promise<void>;
  isRefreshing: boolean;
  onQueueLocalRescan?: () => void;
  isQueueingLocalRescan?: boolean;
  onDelete?: (productId: string) => Promise<void>;
  onClose: () => void;
}

export interface ModalHeaderActionsProps {
  product: ScrapedProduct;
  linkedAds: Ad[];
  supplierUrls: string[];
  allImages: string[];
  metaAdLibraryUrl: string | null;
  handlers: ModalHeaderActionsHandlers;
}

export function ModalHeaderActions({
  product,
  linkedAds,
  supplierUrls,
  allImages,
  metaAdLibraryUrl,
  handlers,
}: ModalHeaderActionsProps) {
  const { isStaff } = useAuth();
  const { showToast } = useToast();

  const [copiedType, setCopiedType] = useState<string | null>(null);

  const isUuid = (s?: string | null) =>
    Boolean(s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s));

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

  const brandTarget =
    (product.brandPageId && !isUuid(product.brandPageId) && product.brandPageId !== "0"
      ? product.brandPageId
      : null) ||
    product.domain ||
    (product.brandName && !isUuid(product.brandName) ? product.brandName : null);

  const displayName = product.brandName || product.domain || "Store";

  return (
    <div className="flex items-center justify-between gap-3 pt-1 border-t border-slate-200/60 dark:border-slate-800/60 min-w-0 flex-wrap sm:flex-nowrap">
      {/* Left: Brand / Domain link & Date */}
      <div className="flex items-center gap-2 min-w-0 text-xs text-slate-500 dark:text-slate-400 truncate">
        {brandTarget ? (
          isStaff ? (
            metaAdLibraryUrl ? (
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
            )
          ) : (
            <a
              href={`/spy/brand/${encodeURIComponent(brandTarget)}?tab=products`}
              className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1 truncate"
              title={`View all products from ${displayName}`}
            >
              <span className="truncate">{displayName}</span>
              <ExternalLink className="w-3 h-3 shrink-0" />
            </a>
          )
        ) : null}

        {/* Date Badge: Discovery & Ad Launch */}
        {(product.createdAt || product.earliestAdDate) && (
          <>
            <span className="text-slate-300 dark:text-slate-700 select-none">•</span>
            <span
              className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 select-none shrink-0"
              title={
                product.createdAt
                  ? product.earliestAdDate
                    ? `${formatDiscoveryLabel(product.createdAt)} • First Ad Launched: ${new Date(
                        product.earliestAdDate
                      ).toLocaleDateString()} (${product.daysRunning || 1}d running)`
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
          onClick={handlers.onFavoriteToggle}
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
            handlers.onStartEdit();
          }}
          className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xs transition-all cursor-pointer"
          title="Edit Product Details, Prices, Links & Taxonomy"
        >
          <Edit3 className="w-3.5 h-3.5" />
        </button>

        {/* 1-Click Copy Dropdown (shadcn DropdownMenu) */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xs transition-all cursor-pointer outline-none"
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
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" side="bottom" sideOffset={4} className="w-64 p-1">
            <div className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-800 text-[10px] uppercase font-bold text-slate-400">
              1-Click Content Export
            </div>
            <DropdownMenuItem
              onClick={() => handleCopy("ai")}
              className="px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-start gap-2"
            >
              <Bot className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-slate-900 dark:text-slate-100">Full AI Prompt Pack</div>
                <div className="text-[10px] text-slate-400">
                  Ready for ChatGPT/Claude (Hooks, Description, Video Scripts)
                </div>
              </div>
            </DropdownMenuItem>

            <DropdownMenuItem
              onClick={() => handleCopy("markdown")}
              className="px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-start gap-2"
            >
              <FileText className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-slate-900 dark:text-slate-100">Clean Specs & Offers</div>
                <div className="text-[10px] text-slate-400">Markdown format for store builders</div>
              </div>
            </DropdownMenuItem>

            <DropdownMenuItem
              onClick={() => handleCopy("images")}
              className="px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-start gap-2"
            >
              <ImageIcon className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-slate-900 dark:text-slate-100">All Image URLs Only</div>
                <div className="text-[10px] text-slate-400">{allImages.length} high-res photo links</div>
              </div>
            </DropdownMenuItem>

            {supplierUrls.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => handleCopy("suppliers")}
                  className="px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-start gap-2"
                >
                  <Boxes className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-slate-900 dark:text-slate-100">Supplier URLs Only</div>
                    <div className="text-[10px] text-slate-400">
                      {supplierUrls.length} sourcing link{supplierUrls.length === 1 ? "" : "s"}
                    </div>
                  </div>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

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

        {/* More Actions Dropdown (shadcn DropdownMenu) */}
        {!isStaff && (
          <DropdownMenu>
            <DropdownMenuTrigger
              className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer outline-none"
              title="More actions (Recheck Ads, Re-scrape, Delete)"
            >
              <MoreHorizontal className="w-4 h-4" />
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" side="bottom" sideOffset={4} className="w-60 p-1">
              <div className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-800 text-[10px] uppercase font-bold text-slate-400">
                Product Operations
              </div>

              {/* Recheck Ads */}
              <DropdownMenuItem
                onClick={() => handlers.onQueueVerify()}
                disabled={handlers.isQueueingVerify}
                className="px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-2"
              >
                <RotateCw
                  className={`w-3.5 h-3.5 text-indigo-500 ${
                    handlers.isQueueingVerify ? "animate-spin" : ""
                  }`}
                />
                <div>
                  <div className="font-semibold text-slate-900 dark:text-slate-100">Recheck Linked Ads</div>
                  <div className="text-[10px] text-slate-400">Live on-demand status & media check</div>
                </div>
              </DropdownMenuItem>

              {/* Re-scrape Store Data */}
              {handlers.onRefresh && (
                <DropdownMenuItem
                  onClick={() => handlers.onRefresh?.()}
                  disabled={handlers.isRefreshing}
                  className="px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-2"
                >
                  <RotateCw
                    className={`w-3.5 h-3.5 text-purple-500 ${
                      handlers.isRefreshing ? "animate-spin" : ""
                    }`}
                  />
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      Re-scrape Store Page
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Re-fetches price, offers, images, and arbitrates category
                    </div>
                  </div>
                </DropdownMenuItem>
              )}

              {/* Queue Local Price Extraction */}
              {handlers.onQueueLocalRescan && product.url && (
                <DropdownMenuItem
                  onClick={() => handlers.onQueueLocalRescan?.()}
                  disabled={handlers.isQueueingLocalRescan || product.scrapeStatus === "pending"}
                  className="px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 hover:text-emerald-600 dark:hover:text-emerald-400 flex items-center gap-2"
                >
                  <MapPin
                    className={`w-3.5 h-3.5 text-emerald-500 shrink-0 ${
                      handlers.isQueueingLocalRescan ? "animate-spin" : ""
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center justify-between gap-1">
                      <span>Sync Local Price</span>
                      {product.scrapeStatus === "pending" && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold border border-amber-500/20">
                          Pending
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">
                      {product.scrapeStatus === "pending"
                        ? "Awaiting local residential worker"
                        : "Mark pending to extract authentic price"}
                    </div>
                  </div>
                </DropdownMenuItem>
              )}

              {/* Delete Product */}
              {handlers.onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      handlers.onClose();
                      handlers.onDelete?.(product.id);
                    }}
                    className="px-3 py-2 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 hover:text-rose-700 dark:hover:text-rose-300 flex items-center gap-2 data-highlighted:bg-rose-50 dark:data-highlighted:bg-rose-950/60 data-highlighted:text-rose-700 dark:data-highlighted:text-rose-300"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                    <div>
                      <div className="font-semibold">Delete Product</div>
                      <div className="text-[10px] text-rose-400/80">Permanently removes from catalog</div>
                    </div>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}


