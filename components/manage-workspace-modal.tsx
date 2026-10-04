"use client";

import React, { useState, useEffect } from "react";
import { useWorkspace, WorkspaceDeletionReview } from "@/components/workspace-context";
import { useToast } from "@/components/toast-context";
import {
  X,
  Globe,
  Plus,
  Loader2,
  Check,
  Trash2,
  AlertTriangle,
  ShieldAlert,
  FileText,
  ShoppingBag,
  Compass,
} from "lucide-react";

interface CountryPreset {
  countryCode: string;
  name: string;
  currency: string;
  currencySymbol: string;
  flag: string;
}

const PRESETS: CountryPreset[] = [
  { countryCode: "TN", name: "Tunisia", currency: "TND", currencySymbol: "DT", flag: "🇹🇳" },
  { countryCode: "MA", name: "Morocco", currency: "MAD", currencySymbol: "DH", flag: "🇲🇦" },
  { countryCode: "DZ", name: "Algeria", currency: "DZD", currencySymbol: "DA", flag: "🇩🇿" },
  { countryCode: "SA", name: "Saudi Arabia", currency: "SAR", currencySymbol: "SR", flag: "🇸🇦" },
  { countryCode: "AE", name: "United Arab Emirates", currency: "AED", currencySymbol: "AED", flag: "🇦🇪" },
  { countryCode: "EG", name: "Egypt", currency: "EGP", currencySymbol: "E£", flag: "🇪🇬" },
  { countryCode: "FR", name: "France", currency: "EUR", currencySymbol: "€", flag: "🇫🇷" },
  { countryCode: "US", name: "United States", currency: "USD", currencySymbol: "$", flag: "🇺🇸" },
];

