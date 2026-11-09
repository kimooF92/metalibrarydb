"use client";

import type { AdCardProps } from "../types";
import { useAdCardState } from "../hooks/use-ad-card-state";
import {
  AdCardHeader,
  AdCardSignals,
  AdCardMedia,
  AdCardProduct,
  AdCardCopy,
  AdCardFooter,
} from "./card";
import { ImagePreviewModal } from "@/components/spy/image-preview-modal";
import { ProductClusterModal } from "@/components/spy/product-cluster-modal";
import { CreativeClusterModal } from "@/components/spy/creative-cluster-modal";

export function AdCard({
  ad,
  onArchiveToggle,
  onExcludeBrand,
  onMediaRefreshed,
}: AdCardProps) {
  const {
    currentAd,
    isExpanded,
    setIsExpanded,
    videoRef,
    previewImages,
    firstVideoUrl,
    displayThumbnail,
    isVideoAd,
    canPlayVideo,
    destinationUrl,
    targetDomain,
    extractedProduct,
    isClusterModalOpen,
    setIsClusterModalOpen,
    isCreativeClusterModalOpen,
    setIsCreativeClusterModalOpen,
    isPreviewOpen,
    setIsPreviewOpen,
    showScoreTooltip,
    setShowScoreTooltip,
    mediaConfig,
    actionsConfig,
    handleImageError,
    openPreview,
    toggleArchive,
    handleRefreshMedia,
    handleFetchProduct,
    setCarouselIndex,
    setIsPlayingVideo,
    setVideoError,
  } = useAdCardState(ad, onArchiveToggle, onMediaRefreshed);

  return (
    <div
      onClick={openPreview}
      className="group relative flex flex-col justify-between rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 px-3.5 py-[19px] shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:border-slate-300 dark:hover:border-slate-700/80 hover:shadow-lg cursor-pointer"
    >
      {/* Top Section */}
      <div>
        {/* Brand Action Row (Matches ProductCardActions) */}
        <AdCardHeader
          ad={currentAd}
          isArchived={actionsConfig.isArchived}
          isArchiving={actionsConfig.isArchiving}
          isRefreshingMedia={actionsConfig.isRefreshingMedia}
          canPlayVideo={canPlayVideo}
          firstVideoUrl={firstVideoUrl}
          displayThumbnail={displayThumbnail}
          handlers={{
            onToggleArchive: toggleArchive,
            onRefreshMedia: handleRefreshMedia,
            onExcludeBrand,
            onOpenClusterModal: () => setIsClusterModalOpen(true),
            onOpenCreativeClusterModal: () => setIsCreativeClusterModalOpen(true),
          }}
        />

        {/* Media Container with Ambient Blurred Background, Hover Play & Overlaid Badges */}
        <AdCardMedia
          config={mediaConfig}
          videoRef={videoRef}
          handlers={{
            onOpenPreview: openPreview,
            onImageError: handleImageError,
            onVideoError: () => {
              setVideoError(true);
              setIsPlayingVideo(false);
            },
            onPlayingVideoChange: setIsPlayingVideo,
            onPrevSlide: (e) => {
              e.stopPropagation();
              setCarouselIndex((prev) =>
                prev > 0 ? prev - 1 : previewImages.length - 1
              );
            },
            onNextSlide: (e) => {
              e.stopPropagation();
              setCarouselIndex((prev) => (prev + 1) % previewImages.length);
            },
            onSlideChange: (idx) => setCarouselIndex(idx),
            onToggleScoreTooltip: () => setShowScoreTooltip((prev) => !prev),
            onOpenClusterModal: () => setIsClusterModalOpen(true),
            onOpenCreativeClusterModal: () => setIsCreativeClusterModalOpen(true),
          }}
        />

        {/* Winner Score Breakdown Popover (Active when user clicks score badge) */}
        <AdCardSignals
          ad={currentAd}
          showScoreTooltip={showScoreTooltip}
          onToggleScoreTooltip={() => setShowScoreTooltip((prev) => !prev)}
        />

        {/* Ad Title & Copy Clamp */}
        <AdCardCopy
          title={currentAd.title}
          caption={currentAd.caption}
          isExpanded={isExpanded}
          onToggleExpand={() => setIsExpanded((prev) => !prev)}
        />
      </div>

      {/* Bottom Section */}
      <div className="mt-auto">
        {/* Clean Price & External Action Buttons (Matches ProductCardPricing) */}
        <AdCardProduct
          product={extractedProduct}
          adArchiveId={currentAd.adArchiveId}
          destinationUrl={destinationUrl}
          targetDomain={targetDomain}
          isExtractingProduct={actionsConfig.isExtractingProduct}
          onFetchProduct={handleFetchProduct}
        />

        {/* Velocity & Longevity Footer (Matches ProductCardFooter) */}
        <AdCardFooter
          startedRunningOn={currentAd.startedRunningOn}
          firstSeenAt={currentAd.firstSeenAt}
          duplicationCount={currentAd.duplicationCount || 1}
          isActive={currentAd.isActive}
          isArchived={actionsConfig.isArchived}
        />
      </div>

      {/* Image / Video Preview Modal */}
      <ImagePreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        adId={currentAd.id}
        imageUrls={previewImages}
        videoUrl={firstVideoUrl || null}
        fallbackThumbnail={displayThumbnail}
        isVideoAd={isVideoAd}
        title={currentAd.title}
        pageName={currentAd.pageName || `Page ${currentAd.pageId}`}
        pageId={currentAd.pageId}
        caption={currentAd.caption}
        destinationUrl={destinationUrl}
        adArchiveId={currentAd.adArchiveId}
        startedRunningOn={currentAd.startedRunningOn}
        isActive={!actionsConfig.isArchived && currentAd.isActive !== false}
        onRefreshMedia={handleRefreshMedia}
        isRefreshingMedia={actionsConfig.isRefreshingMedia}
      />

      {/* Product Creative Cluster Modal */}
      <ProductClusterModal
        isOpen={isClusterModalOpen}
        onClose={() => setIsClusterModalOpen(false)}
        initialAd={currentAd}
        adId={currentAd.id}
        pageId={currentAd.pageId}
        productKey={currentAd.productKey}
      />

      {/* Visual Creative Saturation & Copycat Modal */}
      <CreativeClusterModal
        isOpen={isCreativeClusterModalOpen}
        onClose={() => setIsCreativeClusterModalOpen(false)}
        initialAd={currentAd}
        adId={currentAd.id}
        clusterKey={currentAd.creativeClusterKey}
        mediaHash={currentAd.mediaHash || undefined}
      />
    </div>
  );
}
