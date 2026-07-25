"use client";

import { ImportDropzone } from "@/components/import-dropzone";
import { FileSpreadsheet, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function ImportPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div>
          <div className="flex items-center space-x-2">
            <Link
              href="/"
              className="text-slate-400 hover:text-slate-200 transition-colors p-1 rounded-lg hover:bg-slate-900"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">
              Bulk File Import
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1 ml-7">
            Upload CSV or XLSX spreadsheets containing Meta Ad Library URLs
          </p>
        </div>

        <div className="flex items-center space-x-2 text-xs text-slate-400 bg-slate-900/60 px-3 py-1.5 rounded-lg border border-slate-800">
          <FileSpreadsheet className="w-4 h-4 text-indigo-400" />
          <span>Accepted formats: .csv, .xlsx</span>
        </div>
      </div>

      {/* Import Dropzone Component */}
      <ImportDropzone />
    </div>
  );
}
