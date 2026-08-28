"use client";

import { useState, useEffect, useRef } from "react";
import NextImage from "next/image";
import { ScrapedProduct, Ad } from "@/types";
import { useToast } from "@/components/toast-context";
import {
  X,
  ExternalLink,
  ShoppingBag,
  Sparkles,
  Tag,
  Layers,
  Calendar,
  Clock,
  RotateCw,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Eye,
  Play,
  Image as ImageIcon,
  Globe,
  TrendingUp,
  Percent,
  Copy,
  Check,
  Bot,
  FileText,
  ChevronDown,
  Phone,
  MessageCircle,
  Building2,
  Server,
  Network,
  Radio,
  Truck,
  Star,
  Boxes,
  Link2,
  Plus,
  Edit3,
  Save,
  Undo2,
  MoreHorizontal,
} from "lucide-react";

export function getSupplierPlatformInfo(url: string) {
  try {
    const lowercase = url.toLowerCase();
    if (
      lowercase.includes("facebook.com") ||
      lowercase.includes("fb.com") ||
      lowercase.includes("fb.watch") ||
      lowercase.includes("m.facebook.com")
    ) {
      return {
        name: "Facebook",
        badgeClass: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
        icon: "🌐",
      };
    }
    if (lowercase.includes("instagram.com")) {
      return {
        name: "Instagram",
        badgeClass: "bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/20",
        icon: "📷",
      };
    }

    const host = new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
    return {
      name: host || "Supplier Link",
      badgeClass: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
      icon: "🔗",
    };
  } catch {
    return {
      name: "Supplier Link",
      badgeClass: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
      icon: "🔗",
    };
  }
}

interface ProductDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: ScrapedProduct | null;
  onRefresh?: (productId: string) => Promise<void>;
  onDelete?: (productId: string) => Promise<void>;
  onProductUpdate?: (updatedProduct: ScrapedProduct) => void;
}