export function ManageWorkspaceModal() {
  const {
    isCreateModalOpen,
    setIsCreateModalOpen,
    editingWorkspace,
    setEditingWorkspace,
    createWorkspace,
    updateWorkspace,
    deleteWorkspace,
    getWorkspaceDeletionReview,
  } = useWorkspace();

  const { showToast } = useToast();

  const [name, setName] = useState("");
  const [countryCode, setCountryCode] = useState("MA");
  const [currency, setCurrency] = useState("MAD");
  const [currencySymbol, setCurrencySymbol] = useState("DH");
  const [flag, setFlag] = useState("🇲🇦");
  const [description, setDescription] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Strict Deletion Review State
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isLoadingReview, setIsLoadingReview] = useState(false);
  const [deletionReview, setDeletionReview] = useState<WorkspaceDeletionReview | null>(null);
  const [confirmInput, setConfirmInput] = useState("");
  const [understandCheckbox, setUnderstandCheckbox] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Sync state when editing or opening modal
  useEffect(() => {
    if (editingWorkspace) {
      setName(editingWorkspace.name || "");
      setCountryCode(editingWorkspace.countryCode || "TN");
      setCurrency(editingWorkspace.currency || "TND");
      setCurrencySymbol(editingWorkspace.currencySymbol || "DT");
      setFlag(editingWorkspace.flag || "🇹🇳");
      setDescription(editingWorkspace.description || "");
      setIsDefault(editingWorkspace.isDefault || false);
    } else {
      setName("");
      setCountryCode("MA");
      setCurrency("MAD");
      setCurrencySymbol("DH");
      setFlag("🇲🇦");
      setDescription("");
      setIsDefault(false);
    }
    setIsReviewOpen(false);
    setDeletionReview(null);
    setConfirmInput("");
    setUnderstandCheckbox(false);
  }, [editingWorkspace, isCreateModalOpen]);

  if (!isCreateModalOpen && !editingWorkspace) return null;

  const handlePresetSelect = (preset: CountryPreset) => {
    setCountryCode(preset.countryCode);
    setCurrency(preset.currency);
    setCurrencySymbol(preset.currencySymbol);
    setFlag(preset.flag);
    if (!name || PRESETS.some((p) => p.name === name)) {
      setName(preset.name);
    }
  };

  const closeModal = () => {
    setIsCreateModalOpen(false);
    setEditingWorkspace(null);
    setIsReviewOpen(false);
    setDeletionReview(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast({ type: "error", title: "Workspace name is required" });
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingWorkspace) {
        await updateWorkspace(editingWorkspace.id, {
          name: name.trim(),
          countryCode: countryCode.trim().toUpperCase(),
          currency: currency.trim().toUpperCase(),
          currencySymbol: currencySymbol.trim(),
          flag: flag.trim() || "🌐",
          description: description.trim() || undefined,
          isDefault,
        });
        showToast({ type: "success", title: `Workspace "${name}" updated successfully!` });
      } else {
        await createWorkspace({
          name: name.trim(),
          countryCode: countryCode.trim().toUpperCase(),
          currency: currency.trim().toUpperCase(),
          currencySymbol: currencySymbol.trim(),
          flag: flag.trim() || "🌐",
          description: description.trim() || undefined,
        });
        showToast({ type: "success", title: `Workspace "${name}" created and activated!` });
      }
      closeModal();
    } catch (err: any) {
      showToast({ type: "error", title: err.message || "Failed to save workspace" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartDeleteReview = async () => {
    if (!editingWorkspace) return;
    setIsLoadingReview(true);
    setIsReviewOpen(true);
    setConfirmInput("");
    setUnderstandCheckbox(false);
    try {
      const rev = await getWorkspaceDeletionReview(editingWorkspace.id);
      setDeletionReview(rev);
    } catch (err: any) {
      showToast({ type: "error", title: err.message || "Failed to load deletion review" });
      setIsReviewOpen(false);
    } finally {
      setIsLoadingReview(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletionReview || !editingWorkspace) return;
    if (confirmInput.trim() !== deletionReview.workspace.name.trim()) {
      showToast({ type: "error", title: "Confirmation name does not match exactly" });
      return;
    }
    if (!understandCheckbox) {
      showToast({ type: "error", title: "Please confirm that you understand this action is permanent" });
      return;
    }

    setIsDeleting(true);
    try {
      await deleteWorkspace(editingWorkspace.id, confirmInput.trim());
      showToast({
        type: "success",
        title: `Workspace "${editingWorkspace.name}" deleted. Switched to default workspace.`,
      });
      closeModal();
    } catch (err: any) {
      showToast({ type: "error", title: err.message || "Failed to delete workspace" });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-lg">
              {isReviewOpen ? "⚠️" : flag || "🌐"}
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {isReviewOpen
                  ? "Strict Deletion Review"
                  : editingWorkspace
                  ? "Edit Workspace"
                  : "Create New Workspace"}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {isReviewOpen
                  ? `Audit impact before permanently deleting "${editingWorkspace?.name}"`
                  : "Isolate tracked pages, products, ads, and discovery runs per market"}
              </p>
            </div>
          </div>
          <button
            onClick={closeModal}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* View Mode 1: Strict Deletion Review Modal Body */}
        {isReviewOpen ? (
          <div className="p-6 space-y-5 overflow-y-auto flex-1">
            {isLoadingReview ? (
              <div className="py-12 flex flex-col items-center justify-center space-y-3">
                <Loader2 className="w-7 h-7 text-indigo-500 animate-spin" />
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  Auditing workspace resources and database impact...
                </p>
              </div>
            ) : !deletionReview ? (
              <div className="py-8 text-center text-xs text-red-500">
                Failed to load deletion review details.
              </div>
            ) : !deletionReview.isDeletable ? (
              /* Blocked State (e.g. is Default workspace or only workspace) */
              <div className="space-y-4">
                <div className="p-4 rounded-xl border border-amber-300 dark:border-amber-800/80 bg-amber-50 dark:bg-amber-950/30 flex items-start space-x-3">
                  <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-amber-900 dark:text-amber-200">
                      Deletion Prohibited by System Invariant
                    </h4>
                    <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-1">
                      {deletionReview.blockReason}
                    </p>
                  </div>
                </div>

                <div className="flex justify-end pt-3">
                  <button
                    type="button"
                    onClick={() => setIsReviewOpen(false)}
                    className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition"
                  >
                    Back to Workspace Settings
                  </button>
                </div>
              </div>
            ) : (
              /* Active Deletion Review & Confirmation Challenge */
              <div className="space-y-4">
                {/* Warning Callout */}
                <div className="p-3.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/60 dark:bg-red-950/30 flex items-start space-x-2.5">
                  <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                  <div className="text-[11px] text-red-900 dark:text-red-200">
                    <span className="font-bold block">Permanent & Irreversible Destruction</span>
                    Deleting this workspace will immediately and permanently purge all associated
                    intelligence and tracking data from Supabase.
                  </div>
                </div>

                {/* Resource Impact Grid */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
                    Resources to be Destroyed
                  </label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center space-x-2.5">
                      <FileText className="w-4 h-4 text-blue-500" />
                      <div>
                        <span className="font-bold text-slate-800 dark:text-slate-200 block">
                          {deletionReview.stats.pageCount} Pages
                        </span>
                        <span className="text-[10px] text-slate-500">Tracked Pages & Scans</span>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center space-x-2.5">
                      <ShoppingBag className="w-4 h-4 text-emerald-500" />
                      <div>
                        <span className="font-bold text-slate-800 dark:text-slate-200 block">
                          {deletionReview.stats.productCount} Products
                        </span>
                        <span className="text-[10px] text-slate-500">Scraped Products</span>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center space-x-2.5">
                      <Globe className="w-4 h-4 text-indigo-500" />
                      <div>
                        <span className="font-bold text-slate-800 dark:text-slate-200 block">
                          {deletionReview.stats.domainCount} Domains
                        </span>
                        <span className="text-[10px] text-slate-500">Brand Portfolios</span>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center space-x-2.5">
                      <Compass className="w-4 h-4 text-amber-500" />
                      <div>
                        <span className="font-bold text-slate-800 dark:text-slate-200 block">
                          {deletionReview.stats.discoveryRunsCount} Runs
                        </span>
                        <span className="text-[10px] text-slate-500">Discovery History</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Challenge Confirmation Input */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                  <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                    To confirm deletion, type{" "}
                    <span className="font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-red-600 dark:text-red-400 font-bold select-all">
                      {deletionReview.workspace.name}
                    </span>{" "}
                    below:
                  </label>
                  <input
                    type="text"
                    value={confirmInput}
                    onChange={(e) => setConfirmInput(e.target.value)}
                    placeholder={deletionReview.workspace.name}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition font-medium"
                  />
                </div>

                {/* Mandatory Checkbox */}
                <label className="flex items-start space-x-2.5 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition select-none">
                  <input
                    type="checkbox"
                    checked={understandCheckbox}
                    onChange={(e) => setUnderstandCheckbox(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded text-red-600 focus:ring-red-500 border-slate-300 dark:border-slate-700"
                  />
                  <span className="text-[11px] text-slate-600 dark:text-slate-400 leading-tight">
                    I understand that this action is irreversible and all tracked pages, products, ads,
                    and intelligence in this workspace will be permanently erased.
                  </span>
                </label>

                {/* Action Buttons */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsReviewOpen(false)}
                    disabled={isDeleting}
                    className="px-4 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDelete}
                    disabled={
                      isDeleting ||
                      confirmInput.trim() !== deletionReview.workspace.name.trim() ||
                      !understandCheckbox
                    }
                    className="flex items-center space-x-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-red-600 hover:bg-red-700 text-white shadow-sm transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isDeleting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Purging Workspace...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Permanently Delete Workspace</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* View Mode 2: Standard Create / Edit Workspace Form */
          <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
            {/* Quick Preset Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Quick Country Preset
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {PRESETS.map((p) => {
                  const isSelected = countryCode === p.countryCode;
                  return (
                    <button
                      key={p.countryCode}
                      type="button"
                      onClick={() => handlePresetSelect(p)}
                      className={`flex items-center justify-center space-x-1.5 px-2.5 py-1.5 text-xs rounded-xl border font-medium transition cursor-pointer ${
                        isSelected
                          ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-600 shadow-sm"
                          : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      <span>{p.flag}</span>
                      <span className="truncate">{p.countryCode}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Workspace Name & Flag */}
            <div className="grid grid-cols-4 gap-3">
              <div className="col-span-3">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Workspace Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Morocco, Algeria Store..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Flag / Icon
                </label>
                <input
                  type="text"
                  value={flag}
                  onChange={(e) => setFlag(e.target.value)}
                  className="w-full px-3 py-2 text-center text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                />
              </div>
            </div>

            {/* Country Code, Currency, Symbol */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Country Code
                </label>
                <input
                  type="text"
                  required
                  maxLength={2}
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
                  placeholder="MA"
                  className="w-full px-3 py-2 text-xs uppercase font-mono rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Currency Code
                </label>
                <input
                  type="text"
                  required
                  maxLength={5}
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  placeholder="MAD"
                  className="w-full px-3 py-2 text-xs uppercase font-mono rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Display Symbol
                </label>
                <input
                  type="text"
                  required
                  maxLength={5}
                  value={currencySymbol}
                  onChange={(e) => setCurrencySymbol(e.target.value)}
                  placeholder="DH"
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Description (Optional)
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Moroccan market intelligence & competitors"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
              />
            </div>

            {/* Default Workspace Checkbox (Only when editing) */}
            {editingWorkspace && (
              <label className="flex items-center space-x-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-700"
                />
                <div>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                    Set as Default Workspace
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                    New browser sessions and fallbacks will open this workspace first
                  </span>
                </div>
              </label>
            )}

            {/* Danger Zone: Delete Workspace */}
            {editingWorkspace && (
              <div className="pt-2">
                {editingWorkspace.isDefault ? (
                  <div className="p-3.5 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/20 flex items-start space-x-2.5">
                    <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="text-[11px] text-amber-800 dark:text-amber-300">
                      <span className="font-bold block">Protected Default Workspace</span>
                      This workspace is designated as the system default and cannot be deleted. If you need to delete it, set another workspace as default first.
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl border border-red-200/80 dark:border-red-900/60 bg-red-50/40 dark:bg-red-950/20 flex items-center justify-between">
                    <div className="flex items-start space-x-2.5">
                      <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-xs font-bold text-red-900 dark:text-red-300 block">
                          Danger Zone
                        </span>
                        <span className="text-[10px] text-red-600/80 dark:text-red-400">
                          Permanently delete this workspace and all associated tracked data
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleStartDeleteReview}
                      className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-100/60 dark:hover:bg-red-950/60 transition cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Workspace...</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Footer Actions */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={closeModal}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center space-x-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    {editingWorkspace ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                    <span>{editingWorkspace ? "Save Changes" : "Create Workspace"}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
