"use client";

import { useState, useEffect } from "react";
import {
  X,
  Sparkles,
  Copy,
  Check,
  Download,
  Brain,
  Zap,
  ShoppingBag,
  ShieldAlert,
  Loader2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  FileText,
} from "lucide-react";
import { TrackedPage } from "@/types";
import { useToast } from "@/components/toast-context";

export type DossierPersona = "strategic" | "media_buyer" | "product_scout" | "counter_intel";

interface ExportDossierModalProps {
  page: TrackedPage | null;
  isOpen: boolean;
  onClose: () => void;
}

interface PersonaOption {
  id: DossierPersona;
  title: string;
  badge: string;
  icon: typeof Brain;
  tagline: string;
  description: string;
}

const PERSONA_OPTIONS: PersonaOption[] = [
  {
    id: "strategic",
    title: "Strategic Analyst",
    badge: "Default",
    icon: Brain,
    tagline: "Market health, scaling velocity & strategic growth trajectory",
    description:
      "Calculates growth phase (0-100 score), ad scaling momentum, catalog breadth, and high-level D2C market positioning.",
  },
  {
    id: "media_buyer",
    title: "Media Buyer & Creative",
    badge: "Campaigns",
    icon: Zap,
    tagline: "Creative fatigue, churn diagnostic & high-converting hooks",
    description:
      "Analyzes creative lifespan, video vs static ratios, CTA conversion friction, and ad refresh windows.",
  },
  {
    id: "product_scout",
    title: "Product Hunter & Scout",
    badge: "Dropshipping",
    icon: ShoppingBag,
    tagline: "Breakout winner SKUs, sub-niche trends & margin viability",
    description:
      "Surfaces top-performing products, pricing elasticity, offer mechanics, and prioritized sourcing recommendations.",
  },
  {
    id: "counter_intel",
    title: "Counter-Intelligence",
    badge: "Competitive",
    icon: ShieldAlert,
    tagline: "Competitor vulnerabilities, blind spots & attack angles",
    description:
      "Pinpoints competitor weaknesses, neglected market angles, and strategies to build superior offers that steal traffic.",
  },
];

