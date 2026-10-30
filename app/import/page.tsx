"use client";

import { ImportDropzone } from "@/components/import-dropzone";
import { FileSpreadsheet, ArrowLeft, UploadCloud, CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { ContentCard } from "@/components/ui/content-card";

export default function ImportPage() {
  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800/80">
        <div>
          <div className="flex items-center space-x-2">
            <Link
              href="/brands"
              className="text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              Bulk File Import
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 ml-7">
            Upload CSV or XLSX spreadsheets containing Meta Ad Library URLs
          </p>
        </div>

        <div className="flex items-center space-x-2 text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-900/60 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800">
          <FileSpreadsheet className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
          <span>Accepted formats: .csv, .xlsx</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Dropzone Card (Takes 2 cols) */}
        <div className="lg:col-span-2">
          <ContentCard
            title="Upload Spreadsheet"
            description="Drag and drop or select your prepared spreadsheet file to batch import competitors"
            icon={UploadCloud}
          >
            <ImportDropzone />
          </ContentCard>
        </div>

        {/* Formatting & Guidance Card (Takes 1 col) */}
        <div className="space-y-6">
          <ContentCard
            title="Formatting Guide"
            description="Ensure automatic column detection and duplicate handling"
            icon={FileSpreadsheet}
          >
            <div className="space-y-3.5 text-xs text-slate-600 dark:text-slate-400">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200/80 dark:border-slate-800/80 space-y-1.5">
                <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center space-x-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                  <span>Required Column</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  Column name: <code className="px-1 py-0.5 rounded bg-slate-200/60 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 font-mono">url</code> or <code className="px-1 py-0.5 rounded bg-slate-200/60 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 font-mono">link</code> containing Meta Ad Library search links.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200/80 dark:border-slate-800/80 space-y-1.5">
                <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center space-x-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>Optional Columns</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  <code className="px-1 py-0.5 rounded bg-slate-200/60 dark:bg-slate-800 font-mono">brand_name</code>, <code className="px-1 py-0.5 rounded bg-slate-200/60 dark:bg-slate-800 font-mono">country</code> (2-letter ISO, default: TN).
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200/80 dark:border-slate-800/80 space-y-1.5">
                <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center space-x-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  <span>Deduplication</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  Existing tracked pages will be updated rather than duplicated, preserving historical scan timelines.
                </p>
              </div>
            </div>
          </ContentCard>
        </div>
      </div>
    </div>
  );
}
