"use client";

import { useState } from "react";
import { ScrapedProduct } from "@/types";
import { useToast } from "@/components/toast-context";
import {
  Boxes,
  CheckCircle2,
  Copy,
  Check,
  ExternalLink,
  Trash2,
  Link2,
  RotateCw,
  Plus,
} from "lucide-react";
import { getSupplierPlatformInfo } from "./modal-types";

interface ModalSourcingSectionProps {
  product: ScrapedProduct;
  onProductUpdate?: (updatedProduct: ScrapedProduct) => void;
}

export function ModalSourcingSection({ product, onProductUpdate }: ModalSourcingSectionProps) {
  const { showToast } = useToast();
  const [newSupplierInput, setNewSupplierInput] = useState("");
  const [isSavingSuppliers, setIsSavingSuppliers] = useState(false);
  const [copiedSupplierIndex, setCopiedSupplierIndex] = useState<number | null>(null);

  const supplierUrls = product.supplierUrls || [];

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

  return (
    <div className="space-y-3">
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
                    className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
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
  );
}