export function ExportDossierModal({ page, isOpen, onClose }: ExportDossierModalProps) {
  const { showToast } = useToast();
  const [selectedPersona, setSelectedPersona] = useState<DossierPersona>("strategic");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [previewPrompt, setPreviewPrompt] = useState<string>("");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Fetch preview when modal opens or persona changes
  useEffect(() => {
    if (!isOpen || !page) return;

    let isMounted = true;
    const fetchPreview = async () => {
      try {
        setLoadingPreview(true);
        const res = await fetch(
          `/api/export/brand-dossier?pageId=${encodeURIComponent(page.id)}&persona=${selectedPersona}&format=json`
        );
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setPreviewPrompt(data.prompt || "");
          }
        }
      } catch (err) {
        console.error("Failed to load prompt preview", err);
      } finally {
        if (isMounted) setLoadingPreview(false);
      }
    };

    fetchPreview();

    return () => {
      isMounted = false;
    };
  }, [isOpen, page, selectedPersona]);

  if (!isOpen || !page) return null;

  const brandName = page.displayName || `Brand ${page.pageId || page.id}`;

  const handleCopyPrompt = async () => {
    try {
      setLoading(true);
      let promptText = previewPrompt;

      if (!promptText) {
        const res = await fetch(
          `/api/export/brand-dossier?pageId=${encodeURIComponent(page.id)}&persona=${selectedPersona}&format=json`
        );
        if (!res.ok) throw new Error("Failed to generate prompt");
        const data = await res.json();
        promptText = data.prompt;
      }

      await navigator.clipboard.writeText(promptText);
      setCopied(true);
      showToast({
        type: "success",
        title: "Prompt Copied to Clipboard!",
        message: `Ready to paste into Claude, ChatGPT, Gemini, or DeepSeek for ${brandName}.`,
        duration: 4000,
      });

      setTimeout(() => setCopied(false), 2500);
    } catch (err: any) {
      console.error("Copy error:", err);
      showToast({
        type: "error",
        title: "Copy Failed",
        message: err.message || "Could not copy prompt to clipboard.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    try {
      const downloadUrl = `/api/export/brand-dossier?pageId=${encodeURIComponent(
        page.id
      )}&persona=${selectedPersona}&format=download`;
      
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.setAttribute("download", "");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showToast({
        type: "info",
        title: "Downloading Brand Dossier",
        message: `Generated Markdown file with complete surveillance history for ${brandName}.`,
      });
    } catch (err) {
      console.error("Download error:", err);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-xl glass-panel rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] bg-white dark:bg-slate-900"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800/80 bg-slate-50/80 dark:bg-slate-900/50">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Export LLM Intelligence Dossier
                </h2>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-xs sm:max-w-sm">
                Target: <span className="font-semibold text-slate-700 dark:text-slate-300">{brandName}</span>
                {page.currentResults !== null && ` (${page.currentResults} active ads)`}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5 text-slate-800 dark:text-slate-200 text-xs">
          {/* Persona Selection Header */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                1. Select Analyst Persona
              </label>
              <span className="text-[11px] text-slate-400">
                Tailors analytical framework & strategic questions
              </span>
            </div>

            {/* Persona Radio Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {PERSONA_OPTIONS.map((p) => {
                const Icon = p.icon;
                const isSelected = selectedPersona === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => setSelectedPersona(p.id)}
                    className={`cursor-pointer rounded-xl p-3 border transition-all duration-150 relative ${
                      isSelected
                        ? "bg-indigo-50/60 dark:bg-indigo-950/40 border-indigo-500/60 dark:border-indigo-500/50 shadow-xs ring-1 ring-indigo-500/30"
                        : "bg-slate-50/50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-100/50 dark:hover:bg-slate-800/30"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-1.5">
                      <div className="flex items-center space-x-2">
                        <div
                          className={`p-1.5 rounded-lg ${
                            isSelected
                              ? "bg-indigo-500 text-white"
                              : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-semibold text-slate-900 dark:text-slate-100 text-xs">
                          {p.title}
                        </span>
                      </div>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                          isSelected
                            ? "bg-indigo-500/20 text-indigo-600 dark:text-indigo-300"
                            : "bg-slate-200/60 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                        }`}
                      >
                        {p.badge}
                      </span>
                    </div>
                    <p className="text-[11px] font-medium text-slate-700 dark:text-slate-300 leading-snug">
                      {p.tagline}
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                      {p.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Prompt Preview Accordion */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50/50 dark:bg-slate-950/40">
            <button
              onClick={() => setShowPreview((s) => !s)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100/60 dark:hover:bg-slate-900/60 transition-colors"
            >
              <div className="flex items-center space-x-2">
                <FileText className="w-3.5 h-3.5 text-indigo-500" />
                <span>Prompt Structure Preview</span>
                {loadingPreview && <Loader2 className="w-3 h-3 animate-spin text-indigo-500 ml-1" />}
              </div>
              <div className="flex items-center space-x-1 text-[11px] text-slate-400">
                <span>{showPreview ? "Hide" : "Inspect Prompt"}</span>
                {showPreview ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </div>
            </button>

            {showPreview && (
              <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 max-h-52 overflow-y-auto font-mono text-[10px] text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                {loadingPreview ? (
                  <div className="flex items-center justify-center py-6 text-slate-400">
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Assembling telemetry and prompt template...
                  </div>
                ) : (
                  previewPrompt || "Loading prompt preview..."
                )}
              </div>
            )}
          </div>

          {/* Quick Launch LLM Links */}
          <div className="bg-indigo-50/40 dark:bg-indigo-950/20 rounded-xl p-3 border border-indigo-200/50 dark:border-indigo-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold text-indigo-900 dark:text-indigo-200">
                💡 Instant LLM Workflow
              </p>
              <p className="text-[10px] text-indigo-700 dark:text-indigo-400">
                Click <strong>Copy Prompt</strong>, then paste into your preferred AI:
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <a
                href="https://claude.ai/new"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-medium text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-300 dark:hover:border-indigo-700 transition-all shadow-2xs"
              >
                <span>Claude</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
              <a
                href="https://chatgpt.com"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-medium text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-300 dark:hover:border-indigo-700 transition-all shadow-2xs"
              >
                <span>ChatGPT</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
              <a
                href="https://gemini.google.com"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-medium text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-300 dark:hover:border-indigo-700 transition-all shadow-2xs"
              >
                <span>Gemini</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          </div>
        </div>

        {/* Modal Footer / Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 px-6 py-4 border-t border-slate-200 dark:border-slate-800/80 bg-slate-50/80 dark:bg-slate-900/50">
          <span className="text-[11px] text-slate-500 dark:text-slate-400 text-center sm:text-left">
            Includes ad velocity, product timeline & pre-computed signals
          </span>

          <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
            <button
              onClick={handleDownload}
              className="flex-1 sm:flex-none inline-flex items-center justify-center space-x-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-semibold transition-all cursor-pointer shadow-2xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download .md</span>
            </button>

            <button
              onClick={handleCopyPrompt}
              disabled={loading}
              className={`flex-1 sm:flex-none inline-flex items-center justify-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-sm ${
                copied
                  ? "bg-emerald-600 text-white"
                  : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20"
              }`}
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : copied ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copied ? "Copied Prompt!" : "Copy Prompt"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
