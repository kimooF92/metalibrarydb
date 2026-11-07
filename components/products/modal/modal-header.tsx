"use client";

import { ScrapedProduct, Ad } from "@/types";
import { ModalTab } from "./modal-types";
import { ModalHeaderTitle } from "@/features/products/components/modal/modal-header-title";
import { ModalHeaderActions } from "@/features/products/components/modal/modal-header-actions";

export interface ModalHeaderProps {
  product: ScrapedProduct;
  linkedAds: Ad[];
  supplierUrls: string[];
  allImages: string[];
  isEditMode: boolean;
  isSavingEdit?: boolean;
  onCancelEdit?: () => void;
  onSaveEdit?: () => void;
  onStartEdit: () => void;
  onSwitchTab?: (tab: ModalTab) => void;
  onFavoriteToggle: () => void;
  onQueueVerify: () => void;
  isQueueingVerify: boolean;
  onRefresh?: () => Promise<void>;
  isRefreshing: boolean;
  onQueueLocalRescan?: () => void;
  isQueueingLocalRescan?: boolean;
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
  onQueueLocalRescan,
  isQueueingLocalRescan = false,
  onDelete,
  onClose,
  currentIndex = -1,
  totalCount = 0,
  hasPrev = false,
  hasNext = false,
  onNavigatePrev,
  onNavigateNext,
}: ModalHeaderProps) {
  const isUuid = (s?: string | null) =>
    Boolean(s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s));

  const rawPageId =
    (product.pageId && !isUuid(product.pageId) ? product.pageId : null) ||
    (product.brandPageId && !isUuid(product.brandPageId) && product.brandPageId !== "0"
      ? product.brandPageId
      : null) ||
    (linkedAds[0]?.pageId && !isUuid(linkedAds[0].pageId) ? linkedAds[0].pageId : null);

  const metaAdLibraryUrl = rawPageId
    ? `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&view_all_page_id=${encodeURIComponent(
      rawPageId
    )}`
    : product.brandName && !isUuid(product.brandName)
      ? `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&search_type=page&q=${encodeURIComponent(
        product.brandName
      )}`
      : null;

  const hasCarouselAd = Boolean(
    product.hasCarouselAd || linkedAds.some((a) => a.mediaType === "carousel")
  );

  return (
    <div className="px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 shrink-0 flex flex-col gap-2.5">
      {/* Tier 1: Title, Status/Niche Tags, and Modal Navigation Chrome */}
      <ModalHeaderTitle
        product={product}
        hasCarouselAd={hasCarouselAd}
        onClose={onClose}
        editControls={{
          isEditMode,
          isSavingEdit,
          onCancelEdit,
          onSaveEdit,
        }}
        nav={
          totalCount > 1 && currentIndex >= 0
            ? {
              currentIndex,
              totalCount,
              hasPrev,
              hasNext,
              onNavigatePrev,
              onNavigateNext,
            }
            : undefined
        }
      />

      {/* Tier 2: Product Context (Store & Launch Date) + Action Bar */}
      {!isEditMode && (
        <ModalHeaderActions
          product={product}
          linkedAds={linkedAds}
          supplierUrls={supplierUrls}
          allImages={allImages}
          metaAdLibraryUrl={metaAdLibraryUrl}
          handlers={{
            onFavoriteToggle,
            onStartEdit,
            onQueueVerify,
            isQueueingVerify,
            onRefresh,
            isRefreshing,
            onQueueLocalRescan,
            isQueueingLocalRescan,
            onDelete,
            onClose,
          }}
        />
      )}
    </div>
  );
}
