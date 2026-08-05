"use client";

import { useState, useRef } from "react";
import { UploadCloud, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle, Info, Play, X, AlertCircle } from "lucide-react";
import { ImportResultSummary } from "@/actions/import";

export function ImportDropzone() {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [summary, setSummary] = useState<ImportResultSummary | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleSelectedFile(e.target.files[0]);
    }
  };

  const handleSelectedFile = (selectedFile: File) => {
    setErrorMessage(null);
    const ext = selectedFile.name.split(".").pop()?.toLowerCase();
    if (ext !== "csv" && ext !== "xlsx") {
      setErrorMessage("Please upload a valid CSV or XLSX file.");
      return;
    }
    setFile(selectedFile);
    setSummary(null);
    setConfirmed(false);
  };

  const uploadFile = async () => {
    if (!file) return;

    setUploading(true);
    setSummary(null);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/import", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data: ImportResultSummary = await res.json();
        setSummary(data);
      } else {
        const errData = await res.json().catch(() => null);
        setErrorMessage(errData?.error || "Failed to import file. Please check file formatting.");
      }
    } catch (err) {
      console.error("Upload failed", err);
      setErrorMessage("Network error during file upload.");
    } finally {
      setUploading(false);
    }
  };

  const confirmQueueExecution = async () => {
    setConfirming(true);
    try {
      const res = await fetch("/api/queue/confirm", { method: "POST" });
      if (res.ok) {
        setConfirmed(true);
      }
    } catch (err) {
      console.error("Failed to confirm queue", err);
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Error Message Banner */}
      {errorMessage && (
        <div className="mb-4 flex items-center justify-between bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs p-3.5 rounded-xl">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="p-1 hover:text-white transition-colors"
            aria-label="Dismiss error"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Drop Area */}
      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative glass-card rounded-2xl p-10 text-center border-2 border-dashed transition-all cursor-pointer ${
          dragActive
            ? "border-indigo-500 bg-indigo-500/10"
            : "border-slate-300 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-700 bg-white dark:bg-slate-950/40"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx"
          onChange={handleChange}
          className="hidden"
        />

        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-550 dark:text-indigo-400">
            <UploadCloud className="w-8 h-8" />
          </div>

          <div>
            <p className="text-base font-semibold text-slate-800 dark:text-slate-200">
              Drag & Drop your CSV or XLSX file here
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Supports files with Meta Ad Library search URLs
            </p>
          </div>

          {file && (
            <div className="inline-flex items-center space-x-2 bg-slate-100 dark:bg-slate-900 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-200">
              <FileSpreadsheet className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
              <span className="font-medium">{file.name}</span>
              <span className="text-slate-450 dark:text-slate-500">
                ({(file.size / 1024).toFixed(1)} KB)
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                  setSummary(null);
                  setErrorMessage(null);
                }}
                aria-label="Remove selected file"
                className="p-1 text-slate-500 dark:text-slate-400 hover:text-slate-750 dark:hover:text-slate-200 transition-colors ml-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Action Button */}
      {file && !summary && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={uploadFile}
            disabled={uploading}
            className="flex items-center space-x-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-medium px-8 py-3 rounded-xl shadow-lg shadow-indigo-600/25 transition-all cursor-pointer disabled:opacity-50"
          >
            {uploading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Processing Import...</span>
              </>
            ) : (
              <>
                <UploadCloud className="w-5 h-5" />
                <span>Upload & Process Import</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Import Summary Results & Large Import Confirmation (PRD §15/§16) */}
      {summary && (
        <div className="mt-8 glass-card rounded-2xl p-6 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center space-x-2 mb-4 pb-3 border-b border-slate-200 dark:border-slate-800">
            <CheckCircle2 className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
              Import Completed Summary
            </h3>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="bg-slate-100 dark:bg-slate-900/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="text-xs text-slate-500 dark:text-slate-400">Total Rows</div>
              <div className="text-xl font-bold text-slate-800 dark:text-slate-100 mt-0.5">
                {summary.totalRows}
              </div>
            </div>
            <div className="bg-emerald-500/10 p-3.5 rounded-xl border border-emerald-500/20">
              <div className="text-xs text-emerald-600 dark:text-emerald-400">Imported</div>
              <div className="text-xl font-bold text-emerald-700 dark:text-emerald-300 mt-0.5">
                {summary.imported}
              </div>
            </div>
            <div className="bg-amber-500/10 p-3.5 rounded-xl border border-amber-500/20">
              <div className="text-xs text-amber-600 dark:text-amber-400">Duplicates Removed</div>
              <div className="text-xl font-bold text-amber-700 dark:text-amber-300 mt-0.5">
                {summary.duplicates}
              </div>
            </div>
            <div className="bg-rose-500/10 p-3.5 rounded-xl border border-rose-500/20">
              <div className="text-xs text-rose-600 dark:text-rose-400">Invalid / Failed</div>
              <div className="text-xl font-bold text-rose-700 dark:text-rose-300 mt-0.5">
                {summary.failed}
              </div>
            </div>
          </div>

          {/* Large Import Manual Confirmation Box (PRD §15/§16) */}
          {summary.autoStartThresholdExceeded ? (
            <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl p-5">
              <div className="flex items-start space-x-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-amber-700 dark:text-amber-300">
                    Large Queue Batch Notice
                  </h4>
                  <p className="text-xs text-amber-800 dark:text-amber-200/80 mt-1 leading-relaxed">
                    You have queued <strong>{summary.imported.toLocaleString()}</strong> URLs.
                    At configured system rate caps (2,400 scans/day), processing this batch will take approximately{" "}
                    <strong>{summary.estimatedDaysToComplete} day(s)</strong> to complete.
                  </p>

                  {!confirmed ? (
                    <button
                      onClick={confirmQueueExecution}
                      disabled={confirming}
                      className="mt-4 flex items-center space-x-2 bg-amber-500 hover:bg-amber-450 text-slate-950 font-bold text-xs px-5 py-2.5 rounded-lg shadow-md transition-all cursor-pointer disabled:opacity-50"
                    >
                      {confirming ? (
                        <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                      <span>Confirm & Start Worker Queue</span>
                    </button>
                  ) : (
                    <div className="mt-3 flex items-center space-x-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      <span>Queue execution confirmed! Worker will process in background.</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center space-x-2 text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
              <Info className="w-4 h-4 text-indigo-500 dark:text-indigo-400 shrink-0" />
              <span>
                Small import queued. Worker will automatically process jobs during local runs.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
