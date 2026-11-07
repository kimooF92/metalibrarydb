"use client";

import { useState } from "react";
import { Plus, UploadCloud } from "lucide-react";
import { AddUrlForm } from "@/components/add-url-form";
import { ImportDropzone } from "@/components/import-dropzone";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

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

  const handleClose = () => {
    onClose();
    setTab("single");
  };

  const handleSuccess = () => {
    handleClose();
    onSuccess();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-lg p-6">
        <DialogTitle className="sr-only">Track Brand or Bulk Import</DialogTitle>
        <DialogDescription className="sr-only">
          Add single URL or import brands via CSV/XLSX
        </DialogDescription>

        {/* Modal Switcher Tabs */}
        <div className="flex items-center space-x-2 mb-4 pb-2.5 border-b border-slate-200 dark:border-slate-800/80">
          <button
            type="button"
            onClick={() => setTab("single")}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              tab === "single"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
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
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
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
      </DialogContent>
    </Dialog>
  );
}
