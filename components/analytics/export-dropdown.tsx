"use client";

import { useState, useRef, useEffect } from "react";
import {
  Download,
  FileSpreadsheet,
  Check,
  AlertTriangle,
  Loader2,
  ChevronDown,
  Layers,
  ShoppingBag,
  TrendingUp,
  Sparkles,
} from "lucide-react";
import { DateRange } from "./date-range-filter";
import { useToast } from "@/components/toast-context";
import { useWorkspace } from "@/components/workspace-context";

interface ExportDropdownProps {
  dateRange: DateRange;
  className?: string;
}

export type ExportType = "brands" | "products" | "categories" | "ads";

interface ExportOption {
  type: ExportType;
  label: string;
  description: string;
  icon: typeof FileSpreadsheet;
}

const EXPORT_OPTIONS: ExportOption[] = [
  {
    type: "brands",
    label: "Brands & Pages CSV",
    description: "Velocity, current ad counts, net 7d delta, status",
    icon: TrendingUp,
  },
  {
    type: "products",
    label: "Products & Winner Niches CSV",
    description: "Price tiers, clone traps, stores, product URLs",
    icon: ShoppingBag,
  },
  {
    type: "categories",
    label: "Category Matrix CSV",
    description: "Store density, active ads, price averages & min/max",
    icon: Layers,
  },
  {
    type: "ads",
    label: "Ad Creatives CSV",
    description: "Days active, media types, Darija & promo flags",
    icon: Sparkles,
  },
];

/**
 * Executes a single dataset CSV download from the /api/analytics/export endpoint.
 */
