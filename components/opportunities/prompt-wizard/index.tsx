"use client";

import React from "react";
import { WizardProvider, useWizard } from "./wizard-context";
import { Step1Scope } from "./step-1-scope";
import { Step2BrandSignals } from "./step-2-brand-signals";
import { Step3CodParameters } from "./step-3-cod-parameters";
import { Step4LlmTheme } from "./step-4-llm-theme";
import { Step5ExportAudit } from "./step-5-export-audit";
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  Clock,
  TrendingUp,
  DollarSign,
  Palette,
  CheckCircle2,
} from "lucide-react";

const STEPS = [
  { id: 1, title: "Telemetry Scope", icon: Clock },
  { id: 2, title: "Brand Signals", icon: TrendingUp },
  { id: 3, title: "COD Strategy", icon: DollarSign },
  { id: 4, title: "LLM & Theme", icon: Palette },
  { id: 5, title: "Export & Audit", icon: CheckCircle2 },
];

function WizardShell() {
  const { currentStep, setCurrentStep, nextStep, prevStep, resetConfig } = useWizard();

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="glass-card rounded-2xl p-6 border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-950/40 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-indigo-500/10 via-teal-500/10 to-transparent rounded-full blur-3xl -z-10 pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                <Sparkles className="w-5 h-5" />
              </span>
              <h2 className="text-lg font-black text-slate-900 dark:text-slate-100">
                Frontier AI Market Opportunity Prompt Wizard
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
              Synthesize empirical market telemetry (scaling deltas, active ad counts, clone traps, and COD price tiers)
              into a high-conviction prompt for Claude 3.7 Sonnet, ChatGPT o3, or Gemini 2.5 Pro to generate a complete interactive HTML dossier.
            </p>
          </div>

          <button
            type="button"
            onClick={resetConfig}
            className="self-start md:self-auto flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors cursor-pointer"
            title="Reset wizard to default parameters"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Defaults</span>
          </button>
        </div>
      </div>

      {/* 2. 5-Step Progress Stepper */}
      <div className="glass-card rounded-2xl p-3 border border-slate-200 dark:border-slate-800 bg-white/40 dark:bg-slate-950/40 shadow-sm">
        <div className="grid grid-cols-5 gap-2">
          {STEPS.map((s) => {
            const Icon = s.icon;
            const isCurrent = currentStep === s.id;
            const isCompleted = currentStep > s.id;

            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setCurrentStep(s.id)}
                className={`flex items-center justify-center sm:justify-start space-x-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  isCurrent
                    ? "bg-indigo-600 text-white shadow-sm"
                    : isCompleted
                    ? "bg-teal-500/10 text-teal-700 dark:text-teal-400 hover:bg-teal-500/20"
                    : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-900"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline truncate">{s.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Wizard Active Step Content */}
      <div className="glass-card rounded-2xl p-6 border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-950/40 shadow-sm min-h-[380px]">
        {currentStep === 1 && <Step1Scope />}
        {currentStep === 2 && <Step2BrandSignals />}
        {currentStep === 3 && <Step3CodParameters />}
        {currentStep === 4 && <Step4LlmTheme />}
        {currentStep === 5 && <Step5ExportAudit />}
      </div>

      {/* 4. Bottom Navigation Controls */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={prevStep}
          disabled={currentStep === 1}
          className="flex items-center space-x-1.5 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <div className="text-xs text-slate-400 font-medium">
          Step {currentStep} of 5
        </div>

        {currentStep < 5 ? (
          <button
            type="button"
            onClick={nextStep}
            className="flex items-center space-x-1.5 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md transition-all cursor-pointer"
          >
            <span>Continue</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setCurrentStep(1)}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-200 transition-all cursor-pointer"
          >
            <span>Start Over</span>
          </button>
        )}
      </div>
    </div>
  );
}

export function PromptWizard() {
  return (
    <WizardProvider>
      <WizardShell />
    </WizardProvider>
  );
}
