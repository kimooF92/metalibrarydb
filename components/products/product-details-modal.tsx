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
} from "lucide-react";

interface ProductDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: ScrapedProduct | null;
  onRefresh?: (productId: string) => Promise<void>;
  onDelete?: (productId: string) => Promise<void>;
}

export function ProductDetailsModal({
  isOpen,
  onClose,
  product,
  onRefresh,
  onDelete,
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

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (copyMenuRef.current && !copyMenuRef.current.contains(event.target as Node)) {
        setShowCopyMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (product) {
      setSelectedImage(product.mainImageUrl || null);
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

    return `# Product Brief for AI Copywriting & Store Listing

## Product Details:
- **Title:** ${product.title || "Product Landing Page"}
- **Current Price:** ${product.currentPrice || "N/A"}
- **Original / Regular Price:** ${product.originalPrice || "N/A"}
- **Discount Offer:** ${product.discountOrOffer || "N/A"}
- **Delivery / Shipping Policy:** ${product.deliveryCost || "Not specified"}
- **Store Domain:** ${product.domain || "N/A"}
- **Destination URL:** ${product.url}

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

    return `# ${product.title || "Product Landing Page"}

**Price:** ${product.currentPrice || "N/A"} ${product.originalPrice ? `(Regular: ${product.originalPrice})` : ""}
**Offer:** ${product.discountOrOffer || "N/A"}
**Delivery:** ${product.deliveryCost || "Not specified"}
**Source URL:** ${product.url}

### Offers / Quantity Discounts:
${offersText}

### Images:
${imagesText}`;
  };

  const handleCopy = async (type: "ai" | "markdown" | "images") => {
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
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
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
                </div>
              )}
            </div>

            {onRefresh && (
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                title="Re-extract Product"
              >
                <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-indigo-500" : ""}`} />
                <span>Refresh</span>
              </button>
            )}

            <a
              href={product.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition-all"
            >
              <span>Visit Store</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
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
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-500" />
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Active Ad Creatives Linked to this Landing Page ({linkedAds.length})
                </h4>
              </div>
              {linkedAds.length >= 3 && (
                <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-bold border border-amber-500/20">
                  High Scaling Winner
                </span>
              )}
            </div>

            {loadingAds ? (
              <div className="py-8 text-center text-xs text-slate-400">
                Loading linked creatives...
              </div>
            ) : linkedAds.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-200 dark:border-slate-800">
                No active ad creatives directly linked to this product ID yet.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {linkedAds.map((ad) => {
                  const thumb = ad.signedThumbnailUrl || ad.thumbnailUrl || ad.mediaUrls?.[0];
                  return (
                    <a
                      key={ad.id}
                      href={`https://www.facebook.com/ads/library/?id=${ad.adArchiveId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative flex flex-col bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden hover:border-indigo-500 transition-all"
                      title={ad.title || ad.caption || "Ad Creative"}
                    >
                      <div className="relative aspect-square w-full bg-slate-200 dark:bg-slate-900 flex items-center justify-center">
                        {thumb ? (
                          <NextImage
                            src={thumb}
                            alt="Ad creative"
                            fill
                            unoptimized
                            referrerPolicy="no-referrer"
                            className="object-cover group-hover:scale-105 transition-transform"
                          />
                        ) : (
                          <ImageIcon className="w-6 h-6 text-slate-400" />
                        )}

                        {ad.mediaType === "video" && (
                          <div className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-md">
                            <Play className="w-2.5 h-2.5 fill-current ml-0.5" />
                          </div>
                        )}
                      </div>
                      <div className="p-2 truncate text-[10px] font-medium text-slate-600 dark:text-slate-400">
                        {ad.pageName || `Page ${ad.pageId}`}
                      </div>
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
