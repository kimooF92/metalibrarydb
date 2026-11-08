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
    <div className="group relative flex flex-col justify-between rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 p-4 shadow-sm transition-all hover:border-slate-300 dark:hover:border-slate-700/80 hover:shadow-md">
      {/* Top Section */}
      <div>
        {/* Brand Name & Status Badges */}
        <AdCardHeader
          ad={currentAd}
          isArchived={actionsConfig.isArchived}
          onExcludeBrand={onExcludeBrand}
        />

        {/* High-Signal Intelligence Pills & Launch Date Metadata */}
        <AdCardSignals
          ad={currentAd}
          showScoreTooltip={showScoreTooltip}
          onToggleScoreTooltip={() => setShowScoreTooltip((prev) => !prev)}
          onOpenClusterModal={() => setIsClusterModalOpen(true)}
          onOpenCreativeClusterModal={() => setIsCreativeClusterModalOpen(true)}
        />

        {/* Media Container with Ambient Blurred Background & Hover Video */}
        <AdCardMedia
          config={mediaConfig}
          videoRef={videoRef}
          onOpenPreview={openPreview}
          onImageError={handleImageError}
          onVideoError={() => {
            setVideoError(true);
            setIsPlayingVideo(false);
          }}
          onPlayingVideoChange={setIsPlayingVideo}
          onPrevSlide={(e) => {
            e.stopPropagation();
            setCarouselIndex((prev) =>
              prev > 0 ? prev - 1 : previewImages.length - 1
            );
          }}
          onNextSlide={(e) => {
            e.stopPropagation();
            setCarouselIndex((prev) => (prev + 1) % previewImages.length);
          }}
        />

        {/* Extracted Product Info Pill */}
        <AdCardProduct product={extractedProduct} />

        {/* Ad Title & Copy Clamp */}
        <AdCardCopy
          title={currentAd.title}
          caption={currentAd.caption}
          isExpanded={isExpanded}
          onToggleExpand={() => setIsExpanded((prev) => !prev)}
        />
      </div>

      {/* Two-Tier Footer Actions */}
      <AdCardFooter
        config={actionsConfig}
        onFetchProduct={handleFetchProduct}
        onRefreshMedia={handleRefreshMedia}
        onToggleArchive={toggleArchive}
      />

      {/* Image / Video Preview Modal */}
      <ImagePreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        imageUrls={previewImages}
        videoUrl={canPlayVideo ? firstVideoUrl : null}
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

