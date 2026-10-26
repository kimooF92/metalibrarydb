"use client";

import { useState, useEffect, useCallback } from "react";
import { ScrapedProduct } from "@/types";
import { useToast } from "@/components/toast-context";
import {
  Code2,
  Copy,
  Check,
  ExternalLink,
  RotateCw,
  X,
  Sparkles,
  AlertCircle,
  FileJson,
  Layers,
  CheckCircle2,
} from "lucide-react";

interface ModalJsonLdViewerProps {
  isOpen: boolean;
  onClose: () => void;
  product: ScrapedProduct;
  onProductUpdate?: (updatedProduct: ScrapedProduct) => void;
}

type ViewTab = "product" | "all" | "summary" | "raw";

export function ModalJsonLdViewer({
  isOpen,
  onClose,
  product,
  onProductUpdate,
}: ModalJsonLdViewerProps) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schemas, setSchemas] = useState<any[]>([]);
  const [productSchema, setProductSchema] = useState<any | null>(null);
  const [rawScripts, setRawScripts] = useState<string[]>([]);
  const [parsedProduct, setParsedProduct] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<ViewTab>("product");
  const [copied, setCopied] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  const fetchJsonLd = useCallback(async () => {
    if (!product?.url) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/products/json-ld", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: product.url, productId: product.id }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to fetch JSON-LD from store page.");
      }

      setSchemas(data.schemas || []);
      setProductSchema(data.productSchema || null);
      setRawScripts(data.rawScripts || []);
      setParsedProduct(data.parsedProduct || null);

      if (data.productSchema) {
        setActiveTab("product");
      } else if ((data.schemas || []).length > 0) {
        setActiveTab("all");
      } else {
        setActiveTab("summary");
      }
    } catch (err: any) {
      setError(err.message || "Failed to extract JSON-LD.");
    } finally {
      setLoading(false);
    }
  }, [product?.id, product?.url]);

  useEffect(() => {
    if (isOpen) {
      fetchJsonLd();
    }
  }, [isOpen, fetchJsonLd]);

  const handleCopy = () => {
    let textToCopy = "";
    if (activeTab === "product") {
      textToCopy = JSON.stringify(productSchema || {}, null, 2);
    } else if (activeTab === "all") {
      textToCopy = JSON.stringify(schemas, null, 2);
    } else if (activeTab === "raw") {
      textToCopy = rawScripts.join("\n\n---\n\n");
    } else {
      textToCopy = JSON.stringify(parsedProduct || {}, null, 2);
    }

    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    showToast({
      type: "success",
      title: "Copied to Clipboard",
      message: "JSON-LD schema copied successfully.",
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApplyToProduct = async () => {
    if (!product?.id || !product?.url || isApplying) return;
    setIsApplying(true);

    try {
      const res = await fetch("/api/products/json-ld", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: product.url,
          productId: product.id,
          applyToProduct: true,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to apply JSON-LD to product.");
      }

      if (data.updatedProduct && onProductUpdate) {
        onProductUpdate(data.updatedProduct);
      }

      showToast({
        type: "success",
        title: "Product Updated",
        message: "Successfully synchronized product details from JSON-LD.",
      });
    } catch (err: any) {
      showToast({
        type: "error",
        title: "Apply Failed",
        message: err.message || "Could not apply JSON-LD data.",
      });
    } finally {
      setIsApplying(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/20">
              <Code2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                  JSON-LD Structured Data
                </h3>
                {schemas.length > 0 && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    {schemas.length} {schemas.length === 1 ? "schema" : "schemas"}
                  </span>
                )}
              </div>
              {product.url && (
                <a
                  href={product.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1 truncate transition-colors mt-0.5"
                  title={product.url}
                >
                  <span className="truncate">{product.url}</span>
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchJsonLd}
              disabled={loading}
              className="p-2 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              title="Re-fetch JSON-LD"
            >
              <RotateCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Action Tabs & Buttons Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/30">
          {/* Tab Selector */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl text-xs font-semibold">
            {productSchema && (
              <button
                type="button"
                onClick={() => setActiveTab("product")}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  activeTab === "product"
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                Product Schema
              </button>
            )}
            {schemas.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab("all")}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  activeTab === "all"
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                All Schemas ({schemas.length})
              </button>
            )}
            {rawScripts.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab("raw")}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  activeTab === "raw"
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                Raw Scripts ({rawScripts.length})
              </button>
            )}
            {parsedProduct && (
              <button
                type="button"
                onClick={() => setActiveTab("summary")}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  activeTab === "summary"
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                Extracted Fields
              </button>
            )}
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              disabled={loading || (!productSchema && schemas.length === 0)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 transition-all cursor-pointer disabled:opacity-50"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                  <span>Copy JSON</span>
                </>
              )}
            </button>

            {parsedProduct && (
              <button
                type="button"
                onClick={handleApplyToProduct}
                disabled={isApplying || loading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition-all cursor-pointer disabled:opacity-50"
                title="Sync title, price, images, and offers directly into catalog product"
              >
                {isApplying ? (
                  <RotateCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span>Sync to Product</span>
              </button>
            )}
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 text-sm">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-center">
              <RotateCw className="w-8 h-8 text-indigo-500 animate-spin mb-3" />
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Extracting JSON-LD structured data...
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Fetching HTML and parsing application/ld+json tags from destination store.
              </p>
            </div>
          ) : error ? (
            <div className="py-12 flex flex-col items-center justify-center text-center max-w-md mx-auto">
              <div className="w-10 h-10 rounded-full bg-rose-50 dark:bg-rose-950/60 text-rose-500 flex items-center justify-center mb-3">
                <AlertCircle className="w-5 h-5" />
              </div>
              <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</p>
              <button
                type="button"
                onClick={fetchJsonLd}
                className="mt-4 px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors cursor-pointer"
              >
                Retry Extraction
              </button>
            </div>
          ) : schemas.length === 0 && !productSchema ? (
            <div className="py-16 flex flex-col items-center justify-center text-center max-w-md mx-auto">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-500 flex items-center justify-center mb-3 border border-amber-200 dark:border-amber-800">
                <FileJson className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                No JSON-LD Schema Found
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                This store landing page does not contain standard{" "}
                <code className="px-1 py-0.5 bg-slate-100 dark:bg-slate-800 rounded font-mono text-[11px]">
                  &lt;script type=&quot;application/ld+json&quot;&gt;
                </code>{" "}
                tags. It may use client-rendered JavaScript (React/Next), Stocki form inputs, or standard DOM elements.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Highlight Cards if Product Schema */}
              {parsedProduct && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-xs">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Title</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200 truncate block mt-0.5">
                        {parsedProduct.title || "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Price</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400 block mt-0.5">
                        {parsedProduct.current_price
                          ? /(?:DT|TND|DH|MAD|USD|EUR|GBP|\$|€|£)/i.test(parsedProduct.current_price)
                            ? parsedProduct.current_price
                            : `${parsedProduct.current_price} ${parsedProduct.currency || ""}`.trim()
                          : "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Original Price</span>
                      <span className="font-semibold text-slate-500 line-through block mt-0.5">
                        {parsedProduct.original_price
                          ? /(?:DT|TND|DH|MAD|USD|EUR|GBP|\$|€|£)/i.test(parsedProduct.original_price)
                            ? parsedProduct.original_price
                            : `${parsedProduct.original_price} ${parsedProduct.currency || ""}`.trim()
                          : "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Images</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200 block mt-0.5">
                        {Array.isArray(parsedProduct.gallery_images) ? `${parsedProduct.gallery_images.length} images` : "—"}
                      </span>
                    </div>
                  </div>

                  {parsedProduct.current_price && /(?:\$|€|£|\b(?:USD|EUR|GBP)\b)/i.test(parsedProduct.current_price) && (
                    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300">
                      <AlertCircle className="w-4 h-4 shrink-0 text-amber-500" />
                      <span>
                        <strong>Cloud Geo-Conversion ({parsedProduct.current_price}):</strong> The cloud IP triggered store currency conversion. When your local residential worker runs, this product will be automatically validated with the authentic local price.
                      </span>
                    </div>
                  )}
                </>
              )}

              {/* Code Display */}
              <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 text-slate-100 shadow-inner">
                <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-950/60 text-xs font-mono text-slate-400">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                    <span className="ml-2 font-semibold">
                      {activeTab === "product"
                        ? "Product Schema"
                        : activeTab === "all"
                        ? `All Schemas (${schemas.length})`
                        : activeTab === "raw"
                        ? "Raw Scripts"
                        : "Parsed Summary"}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500">application/ld+json</span>
                </div>

                <pre className="p-4 overflow-x-auto text-xs font-mono leading-relaxed max-h-[50vh] scrollbar-thin">
                  <code>
                    {activeTab === "product"
                      ? JSON.stringify(productSchema || {}, null, 2)
                      : activeTab === "all"
                      ? JSON.stringify(schemas, null, 2)
                      : activeTab === "raw"
                      ? rawScripts.join("\n\n// ----------------------------------------\n\n")
                      : JSON.stringify(parsedProduct || {}, null, 2)}
                  </code>
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