export async function downloadDatasetCsv(
  type: ExportType,
  dateRange: string,
  workspaceId?: string,
  lean = false
): Promise<{ success: boolean; filename: string; isTruncated: boolean; count: number }> {
  const headers: Record<string, string> = {};
  if (workspaceId) {
    headers["x-workspace-id"] = workspaceId;
  }

  // Map 'ads' to 'creatives' query param to prevent browser ad-blockers (uBlock, AdBlock, Brave Shields)
  // from intercepting and blocking fetch requests containing 'type=ads'
  const apiType = type === "ads" ? "creatives" : type;
  const endpoint = `/api/analytics/export?type=${apiType}&range=${dateRange}&lean=${lean}`;

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "GET",
      headers,
    });
  } catch (netErr: any) {
    console.warn(`[Export] Fetch failed for ${type}, attempting direct browser download fallback:`, netErr);
    // Direct browser navigation triggers native Content-Disposition download and bypasses extension fetch interceptors
    if (typeof window !== "undefined") {
      window.location.assign(endpoint);
      return { success: true, filename: `${type}_export.csv`, isTruncated: false, count: 0 };
    }
    throw netErr;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Export failed with status ${res.status}`);
  }

  const isTruncated = res.headers.get("x-export-truncated") === "true";
  const count = Number(res.headers.get("x-export-count") || 0);

  // Extract filename from Content-Disposition if present
  let filename = `${type}_export_${new Date().toISOString().split("T")[0]}.csv`;
  const disposition = res.headers.get("content-disposition");
  if (disposition && disposition.includes("filename=")) {
    const match = disposition.match(/filename="?([^"]+)"?/);
    if (match && match[1]) {
      filename = match[1];
    }
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return { success: true, filename, isTruncated, count };
}

export function ExportDropdown({ dateRange, className = "" }: ExportDropdownProps) {
  const { activeWorkspace } = useWorkspace();
  const { showToast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [exportingType, setExportingType] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Click outside listener to close dropdown
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleSingleExport = async (type: ExportType, label: string) => {
    try {
      setExportingType(type);
      const { filename, isTruncated, count } = await downloadDatasetCsv(
        type,
        dateRange,
        activeWorkspace?.id
      );
      if (isTruncated) {
        showToast({
          type: "warning",
          title: "Export Cap Reached (5,000 Rows)",
          message: `${filename} exceeds 5,000 records. First 5,000 rows exported.`,
        });
      } else {
        showToast({
          type: "success",
          title: "CSV Exported",
          message: `Successfully downloaded ${filename} (${count} records).`,
        });
      }
      setIsOpen(false);
    } catch (err: any) {
      console.error(`Export failed for ${type}:`, err);
      showToast({
        type: "error",
        title: "Export Failed",
        message: err.message || `Failed to export ${label}`,
      });
    } finally {
      setExportingType(null);
    }
  };

  const handleBundleExport = async () => {
    const allTypes: ExportType[] = ["brands", "products", "categories", "ads"];
    setExportingType("bundle");
    setBatchProgress({ current: 0, total: allTypes.length });

    const succeeded: string[] = [];
    const failed: string[] = [];

    for (let i = 0; i < allTypes.length; i++) {
      const type = allTypes[i];
      setBatchProgress({ current: i + 1, total: allTypes.length });
      try {
        await downloadDatasetCsv(type, dateRange, activeWorkspace?.id);
        succeeded.push(type);
      } catch (err) {
        console.error(`Batch export failed for ${type}:`, err);
        failed.push(type);
      }
      // 250ms spacing between triggers to prevent browser popup suppression
      if (i < allTypes.length - 1) {
        await new Promise((r) => setTimeout(r, 250));
      }
    }

    setExportingType(null);
    setBatchProgress(null);
    setIsOpen(false);

    if (failed.length === 0) {
      showToast({
        type: "success",
        title: "Complete Dataset Downloaded",
        message: `All ${succeeded.length} analytics datasets downloaded successfully.`,
      });
    } else if (succeeded.length > 0) {
      showToast({
        type: "warning",
        title: "Partial Export",
        message: `Downloaded ${succeeded.join(", ")}. Failed: ${failed.join(", ")}.`,
        action: {
          label: "Retry Failed",
          onClick: async () => {
            for (const f of failed) {
              await downloadDatasetCsv(f as ExportType, dateRange, activeWorkspace?.id).catch(() => {});
            }
          },
        },
      });
    } else {
      showToast({
        type: "error",
        title: "Export Failed",
        message: "Failed to download complete dataset.",
      });
    }
  };

  const isBusy = exportingType !== null;

  return (
    <div className={`relative inline-block text-left ${className}`} ref={dropdownRef}>
      <button
        onClick={() => !isBusy && setIsOpen((prev) => !prev)}
        disabled={isBusy}
        className="flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900/60 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer disabled:opacity-60 shadow-sm"
        title="Export analytics datasets to RFC 4180 CSV"
      >
        {isBusy ? (
          <Loader2 className="w-3.5 h-3.5 text-indigo-500 animate-spin" />
        ) : (
          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
        )}
        <span>
          {batchProgress
            ? `Downloading (${batchProgress.current}/${batchProgress.total})...`
            : "Export CSV"}
        </span>
        <ChevronDown
          className={`w-3 h-3 text-slate-400 transition-transform duration-150 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1.5 w-72 origin-top-right rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-xl shadow-slate-950/10 dark:shadow-black/40 z-50 py-1.5 focus:outline-none backdrop-blur-md animate-in fade-in-0 zoom-in-95 duration-100">
          <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800/80">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Export Analytics ({dateRange})
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Clean RFC 4180 format with Excel UTF-8 BOM
            </p>
          </div>

          <div className="py-1">
            {EXPORT_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const isItemBusy = exportingType === opt.type;
              return (
                <button
                  key={opt.type}
                  onClick={() => handleSingleExport(opt.type, opt.label)}
                  disabled={isBusy}
                  className="w-full text-left px-3 py-2 flex items-start space-x-2.5 hover:bg-slate-50 dark:hover:bg-slate-900/80 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <div className="mt-0.5 p-1 rounded-md bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 shrink-0">
                    {isItemBusy ? (
                      <Loader2 className="w-3.5 h-3.5 text-indigo-500 animate-spin" />
                    ) : (
                      <Icon className="w-3.5 h-3.5" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
                      {opt.label}
                    </p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                      {opt.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="border-t border-slate-100 dark:border-slate-800/80 pt-1 pb-0.5">
            <button
              onClick={handleBundleExport}
              disabled={isBusy}
              className="w-full text-left px-3 py-2 flex items-center space-x-2.5 hover:bg-indigo-50/70 dark:hover:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 transition-colors cursor-pointer disabled:opacity-50"
            >
              <div className="p-1 rounded-md bg-indigo-100/80 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 shrink-0">
                {exportingType === "bundle" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold truncate">Download Complete Dataset</p>
                <p className="text-[10px] text-indigo-500/80 dark:text-indigo-400/80 truncate">
                  Sequential download of all 4 CSV datasets
                </p>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
