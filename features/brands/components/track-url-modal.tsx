"use client";

import { useState } from "react";
import { X, Plus, UploadCloud } from "lucide-react";
import { AddUrlForm } from "@/components/add-url-form";
import { ImportDropzone } from "@/components/import-dropzone";

interface TrackUrlModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function TrackUrlModal({
  isOpen,
  onClose,
  onSuccess,
}: TrackUrlModalProps) {
  const [tab, setTab] = useState<"single" | "bulk">("single");

  if (!isOpen) return null;

  const handleClose = () => {
    onClose();
    setTab("single");
  };

  const handleSuccess = () => {
    handleClose();
    onSuccess();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Switcher Tabs */}
        <div className="flex items-center space-x-2 mb-4 pb-2.5 border-b border-slate-800/80">
          <button
            type="button"
            onClick={() => setTab("single")}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              tab === "single"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Single URL / Domain</span>
          </button>

          <button
            type="button"
            onClick={() => setTab("bulk")}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              tab === "bulk"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>Bulk File Import (CSV / XLSX)</span>
          </button>
        </div>

        {tab === "single" ? (
          <AddUrlForm onSuccess={handleSuccess} />
        ) : (
          <div className="space-y-4">
            <ImportDropzone />
          </div>
        )}
      </div>
    </div>
  );
}