export function ProductDetailsModal({
  isOpen,
  onClose,
  product,
  onRefresh,
  onDelete,
  onProductUpdate,
}: ProductDetailsModalProps) {
  const { showToast } = useToast();
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [linkedAds, setLinkedAds] = useState<Ad[]>([]);
  const [loadingAds, setLoadingAds] = useState(false);
  const [network, setNetwork] = useState<any>(null);
  const [loadingNetwork, setLoadingNetwork] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [showCopyMenu, setShowCopyMenu] = useState(false);
  const copyMenuRef = useRef<HTMLDivElement>(null);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const actionsMenuRef = useRef<HTMLDivElement>(null);

  // Supplier URLs State
  const [supplierUrls, setSupplierUrls] = useState<string[]>([]);
  const [newSupplierInput, setNewSupplierInput] = useState("");
  const [isSavingSuppliers, setIsSavingSuppliers] = useState(false);
  const [copiedSupplierIndex, setCopiedSupplierIndex] = useState<number | null>(null);
  const [isQueueingVerify, setIsQueueingVerify] = useState(false);

  // Specific Ad Linking State
  const [newAdInput, setNewAdInput] = useState("");
  const [isLinkingAd, setIsLinkingAd] = useState(false);
  const [unlinkingAdId, setUnlinkingAdId] = useState<string | null>(null);

  const handleLinkAd = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!product?.id || !newAdInput.trim() || isLinkingAd) return;
    setIsLinkingAd(true);
    try {
      const res = await fetch(`/api/products/${product.id}/ads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adUrl: newAdInput.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast({
          type: "success",
          title: "Ad Linked",
          message: data.message || "Specific Meta Ad creative linked to product.",
        });
        setNewAdInput("");
        await fetchLinkedAds(product.id);
        onRefresh?.(product.id);
      } else {
        showToast({
          type: "error",
          title: "Failed to Link Ad",
          message: data.error || "Could not link ad",
        });
      }
    } catch (err: any) {
      showToast({
        type: "error",
        title: "Network Error",
        message: err.message || "Network error linking ad",
      });
    } finally {
      setIsLinkingAd(false);
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
        await fetchLinkedAds(product.id);
        onRefresh?.(product.id);
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

  // Inline Edit Mode State
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    title: "",
    url: "",
    mainImageUrl: "",
    pageId: "",
    brandName: "",
    currentPrice: "",
    originalPrice: "",
    discountOrOffer: "",
    deliveryCost: "",
    category: "",
    subCategory: "",
    storePlatform: "",
  });

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
        setIsEditMode(false);
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

  const handleCancelEdit = () => {
    if (product) {
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
    }
    setIsEditMode(false);
  };

  const handleQueueVerify = async () => {
    if (!product?.id || isQueueingVerify) return;
    setIsQueueingVerify(true);
    try {
      const res = await fetch(`/api/products/${product.id}/queue-verify`, {
        method: "POST",
      });
      if (res.ok) {
        showToast({
          type: "success",
          title: "Queued for Scan",
          message: "All linked ads marked as Pending for next scan.",
        });
        await fetchLinkedAds(product.id);
        onRefresh?.(product.id);
      } else {
        showToast({
          type: "error",
          title: "Error",
          message: "Failed to queue product for ad verification",
        });
      }
    } catch (err) {
      console.error("Failed to queue verify:", err);
      showToast({
        type: "error",
        title: "Network Error",
        message: "Network error queueing ad verification",
      });
    } finally {
      setIsQueueingVerify(false);
    }
  };

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

  useEffect(() => {
    if (product) {
      setSelectedImage(product.mainImageUrl || null);
      setSupplierUrls(product.supplierUrls || []);
      setNewSupplierInput("");
      setCopiedSupplierIndex(null);
      setIsEditMode(false);
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
      fetchLinkedAds(product.id);
      fetchNetworkIntelligence(product.id);
    }
  }, [product]);

  if (!isOpen || !product) return null;

  async function fetchLinkedAds(productId: string) {
    setLoadingAds(true);
    try {
      const res = await fetch(`/api/spy/ads?productId=${productId}&limit=20`);
      if (res.ok) {
        const data = await res.json();
        setLinkedAds(data.ads || data.items || []);
      }
    } catch (err) {
      console.error("Failed to fetch linked ads:", err);
    } finally {
      setLoadingAds(false);
    }
  }

  async function fetchNetworkIntelligence(productId: string) {
    setLoadingNetwork(true);
    try {
      const res = await fetch(`/api/products/network?productId=${productId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.network) {
          setNetwork(data.network);
        }
      }
    } catch (err) {
      console.error("Failed to fetch network intelligence:", err);
    } finally {
      setLoadingNetwork(false);
    }
  }

  const handleRefresh = async () => {
    if (!onRefresh || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await onRefresh(product.id);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleAddSupplierUrl = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const raw = newSupplierInput.trim();
    if (!raw || isSavingSuppliers) return;

    let formattedUrl = raw;
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = `https://${formattedUrl}`;
    }

    try {
      new URL(formattedUrl);
    } catch {
      showToast({
        type: "error",
        title: "Invalid URL",
        message: "Please enter a valid web address (e.g. https://aliexpress.com/item/...).",
      });
      return;
    }

    if (supplierUrls.includes(formattedUrl)) {
      showToast({
        type: "info",
        title: "Already Added",
        message: "This supplier URL is already in the list.",
      });
      setNewSupplierInput("");
      return;
    }

    const updatedList = [...supplierUrls, formattedUrl];
    setIsSavingSuppliers(true);

    try {
      const res = await fetch("/api/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: product.id,
          supplierUrls: updatedList,
        }),
      });

      if (!res.ok) throw new Error("Failed to save supplier URL");

      setSupplierUrls(updatedList);
      product.supplierUrls = updatedList;
      setNewSupplierInput("");
      onProductUpdate?.({ ...product, supplierUrls: updatedList });

      const platform = getSupplierPlatformInfo(formattedUrl);
      showToast({
        type: "success",
        title: "Supplier Link Added",
        message: `Saved ${platform.name} supplier link to product.`,
      });
    } catch (err: any) {
      showToast({
        type: "error",
        title: "Failed to Add Supplier",
        message: err.message || "Could not save supplier URL.",
      });
    } finally {
      setIsSavingSuppliers(false);
    }
  };

  const handleRemoveSupplierUrl = async (indexToRemove: number) => {
    if (isSavingSuppliers) return;
    const removedUrl = supplierUrls[indexToRemove];
    const updatedList = supplierUrls.filter((_, idx) => idx !== indexToRemove);
    setIsSavingSuppliers(true);

    try {
      const res = await fetch("/api/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: product.id,
          supplierUrls: updatedList,
        }),
      });

      if (!res.ok) throw new Error("Failed to update supplier URLs");

      setSupplierUrls(updatedList);
      product.supplierUrls = updatedList;
      onProductUpdate?.({ ...product, supplierUrls: updatedList });

      showToast({
        type: "success",
        title: "Supplier Link Removed",
        message: "Supplier URL deleted.",
      });
    } catch (err: any) {
      showToast({
        type: "error",
        title: "Failed to Remove",
        message: err.message || "Could not remove supplier URL.",
      });
    } finally {
      setIsSavingSuppliers(false);
    }
  };

  const handleCopySupplierUrl = async (url: string, index: number) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedSupplierIndex(index);
      showToast({
        type: "success",
        title: "Supplier Link Copied",
        message: "URL copied to clipboard.",
      });
      setTimeout(() => setCopiedSupplierIndex(null), 2000);
    } catch {
      showToast({
        type: "error",
        title: "Copy Failed",
        message: "Could not access clipboard.",
      });
    }
  };

  const allImages = [
    ...(product.mainImageUrl ? [product.mainImageUrl] : []),
    ...(product.galleryImages || []),
  ].filter((img, idx, arr) => arr.indexOf(img) === idx);

  const generateAIProductPrompt = () => {
    if (!product) return "";
    const offersText =
      product.allOffers && Array.isArray(product.allOffers) && product.allOffers.length > 0
        ? product.allOffers
            .map((o: any) => `- ${o.tier_name || "Tier"}: ${o.price || ""} ${o.savings ? `(${o.savings})` : ""}`)
            .join("\n")
        : "- Price: " + (product.currentPrice || "N/A");

    const imagesText = allImages.map((img, i) => `${i + 1}. ${img}`).join("\n");

    const adCopiesText =
      linkedAds.length > 0
        ? linkedAds
            .slice(0, 5)
            .map((ad, i) => `Angle ${i + 1} (${ad.pageName || "Store"}):\n"${ad.caption || ad.title || "No copy text"}"`)
            .join("\n\n")
        : "No active ad copies tracked.";

    const suppliersText =
      supplierUrls.length > 0
        ? supplierUrls
            .map((u, i) => `${i + 1}. [${getSupplierPlatformInfo(u).name}] ${u}`)
            .join("\n")
        : "None specified.";

    return `# Product Brief for AI Copywriting & Store Listing

## Product Details:
- **Title:** ${product.title || "Product Landing Page"}
- **Current Price:** ${product.currentPrice || "N/A"}
- **Original / Regular Price:** ${product.originalPrice || "N/A"}
- **Discount Offer:** ${product.discountOrOffer || "N/A"}
- **Delivery / Shipping Policy:** ${product.deliveryCost || "Not specified"}
- **Store Domain:** ${product.domain || "N/A"}
- **Destination URL:** ${product.url}

## Sourcing & Verified Supplier Links:
${suppliersText}

## Multi-Tier Offers & Bundles:
${offersText}

## Product Images (High-Resolution):
${imagesText}

## Active Meta Ad Creative Angles:
${adCopiesText}

---
### 🤖 Copywriting Instructions for AI:
"You are a world-class direct response e-commerce copywriter. Based on the product data above:
1. Write 5 high-converting headline hooks (Problem-Agitate-Solve, Curiosity, Benefit-Driven).
2. Write a complete high-converting Shopify product page description with Bullet Points, Benefits, and an FAQ section.
3. Write 3 short-form UGC video ad scripts (30 seconds each) with visual scene directions and voiceover text."`;
  };

  const generateCleanMarkdown = () => {
    if (!product) return "";
    const offersText =
      product.allOffers && Array.isArray(product.allOffers) && product.allOffers.length > 0
        ? product.allOffers
            .map((o: any) => `- ${o.tier_name || "Tier"}: ${o.price || ""} ${o.savings ? `(${o.savings})` : ""}`)
            .join("\n")
        : "- Price: " + (product.currentPrice || "N/A");

    const imagesText = allImages.map((img) => `- ${img}`).join("\n");

    const suppliersText =
      supplierUrls.length > 0
        ? supplierUrls
            .map((u) => `- [${getSupplierPlatformInfo(u).name}](${u})`)
            .join("\n")
        : "None specified.";

    return `# ${product.title || "Product Landing Page"}

**Price:** ${product.currentPrice || "N/A"} ${product.originalPrice ? `(Regular: ${product.originalPrice})` : ""}
**Offer:** ${product.discountOrOffer || "N/A"}
**Delivery:** ${product.deliveryCost || "Not specified"}
**Source URL:** ${product.url}

### Sourcing & Suppliers:
${suppliersText}

### Offers / Quantity Discounts:
${offersText}

### Images:
${imagesText}`;
  };

  const handleCopy = async (type: "ai" | "markdown" | "images" | "suppliers") => {
    let textToCopy = "";
    let label = "";

    if (type === "ai") {
      textToCopy = generateAIProductPrompt();
      label = "Full AI Copywriting Prompt";
    } else if (type === "markdown") {
      textToCopy = generateCleanMarkdown();
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-4xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
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
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
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

                    {typeof product.activeAdsCount === "number" && product.activeAdsCount === 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                        ⚫ Inactive / Off-Air
                      </span>
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
                  onClick={handleCancelEdit}
                  disabled={isSavingEdit}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  <span>Cancel</span>
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
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
                {/* Edit Details Button */}
                <button
                  type="button"
                  onClick={() => setIsEditMode(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xs transition-all cursor-pointer"
                  title="Edit Product Details, Meta Ad Library Link, Prices & Taxonomy"
                >
                  <Edit3 className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Edit Details</span>
                </button>

                {/* Star Favorite Toggle */}
                <button
                  type="button"
                  onClick={async () => {
                    const nextState = !product.isFavorite;
                    product.isFavorite = nextState;
                    try {
                      await fetch("/api/products", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id: product.id, isFavorite: nextState }),
                      });
                      showToast({
                        type: "success",
                        title: nextState ? "Starred" : "Removed",
                        message: nextState ? "Added product to favorites" : "Removed product from favorites",
                      });
                    } catch {}
                  }}
                  className={`p-1.5 rounded-lg border transition-all cursor-pointer shadow-xs ${
                    product.isFavorite
                      ? "bg-amber-500 text-slate-950 border-amber-400 font-bold"
                      : "bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:text-amber-500"
                  }`}
                  title={product.isFavorite ? "Remove from Favorites" : "Add to Favorites"}
                >
                  <Star className={`w-3.5 h-3.5 ${product.isFavorite ? "fill-current" : ""}`} />
                </button>

                {/* Re-check / Set Pending Ads Button */}
                <button
                  type="button"
                  onClick={handleQueueVerify}
                  disabled={isQueueingVerify}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 rounded-lg shadow-xs transition-all cursor-pointer disabled:opacity-50"
                  title="Set all linked ads as Pending so the next worker or GitHub Action scans them"
                >
                  <RotateCw className={`w-3.5 h-3.5 ${isQueueingVerify ? "animate-spin" : ""}`} />
                  <span>{isQueueingVerify ? "Queueing..." : "Recheck Ads"}</span>
                </button>

                {/* 1-Click Copy Dropdown */}
                <div className="relative" ref={copyMenuRef}>
                  <button
                    onClick={() => setShowCopyMenu(!showCopyMenu)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 rounded-lg shadow-sm transition-all cursor-pointer"
                    title="Copy Product Pack for AI Copywriting & Store Builders"
                  >
                    {copiedType ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-300" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-indigo-200" />
                        <span>Copy for AI / Store</span>
                        <ChevronDown className="w-3 h-3 text-indigo-200 ml-0.5" />
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

                <a
                  href={product.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition-all"
                >
                  <span>Visit Store</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>

                {/* More Actions Dropdown */}
                <div className="relative" ref={actionsMenuRef}>
                  <button
                    type="button"
                    onClick={() => setShowActionsMenu(!showActionsMenu)}
                    className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                    title="More actions (Re-scrape, Scan Ads, Delete)"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>

                  {showActionsMenu && (
                    <div className="absolute right-0 mt-1.5 w-60 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl py-1.5 z-50 animate-in fade-in slide-in-from-top-2">
                      <div className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-800 text-[10px] uppercase font-bold text-slate-400">
                        Product Operations
                      </div>

                      {/* Re-scrape Store Data */}
                      {onRefresh && (
                        <button
                          type="button"
                          onClick={() => {
                            setShowActionsMenu(false);
                            handleRefresh();
                          }}
                          disabled={isRefreshing}
                          className="w-full px-3 py-2 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <RotateCw className={`w-3.5 h-3.5 text-indigo-500 ${isRefreshing ? "animate-spin" : ""}`} />
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-slate-100">Re-scrape Store Landing Page</div>
                            <div className="text-[10px] text-slate-400">Re-fetches price, offers, and store images</div>
                          </div>
                        </button>
                      )}

                      {/* Queue Ads Verification */}
                      <button
                        type="button"
                        onClick={() => {
                          setShowActionsMenu(false);
                          handleQueueVerify();
                        }}
                        disabled={isQueueingVerify}
                        className="w-full px-3 py-2 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <Sparkles className={`w-3.5 h-3.5 text-purple-500 ${isQueueingVerify ? "animate-spin" : ""}`} />
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-slate-100">Queue Ads for Re-scan</div>
                          <div className="text-[10px] text-slate-400">Marks all {linkedAds.length} linked ads as Pending</div>
                        </div>
                      </button>

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
                              <div className="text-[10px] text-rose-400/80">Permanently removes from database</div>
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
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {isEditMode ? (
            /* ========================================================
               INLINE EDIT MODE FORM
               ======================================================== */
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
                      placeholder="e.g. 1048155524678020 or https://facebook.com/ads/library/?view_all_page_id=..."
                      className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 font-mono"
                    />
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 block">
                      💡 Paste either the numeric Page ID or the full Meta Ad Library URL. Clean digits are auto-extracted.
                    </span>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Brand Display Name
                    </label>
                    <input
                      type="text"
                      value={editForm.brandName}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, brandName: e.target.value }))}
                      placeholder="e.g. TechStore TN"
                      className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Product Identity & Media */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-purple-500" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                    Product Identity & Media
                  </h4>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Product Title
                    </label>
                    <input
                      type="text"
                      value={editForm.title}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, title: e.target.value }))}
                      placeholder="Product display title..."
                      className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 font-semibold"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Store Landing Page URL
                    </label>
                    <input
                      type="text"
                      value={editForm.url}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, url: e.target.value }))}
                      placeholder="https://store.tn/products/..."
                      className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 font-mono"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                    <div className="sm:col-span-9">
                      <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                        Main Image URL
                      </label>
                      <input
                        type="text"
                        value={editForm.mainImageUrl}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, mainImageUrl: e.target.value }))}
                        placeholder="https://.../product.jpg"
                        className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 font-mono"
                      />
                    </div>
                    <div className="sm:col-span-3 flex items-center justify-center">
                      <div className="relative w-16 h-16 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden flex items-center justify-center shrink-0">
                        {editForm.mainImageUrl ? (
                          <NextImage
                            src={editForm.mainImageUrl}
                            alt="Preview"
                            fill
                            unoptimized
                            referrerPolicy="no-referrer"
                            className="object-contain p-1"
                          />
                        ) : (
                          <ImageIcon className="w-5 h-5 text-slate-400" />
                        )}
                      </div>
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

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Selling Price
                    </label>
                    <input
                      type="text"
                      value={editForm.currentPrice}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, currentPrice: e.target.value }))}
                      placeholder="e.g. 69.00 TND"
                      className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 font-bold"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Original / Compare Price
                    </label>
                    <input
                      type="text"
                      value={editForm.originalPrice}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, originalPrice: e.target.value }))}
                      placeholder="e.g. 99.00 TND"
                      className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Promo Offer / Discount Badge
                    </label>
                    <input
                      type="text"
                      value={editForm.discountOrOffer}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, discountOrOffer: e.target.value }))}
                      placeholder="e.g. Achetez 1 Obtenez 1 Gratuit"
                      className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Delivery / Shipping Fee
                    </label>
                    <input
                      type="text"
                      value={editForm.deliveryCost}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, deliveryCost: e.target.value }))}
                      placeholder="e.g. Gratuit or 7 DT"
                      className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Section 4: Classification & Platform */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-amber-500" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                    Classification & Store Platform
                  </h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Category (Free Text)
                    </label>
                    <input
                      type="text"
                      value={editForm.category}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, category: e.target.value }))}
                      placeholder="e.g. Beauty & Personal Care"
                      className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Sub-Category (Free Text)
                    </label>
                    <input
                      type="text"
                      value={editForm.subCategory}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, subCategory: e.target.value }))}
                      placeholder="e.g. Hair Care, Kitchen Gadgets"
                      className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Store Platform
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

              {/* Section 5: Specific Linked Meta Ad Creatives */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-500" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                      Specific Linked Meta Ad Creatives ({linkedAds.length})
                    </h4>
                  </div>
                  <span className="text-[10px] text-slate-400">
                    Paste specific Meta Ad URLs containing <code>id=...</code>
                  </span>
                </div>

                {/* Add Specific Ad by URL / ID form */}
                <form onSubmit={handleLinkAd} className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={newAdInput}
                      onChange={(e) => setNewAdInput(e.target.value)}
                      placeholder="Paste specific Ad URL (e.g. https://facebook.com/ads/library/?...&id=27539319635709933 or raw Ad ID)..."
                      className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 font-mono"
                      disabled={isLinkingAd}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={!newAdInput.trim() || isLinkingAd}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-all cursor-pointer shrink-0"
                  >
                    {isLinkingAd ? (
                      <RotateCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                    <span>Attach Ad</span>
                  </button>
                </form>

                {/* List of currently linked ads with unlinking capability */}
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

                          <div className="p-1.5 text-[10px] font-mono truncate text-slate-500 flex items-center justify-between">
                            <span className="truncate">{ad.adArchiveId}</span>
                            <a
                              href={`https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&id=${ad.adArchiveId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-slate-400 hover:text-indigo-600 ml-1"
                              title="Open in Meta Library"
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
                    No specific ad creatives attached yet. Paste a Meta Ad Library URL with <code>id=...</code> above.
                  </div>
                )}
              </div>

              {/* Bottom Actions inside Edit Form */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={handleCancelEdit}
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
          ) : (
            /* ========================================================
               VIEW MODE (ORIGINAL CONTENT)
               ======================================================== */
            <>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                {/* Left: Product Images */}
                <div className="md:col-span-5 flex flex-col gap-3">
                  <div className="relative aspect-square w-full bg-slate-100 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden flex items-center justify-center">
                    {selectedImage ? (
                      <NextImage
                        src={selectedImage}
                        alt={product.title || "Product image"}
                        fill
                        unoptimized
                        referrerPolicy="no-referrer"
                        className={`object-contain p-3 transition-all duration-300 ${
                          typeof product.activeAdsCount === "number" && product.activeAdsCount === 0
                            ? "grayscale contrast-90 hover:grayscale-0"
                            : ""
                        }`}
                      />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-slate-400">
                    <ShoppingBag className="w-12 h-12 stroke-[1.5] opacity-40" />
                    <span className="text-xs">No Image</span>
                  </div>
                )}
              </div>

              {/* Thumbnail strip */}
              {allImages.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {allImages.map((img, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedImage(img)}
                      className={`relative w-14 h-14 rounded-lg border-2 overflow-hidden shrink-0 bg-slate-100 dark:bg-slate-950 transition-all ${
                        selectedImage === img
                          ? "border-indigo-600 dark:border-indigo-400 shadow-md"
                          : "border-slate-200 dark:border-slate-800 opacity-60 hover:opacity-100"
                      }`}
                    >
                      <NextImage
                        src={img}
                        alt={`Thumbnail ${i + 1}`}
                        fill
                        unoptimized
                        referrerPolicy="no-referrer"
                        className="object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Product Details & Pricing */}
            <div className="md:col-span-7 flex flex-col space-y-4">
              {/* Pricing Block */}
              <div className="p-4 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">
                  Pricing & Offers
                </span>
                <div className="flex items-baseline gap-3 flex-wrap">
                  {product.currentPrice ? (
                    <span className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400">
                      {product.currentPrice}
                    </span>
                  ) : (
                    <span className="text-sm text-slate-400 italic">Price not detected</span>
                  )}

                  {product.originalPrice && (
                    <span className="text-base text-slate-600 dark:text-slate-400 line-through">
                      {product.originalPrice}
                    </span>
                  )}

                  {product.discountOrOffer && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold border border-emerald-500/20">
                      <Tag className="w-3 h-3" />
                      {product.discountOrOffer}
                    </span>
                  )}

                  {/* Delivery / Tawsil Badge */}
                  {(() => {
                    const delivery = product.deliveryCost;
                    const isFree =
                      delivery?.toLowerCase().includes("gratuit") ||
                      delivery?.toLowerCase().includes("free") ||
                      delivery?.toLowerCase().includes("مجاني") ||
                      delivery?.toLowerCase().includes("0 dt") ||
                      delivery?.toLowerCase().includes("0dt") ||
                      product.discountOrOffer?.toLowerCase().includes("livraison gratuite") ||
                      product.discountOrOffer?.toLowerCase().includes("توصيل مجاني");

                    const isSpecifiedPaid =
                      delivery &&
                      delivery !== "Livraison Non Spécifiée" &&
                      !isFree;

                    const label = isFree
                      ? "Livraison Gratuite"
                      : isSpecifiedPaid
                      ? delivery
                      : "Livraison: 7 DT (Standard COD)";

                    return (
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                          isFree
                            ? "bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                            : isSpecifiedPaid
                            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                        }`}
                        title={
                          isFree
                            ? "Livraison gratuite / Free Delivery"
                            : isSpecifiedPaid
                            ? `Frais de livraison: ${delivery}`
                            : "Livraison standard COD en Tunisie (~7 DT)"
                        }
                      >
                        <Truck className="w-3.5 h-3.5" />
                        <span>{label}</span>
                      </span>
                    );
                  })()}
                </div>
              </div>

              {/* Multi-Tier Bundle Offers */}
              {product.allOffers && Array.isArray(product.allOffers) && product.allOffers.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                    <Layers className="w-4 h-4 text-indigo-500" />
                    <span>Bundle & Quantity Options</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {product.allOffers.map((tier, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-white dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col justify-between"
                      >
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          {(tier as any).tier_name || (tier as any).tierName || "Bundle Tier"}
                        </span>
                        <div className="flex items-baseline justify-between mt-1">
                          <span className="text-sm font-extrabold text-indigo-600 dark:text-indigo-400">
                            {tier.price}
                          </span>
                          {tier.savings && (
                            <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                              {tier.savings}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Metadata details */}
              <div className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
                <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="font-medium">Destination URL:</span>
                  <a
                    href={product.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-indigo-600 dark:text-indigo-400 hover:underline truncate max-w-[280px]"
                  >
                    {product.url}
                  </a>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="font-medium">First Scraped:</span>
                  <span>{new Date(product.createdAt).toLocaleString()}</span>
                </div>
                {product.lastScrapedAt && (
                  <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                    <span className="font-medium">Last Updated:</span>
                    <span>{new Date(product.lastScrapedAt).toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Product Sourcing & Supplier Links Section */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Boxes className="w-4 h-4 text-amber-500" />
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Product Sourcing & Supplier Links
                </h4>
                <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold border border-slate-200 dark:border-slate-700">
                  {supplierUrls.length} {supplierUrls.length === 1 ? "Supplier" : "Suppliers"}
                </span>
              </div>
              {supplierUrls.length > 0 && (
                <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Sourcing Verified</span>
                </span>
              )}
            </div>

            {/* Supplier URLs List */}
            {supplierUrls.length > 0 ? (
              <div className="space-y-2 mb-3">
                {supplierUrls.map((url, idx) => {
                  const platform = getSupplierPlatformInfo(url);
                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-all group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold border ${platform.badgeClass}`}>
                          <span>{platform.icon}</span>
                          <span>{platform.name}</span>
                        </span>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-mono text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline truncate"
                          title={url}
                        >
                          {url}
                        </a>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Copy URL */}
                        <button
                          type="button"
                          onClick={() => handleCopySupplierUrl(url, idx)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                          title="Copy Supplier URL"
                        >
                          {copiedSupplierIndex === idx ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>

                        {/* Open in new tab */}
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                          title="Open Supplier Link in New Tab"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>

                        {/* Delete URL */}
                        <button
                          type="button"
                          onClick={() => handleRemoveSupplierUrl(idx)}
                          disabled={isSavingSuppliers}
                          className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                          title="Remove Supplier URL"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-3 mb-3 text-center rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-400 flex items-center justify-center gap-2">
                <Link2 className="w-4 h-4 text-slate-400" />
                <span>No supplier URLs added yet. Add supplier product URLs (e.g. Facebook post/page link, custom supplier URL) below.</span>
              </div>
            )}

            {/* Add New Supplier URL Form */}
            <form onSubmit={handleAddSupplierUrl} className="flex items-center gap-2">
              <div className="relative flex-1">
                <Link2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={newSupplierInput}
                  onChange={(e) => setNewSupplierInput(e.target.value)}
                  placeholder="Paste supplier product URL (e.g. Facebook post/page, custom supplier link)..."
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                  disabled={isSavingSuppliers}
                />
              </div>
              <button
                type="submit"
                disabled={!newSupplierInput.trim() || isSavingSuppliers}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-sm transition-all cursor-pointer shrink-0"
              >
                {isSavingSuppliers ? (
                  <RotateCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                <span>Add Supplier</span>
              </button>
            </form>
          </div>

          {/* Tunisian Advertiser & Shadow Network Intelligence Section */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-purple-500" />
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Advertiser Network Intelligence (Tunisia COD)
                </h4>
                {network?.hasShadowNetwork && (
                  <span className="px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 text-xs font-bold border border-purple-500/20 flex items-center gap-1">
                    <Radio className="w-3 h-3 animate-pulse text-purple-500" />
                    <span>Shadow Network Detected ({network.totalConnectedPages} Pages)</span>
                  </span>
                )}
              </div>
            </div>

            {loadingNetwork ? (
              <div className="py-4 text-center text-xs text-slate-400">
                Scanning advertiser network & contact fingerprints...
              </div>
            ) : network ? (
              <div className="space-y-3">
                {/* Network Fingerprint Badges */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3 rounded-xl bg-purple-500/5 border border-purple-500/15">
                  {/* Store Platform */}
                  <div className="flex items-center gap-2.5">
                    <Server className="w-4 h-4 text-purple-500 shrink-0" />
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Store Platform</span>
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase">
                        {network.storePlatform === "youcan"
                          ? "🛍️ YouCan.shop"
                          : network.storePlatform === "woocommerce"
                          ? "🌐 WooCommerce"
                          : network.storePlatform === "shopify"
                          ? "🟢 Shopify"
                          : network.storePlatform === "custom_cod"
                          ? "⚡ Custom COD Form"
                          : "Standard Web"}
                      </span>
                    </div>
                  </div>

                  {/* Phone / WhatsApp Contacts */}
                  <div className="flex items-center gap-2.5">
                    {network.formattedWhatsApps?.length > 0 ? (
                      <MessageCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                    ) : (
                      <Phone className="w-4 h-4 text-indigo-500 shrink-0" />
                    )}
                    <div className="truncate">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">
                        {network.formattedWhatsApps?.length > 0 ? "Verified WhatsApp" : "Contact Phone"}
                      </span>
                      {network.formattedWhatsApps?.length > 0 ? (
                        <a
                          href={`https://wa.me/${network.whatsappNumbers[0]}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
                        >
                          <span>{network.formattedWhatsApps[0].formatted}</span>
                          <span className="text-[10px] font-normal text-slate-400">({network.formattedWhatsApps[0].operator})</span>
                        </a>
                      ) : network.formattedPhones?.length > 0 ? (
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          {network.formattedPhones[0].formatted}{" "}
                          <span className="text-[10px] font-normal text-slate-400">({network.formattedPhones[0].operator})</span>
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 italic">No direct phone found</span>
                      )}
                    </div>
                  </div>

                  {/* Meta Pixel ID */}
                  <div className="flex items-center gap-2.5">
                    <Radio className="w-4 h-4 text-amber-500 shrink-0" />
                    <div className="truncate">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Meta Pixel ID</span>
                      {network.metaPixelIds?.length > 0 ? (
                        <span className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400">
                          {network.metaPixelIds[0]}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Hidden / Server API</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Connected Facebook Pages in Network */}
                {network.connectedPages && network.connectedPages.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                      Connected Facebook Pages in this Scaling Network ({network.connectedPages.length} Page{network.connectedPages.length === 1 ? "" : "s"}, {network.totalNetworkAds} Total Ads):
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      {network.connectedPages.map((pg: any) => (
                        <div
                          key={pg.pageId}
                          className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate block">
                              {pg.pageName}
                            </span>
                            <span className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold">
                              {pg.activeAdsCount} active ad{pg.activeAdsCount === 1 ? "" : "s"}
                            </span>
                          </div>
                          <a
                            href={`https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=TN&view_all_page_id=${pg.pageId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                            title="View in Meta Ad Library"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* Linked Creatives Section */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
            {(() => {
              const activeLinkedAds = linkedAds.filter((a: any) => !a.isArchived && a.isActive !== false);
              const inactiveLinkedAds = linkedAds.filter((a: any) => a.isArchived || a.isActive === false);
              const isAllInactive = linkedAds.length > 0 && activeLinkedAds.length === 0;

              return (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-indigo-500" />
                      <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        Linked Ad Creatives ({linkedAds.length})
                      </h4>
                      {linkedAds.length > 0 && (
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-500/20">
                            {activeLinkedAds.length} Active
                          </span>
                          {inactiveLinkedAds.length > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 font-semibold border border-rose-500/20">
                              {inactiveLinkedAds.length} Stopped
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleQueueVerify}
                        disabled={isQueueingVerify || linkedAds.length === 0}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 transition-all cursor-pointer disabled:opacity-50"
                        title="Marks all linked ads as Pending so the next worker or GitHub Action scans them"
                      >
                        <RotateCw className={`w-3.5 h-3.5 ${isQueueingVerify ? "animate-spin" : ""}`} />
                        <span>{isQueueingVerify ? "Queueing..." : "Scan All Linked Ads"}</span>
                      </button>
                      {activeLinkedAds.length >= 3 && (
                        <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-bold border border-amber-500/20">
                          High Scaling Winner
                        </span>
                      )}
                    </div>
                  </div>

                  {isAllInactive && (
                    <div className="mb-3 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-medium flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                      <span>All linked ad creatives have stopped running or were archived by the advertiser.</span>
                    </div>
                  )}

                  {/* Quick Add Ad Creative Form */}
                  <form onSubmit={handleLinkAd} className="flex items-center gap-2 mb-3">
                    <div className="relative flex-1">
                      <Sparkles className="w-4 h-4 text-indigo-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={newAdInput}
                        onChange={(e) => setNewAdInput(e.target.value)}
                        placeholder="Paste specific Meta Ad URL (e.g. https://facebook.com/ads/library/?...&id=27539319635709933) or Ad ID to link..."
                        className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all font-mono"
                        disabled={isLinkingAd}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={!newAdInput.trim() || isLinkingAd}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-sm transition-all cursor-pointer shrink-0"
                    >
                      {isLinkingAd ? (
                        <RotateCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Plus className="w-3.5 h-3.5" />
                      )}
                      <span>Link Ad</span>
                    </button>
                  </form>

                  {loadingAds ? (
                    <div className="py-8 text-center text-xs text-slate-400">
                      Loading linked creatives...
                    </div>
                  ) : linkedAds.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-400 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                      No active ad creatives linked yet. Paste a Meta Ad Library URL with <code>id=...</code> above to link one.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                      {linkedAds.map((ad: any) => {
                        const isAdArchived = Boolean(ad.isArchived || ad.isActive === false);
                        const thumb = ad.signedThumbnailUrl || ad.thumbnailUrl || ad.mediaUrls?.[0];
                        const isThisUnlinking = unlinkingAdId === ad.id;

                        return (
                          <div
                            key={ad.id}
                            className={`group relative flex flex-col bg-slate-50 dark:bg-slate-950 rounded-lg border overflow-hidden transition-all ${
                              isAdArchived
                                ? "border-rose-500/30 opacity-75 hover:opacity-100 hover:border-rose-500"
                                : "border-slate-200 dark:border-slate-800 hover:border-indigo-500"
                            }`}
                          >
                            <a
                              href={`https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&id=${ad.adArchiveId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="relative aspect-square w-full bg-slate-200 dark:bg-slate-900 flex items-center justify-center"
                              title={`${ad.title || ad.caption || "Ad Creative"} (${isAdArchived ? "Inactive" : "Active"})`}
                            >
                              {thumb ? (
                                <NextImage
                                  src={thumb}
                                  alt="Ad creative"
                                  fill
                                  unoptimized
                                  referrerPolicy="no-referrer"
                                  className={`object-cover transition-transform group-hover:scale-105 ${
                                    isAdArchived ? "grayscale-[40%]" : ""
                                  }`}
                                />
                              ) : (
                                <ImageIcon className="w-6 h-6 text-slate-400" />
                              )}

                              {/* Status Badge */}
                              <div className="absolute top-1.5 right-1.5 z-10">
                                {isAdArchived ? (
                                  <span className="px-1.5 py-0.5 rounded bg-rose-950/80 backdrop-blur-sm text-rose-300 text-[9px] font-bold border border-rose-500/40">
                                    Inactive
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-950/80 backdrop-blur-sm text-emerald-300 text-[9px] font-bold border border-emerald-500/40">
                                    Active
                                  </span>
                                )}
                              </div>

                              {ad.mediaType === "video" && (
                                <div className="absolute bottom-1.5 left-1.5 w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-md">
                                  <Play className="w-2.5 h-2.5 fill-current ml-0.5" />
                                </div>
                              )}
                            </a>

                            <div className="p-2 truncate text-[10px] font-medium text-slate-600 dark:text-slate-400 flex items-center justify-between">
                              <span className="truncate">{ad.pageName || `Page ${ad.pageId}`}</span>
                              <div className="flex items-center gap-1">
                                <a
                                  href={`https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&id=${ad.adArchiveId}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-slate-400 hover:text-indigo-600"
                                  title="Open in Meta Ad Library"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                                <button
                                  type="button"
                                  onClick={() => handleUnlinkAd(ad.id, ad.adArchiveId)}
                                  disabled={isThisUnlinking}
                                  className="text-slate-400 hover:text-rose-500 p-0.5 rounded transition-colors cursor-pointer"
                                  title="Unlink ad from product"
                                >
                                  {isThisUnlinking ? (
                                    <RotateCw className="w-3 h-3 animate-spin text-rose-500" />
                                  ) : (
                                    <Trash2 className="w-3 h-3" />
                                  )}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
