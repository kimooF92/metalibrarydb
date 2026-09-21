"use client";

import { useState, useEffect } from "react";
import NextImage from "next/image";
import { ScrapedProduct, Ad } from "@/types";
import { useToast } from "@/components/toast-context";
import {
  Building2,
  ExternalLink,
  ShoppingBag,
  Tag,
  Layers,
  Sparkles,
  Trash2,
  RotateCw,
  Save,
  Image as ImageIcon,
} from "lucide-react";

interface ModalEditFormProps {
  product: ScrapedProduct;
  linkedAds: Ad[];
  onCancelEdit: () => void;
  onProductUpdate?: (updatedProduct: ScrapedProduct) => void;
  onRefreshAds: () => Promise<void>;
  onRefreshProduct?: (productId: string) => Promise<void>;
}

export function ModalEditForm({
  product,
  linkedAds,
  onCancelEdit,
  onProductUpdate,
  onRefreshAds,
  onRefreshProduct,
}: ModalEditFormProps) {
  const { showToast } = useToast();
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [unlinkingAdId, setUnlinkingAdId] = useState<string | null>(null);

  const [editForm, setEditForm] = useState({
    title: product.title || "",
    url: product.url || "",
    mainImageUrl: product.mainImageUrl || "",
    pageId: product.pageId || product.brandPageId || "",
    brandName: product.brandName || "",
    currentPrice: product.currentPrice || "",
    originalPrice: product.originalPrice || "",
    discountOrOffer: product.discountOrOffer || "",
    deliveryCost: product.deliveryCost || "",
    category: product.category || "",
    subCategory: product.subCategory || "",
    storePlatform: product.storePlatform || "",
  });

  useEffect(() => {
    setEditForm({
      title: product.title || "",
      url: product.url || "",
      mainImageUrl: product.mainImageUrl || "",
      pageId: product.pageId || product.brandPageId || "",
      brandName: product.brandName || "",
      currentPrice: product.currentPrice || "",
      originalPrice: product.originalPrice || "",
      discountOrOffer: product.discountOrOffer || "",
      deliveryCost: product.deliveryCost || "",
      category: product.category || "",
      subCategory: product.subCategory || "",
      storePlatform: product.storePlatform || "",
    });
  }, [product]);

  const handleSaveEdit = async () => {
    if (!product?.id || isSavingEdit) return;
    setIsSavingEdit(true);
    try {
      const res = await fetch("/api/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: product.id,
          ...editForm,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast({
          type: "success",
          title: "Saved",
          message: "Product details updated successfully.",
        });
        const updated = {
          ...product,
          ...editForm,
          ...(data.product || {}),
        };
        onProductUpdate?.(updated);
        onCancelEdit();
      } else {
        showToast({
          type: "error",
          title: "Save Failed",
          message: data.error || "Could not save product details",
        });
      }
    } catch (err: any) {
      showToast({
        type: "error",
        title: "Network Error",
        message: err.message || "Failed to update product",
      });
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleUnlinkAd = async (adId: string, adArchiveId: string) => {
    if (!product?.id || unlinkingAdId) return;
    setUnlinkingAdId(adId);
    try {
      const res = await fetch(`/api/products/${product.id}/ads`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adId, adArchiveId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast({
          type: "success",
          title: "Ad Unlinked",
          message: "Ad creative removed from this product.",
        });
        await onRefreshAds();
        onRefreshProduct?.(product.id);
      } else {
        showToast({
          type: "error",
          title: "Error",
          message: data.error || "Could not unlink ad",
        });
      }
    } catch (err: any) {
      showToast({
        type: "error",
        title: "Network Error",
        message: err.message || "Network error unlinking ad",
      });
    } finally {
      setUnlinkingAdId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Section 1: Brand & Meta Ad Library Tracking */}
      <div className="p-4 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200/80 dark:border-indigo-800/80 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-900 dark:text-indigo-200">
              Brand & Meta Ad Library Tracking
            </h4>
          </div>
          {editForm.pageId && (
            <a
              href={`https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&view_all_page_id=${encodeURIComponent(editForm.pageId.trim())}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
            >
              <span>Test Ad Library Link</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
              Meta Ad Library URL / Facebook Page ID
            </label>
            <input
              type="text"
              value={editForm.pageId}
              onChange={(e) => setEditForm((prev) => ({ ...prev, pageId: e.target.value }))}
              placeholder="e.g. 1048291048123 or paste full URL..."
              className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 font-mono"
            />
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
              Brand Name
            </label>
            <input
              type="text"
              value={editForm.brandName}
              onChange={(e) => setEditForm((prev) => ({ ...prev, brandName: e.target.value }))}
              placeholder="e.g. MyBrand TN"
              className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Section 2: Product Identity & Media */}
      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex items-center gap-2">
          <ShoppingBag className="w-4 h-4 text-indigo-500" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
            Product Identity & Media
          </h4>
        </div>

        <div>
          <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
            Product Title
          </label>
          <input
            type="text"
            value={editForm.title}
            onChange={(e) => setEditForm((prev) => ({ ...prev, title: e.target.value }))}
            placeholder="Product title on store..."
            className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 font-semibold"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
              Store Landing Page URL
            </label>
            <input
              type="text"
              value={editForm.url}
              onChange={(e) => setEditForm((prev) => ({ ...prev, url: e.target.value }))}
              placeholder="https://..."
              className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 font-mono text-[11px]"
            />
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
              Main Image URL
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={editForm.mainImageUrl}
                onChange={(e) => setEditForm((prev) => ({ ...prev, mainImageUrl: e.target.value }))}
                placeholder="https://...image.jpg"
                className="flex-1 px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 font-mono text-[11px]"
              />
              {editForm.mainImageUrl && (
                <div className="relative w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden shrink-0 bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  <NextImage
                    src={editForm.mainImageUrl}
                    alt="Preview"
                    fill
                    unoptimized
                    referrerPolicy="no-referrer"
                    className="object-cover"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Section 3: Pricing & Commercial Offers */}
      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex items-center gap-2">
          <Tag className="w-4 h-4 text-emerald-500" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
            Pricing & Commercial Offers
          </h4>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
              Current / Selling Price
            </label>
            <input
              type="text"
              value={editForm.currentPrice}
              onChange={(e) => setEditForm((prev) => ({ ...prev, currentPrice: e.target.value }))}
              placeholder="e.g. 89 DT"
              className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 font-bold"
            />
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
              Original / Regular Price
            </label>
            <input
              type="text"
              value={editForm.originalPrice}
              onChange={(e) => setEditForm((prev) => ({ ...prev, originalPrice: e.target.value }))}
              placeholder="e.g. 149 DT"
              className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
              Discount / Promo Offer
            </label>
            <input
              type="text"
              value={editForm.discountOrOffer}
              onChange={(e) => setEditForm((prev) => ({ ...prev, discountOrOffer: e.target.value }))}
              placeholder="e.g. -40% / 1 Achete 1 Offert"
              className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
              Delivery Fee / Policy
            </label>
            <input
              type="text"
              value={editForm.deliveryCost}
              onChange={(e) => setEditForm((prev) => ({ ...prev, deliveryCost: e.target.value }))}
              placeholder="e.g. Gratuit / 7 DT"
              className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Section 4: Classification & Store Platform */}
      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-purple-500" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
            Classification & Platform
          </h4>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
              Category
            </label>
            <input
              type="text"
              value={editForm.category}
              onChange={(e) => setEditForm((prev) => ({ ...prev, category: e.target.value }))}
              placeholder="e.g. Beaute, Maison..."
              className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
              Sub-Category
            </label>
            <input
              type="text"
              value={editForm.subCategory}
              onChange={(e) => setEditForm((prev) => ({ ...prev, subCategory: e.target.value }))}
              placeholder="e.g. Soins visage..."
              className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
              Store Engine / Platform
            </label>
            <select
              value={editForm.storePlatform}
              onChange={(e) => setEditForm((prev) => ({ ...prev, storePlatform: e.target.value }))}
              className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
            >
              <option value="">Auto-detected / Other</option>
              <option value="youcan">🛍️ YouCan.shop</option>
              <option value="shopify">🟢 Shopify</option>
              <option value="woocommerce">🌐 WooCommerce</option>
              <option value="custom_cod">⚡ Custom COD Form</option>
            </select>
          </div>
        </div>
      </div>

      {/* Section 5: Read-only Linked Meta Ads with Unlink Capability */}
      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-500" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Linked Meta Ad Creatives ({linkedAds.length})
            </h4>
          </div>
          <span className="text-[10px] text-slate-400">
            Use the Ad Creatives tab to link new Meta Ad creatives
          </span>
        </div>

        {linkedAds.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5 pt-2">
            {linkedAds.map((ad: any) => {
              const isAdArchived = Boolean(ad.isArchived || ad.isActive === false);
              const thumb = ad.signedThumbnailUrl || ad.thumbnailUrl || ad.mediaUrls?.[0];
              const isThisUnlinking = unlinkingAdId === ad.id;

              return (
                <div
                  key={ad.id}
                  className="relative group flex flex-col bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs"
                >
                  <div className="relative aspect-square w-full bg-slate-100 dark:bg-slate-950 flex items-center justify-center">
                    {thumb ? (
                      <NextImage
                        src={thumb}
                        alt="Ad"
                        fill
                        unoptimized
                        referrerPolicy="no-referrer"
                        className="object-cover"
                      />
                    ) : (
                      <ImageIcon className="w-5 h-5 text-slate-400" />
                    )}

                    {/* Unlink / Delete Button Overlay */}
                    <button
                      type="button"
                      onClick={() => handleUnlinkAd(ad.id, ad.adArchiveId)}
                      disabled={isThisUnlinking}
                      className="absolute top-1 right-1 z-20 p-1 rounded-md bg-rose-600/90 hover:bg-rose-600 text-white shadow-sm transition-all cursor-pointer opacity-90 hover:opacity-100"
                      title="Unlink this ad from product"
                    >
                      {isThisUnlinking ? (
                        <RotateCw className="w-3 h-3 animate-spin" />
                      ) : (
                        <Trash2 className="w-3 h-3" />
                      )}
                    </button>

                    {/* Status */}
                    <div className="absolute bottom-1 left-1 z-10">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                          isAdArchived
                            ? "bg-rose-950/80 text-rose-300 border border-rose-500/40"
                            : "bg-emerald-950/80 text-emerald-300 border border-emerald-500/40"
                        }`}
                      >
                        {isAdArchived ? "Inactive" : "Active"}
                      </span>
                    </div>
                  </div>

                  <div className="p-1.5 truncate text-[9px] text-slate-500 flex items-center justify-between">
                    <span className="truncate">{ad.pageName || `Page ${ad.pageId}`}</span>
                    <a
                      href={`https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&id=${ad.adArchiveId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-400 hover:text-indigo-600 p-0.5 rounded"
                      title="View in Meta Library"
                    >
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-3 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
            No specific ad creatives attached yet.
          </div>
        )}
      </div>

      {/* Bottom Actions inside Edit Form */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={onCancelEdit}
          disabled={isSavingEdit}
          className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSaveEdit}
          disabled={isSavingEdit}
          className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-50"
        >
          {isSavingEdit ? (
            <RotateCw className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          <span>{isSavingEdit ? "Saving Changes..." : "Save Product Details"}</span>
        </button>
      </div>
    </div>
  );
}
