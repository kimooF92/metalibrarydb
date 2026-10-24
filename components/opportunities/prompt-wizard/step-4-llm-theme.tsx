"use client";

import React from "react";
import { useWizard } from "./wizard-context";
import { LlmModelPreset, HtmlTheme } from "@/lib/opportunities/prompt-types";
import { Cpu, Palette, CheckCircle, Check } from "lucide-react";

interface ModelOption {
  id: LlmModelPreset;
  title: string;
  badge: string;
  desc: string;
}

const MODELS: ModelOption[] = [
  {
    id: "claude",
    title: "Claude 3.7 Sonnet / Opus",
    badge: "Recommended",
    desc: "Strict XML tags, extended reasoning directive, and artifact delivery.",
  },
  {
    id: "chatgpt",
    title: "ChatGPT o3-mini / o1 / 4o",
    badge: "Advanced Analysis",
    desc: "Clean markdown headers and Python pandas code interpreter directives.",
  },
  {
    id: "gemini",
    title: "Gemini 2.5 Pro",
    badge: "Long Context",
    desc: "High-density system blocks with maximum empirical tabular comprehension.",
  },
  {
    id: "deepseek",
    title: "DeepSeek R1 / CoT",
    badge: "Chain-of-Thought",
    desc: "Explicit step-by-step reasoning scaffolds for open reasoning models.",
  },
];

interface ThemeOption {
  id: HtmlTheme;
  title: string;
  desc: string;
  colors: string[];
}

const THEMES: ThemeOption[] = [
  {
    id: "tactical-dark",
    title: "Tactical Dark Glassmorphism",
    desc: "Sleek dark mode (#030712) with glowing emerald & indigo KPI accents.",
    colors: ["bg-slate-950", "bg-emerald-500", "bg-indigo-500"],
  },
  {
    id: "clean-slate",
    title: "Modern Clean Slate",
    desc: "Crisp enterprise SaaS aesthetic with light gray cards and indigo badges.",
    colors: ["bg-slate-50", "bg-white", "bg-indigo-600"],
  },
  {
    id: "monochrome",
    title: "Executive Monochrome",
    desc: "Publication-grade high-contrast black & white styling with monospace metrics.",
    colors: ["bg-black", "bg-zinc-800", "bg-zinc-200"],
  },
];

export function Step4LlmTheme() {
  const { config, updateConfig } = useWizard();

  return (
    <div className="space-y-6">
      {/* 1. Target LLM */}
      <div>
        <div className="flex items-center space-x-2 mb-2">
          <Cpu className="w-4 h-4 text-indigo-500" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Target Frontier Model Optimization
          </h3>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          Calibrates prompt syntax, XML delimiters, and thinking instructions for your destination model.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {MODELS.map((model) => {
            const isSelected = config.targetLlm === model.id;
            return (
              <button
                key={model.id}
                type="button"
                onClick={() => updateConfig({ targetLlm: model.id })}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                  isSelected
                    ? "bg-indigo-500/10 border-indigo-500 text-slate-900 dark:text-slate-100 ring-1 ring-indigo-500"
                    : "bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold">{model.title}</span>
                  <span
                    className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold ${
                      isSelected
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                    }`}
                  >
                    {model.badge}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{model.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. HTML Theme */}
      <div>
        <div className="flex items-center space-x-2 mb-2">
          <Palette className="w-4 h-4 text-indigo-500" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            HTML Research Dossier Aesthetic
          </h3>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          Instructs the LLM on which color palette and visual styling to embed in the output HTML.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {THEMES.map((theme) => {
            const isSelected = config.htmlTheme === theme.id;
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => updateConfig({ htmlTheme: theme.id })}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? "bg-indigo-500/10 border-indigo-500 text-slate-900 dark:text-slate-100 ring-1 ring-indigo-500"
                    : "bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold">{theme.title}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-indigo-500" />}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">{theme.desc}</p>
                </div>
                <div className="flex items-center space-x-1.5">
                  {theme.colors.map((c, i) => (
                    <span key={i} className={`w-3.5 h-3.5 rounded-full border border-black/10 ${c}`} />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Output Specs Checklist */}
      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200/80 dark:border-slate-800/80">
        <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-2">
          Enforced HTML Output Invariants:
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-400">
          <div className="flex items-center space-x-1.5">
            <CheckCircle className="w-3.5 h-3.5 text-teal-500 shrink-0" />
            <span>Single-file self-contained HTML (zero external CDN scripts)</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <CheckCircle className="w-3.5 h-3.5 text-teal-500 shrink-0" />
            <span>Embedded vanilla JavaScript tab switcher</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <CheckCircle className="w-3.5 h-3.5 text-teal-500 shrink-0" />
            <span>Top 3 Winning Product Test Blueprints with Darija angles</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <CheckCircle className="w-3.5 h-3.5 text-teal-500 shrink-0" />
            <span>Printable styling (@media print) for clean PDF export</span>
          </div>
        </div>
      </div>
    </div>
  );
}
