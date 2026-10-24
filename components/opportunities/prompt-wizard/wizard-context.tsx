"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import {
  WizardConfig,
  TelemetrySnapshot,
  DEFAULT_WIZARD_CONFIG,
  DEFAULT_COD_PARAMETERS,
  CodParameters,
  TimeWindow,
  LlmModelPreset,
  HtmlTheme,
} from "@/lib/opportunities/prompt-types";
import { useWorkspace } from "@/components/workspace-context";

interface WizardContextType {
  config: WizardConfig;
  updateConfig: (updates: Partial<WizardConfig>) => void;
  resetConfig: () => void;
  telemetry: TelemetrySnapshot | null;
  loadingTelemetry: boolean;
  telemetryError: string | null;
  currentStep: number;
  setCurrentStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  refreshTelemetry: () => Promise<void>;
}

const WizardContext = createContext<WizardContextType | null>(null);

function getStorageKey(workspaceId?: string) {
  return `opportunity_wizard_config_v1_${workspaceId || "default"}`;
}

/**
 * Robustly sanitizes and deep-validates persisted JSON state against schema and defaults.
 */
function sanitizeWizardConfig(parsed: any): WizardConfig {
  if (!parsed || typeof parsed !== "object") return DEFAULT_WIZARD_CONFIG;

  const validWindows: TimeWindow[] = ["7d", "14d", "30d"];
  const validModels: LlmModelPreset[] = ["claude", "chatgpt", "gemini", "deepseek"];
  const validThemes: HtmlTheme[] = ["tactical-dark", "clean-slate", "monochrome"];

  const timeWindow = validWindows.includes(parsed.timeWindow)
    ? parsed.timeWindow
    : DEFAULT_WIZARD_CONFIG.timeWindow;
  const targetLlm = validModels.includes(parsed.targetLlm)
    ? parsed.targetLlm
    : DEFAULT_WIZARD_CONFIG.targetLlm;
  const htmlTheme = validThemes.includes(parsed.htmlTheme)
    ? parsed.htmlTheme
    : DEFAULT_WIZARD_CONFIG.htmlTheme;

  const selectedCategories =
    Array.isArray(parsed.selectedCategories) && parsed.selectedCategories.length > 0
      ? parsed.selectedCategories.filter((c: any) => typeof c === "string")
      : DEFAULT_WIZARD_CONFIG.selectedCategories;

  const rawCod =
    parsed.codParameters && typeof parsed.codParameters === "object"
      ? parsed.codParameters
      : {};
  const targetPriceBands =
    Array.isArray(rawCod.targetPriceBands) && rawCod.targetPriceBands.length > 0
      ? rawCod.targetPriceBands.filter((b: any) => typeof b === "string")
      : DEFAULT_COD_PARAMETERS.targetPriceBands;

  const codParameters: CodParameters = {
    targetPriceBands:
      targetPriceBands.length > 0 ? targetPriceBands : DEFAULT_COD_PARAMETERS.targetPriceBands,
    minUnitMarginTnd:
      typeof rawCod.minUnitMarginTnd === "number" && !isNaN(rawCod.minUnitMarginTnd)
        ? rawCod.minUnitMarginTnd
        : DEFAULT_COD_PARAMETERS.minUnitMarginTnd,
    confirmationRatePct:
      typeof rawCod.confirmationRatePct === "number" && !isNaN(rawCod.confirmationRatePct)
        ? rawCod.confirmationRatePct
        : DEFAULT_COD_PARAMETERS.confirmationRatePct,
    deliveryRatePct:
      typeof rawCod.deliveryRatePct === "number" && !isNaN(rawCod.deliveryRatePct)
        ? rawCod.deliveryRatePct
        : DEFAULT_COD_PARAMETERS.deliveryRatePct,
    returnBufferTnd:
      typeof rawCod.returnBufferTnd === "number" && !isNaN(rawCod.returnBufferTnd)
        ? rawCod.returnBufferTnd
        : DEFAULT_COD_PARAMETERS.returnBufferTnd,
  };

  return {
    timeWindow,
    selectedCategories: selectedCategories.length > 0 ? selectedCategories : ["all"],
    minActiveAdsThreshold:
      typeof parsed.minActiveAdsThreshold === "number"
        ? parsed.minActiveAdsThreshold
        : DEFAULT_WIZARD_CONFIG.minActiveAdsThreshold,
    minStoreCountThreshold:
      typeof parsed.minStoreCountThreshold === "number"
        ? parsed.minStoreCountThreshold
        : DEFAULT_WIZARD_CONFIG.minStoreCountThreshold,
    includeScalingBrands:
      typeof parsed.includeScalingBrands === "boolean"
        ? parsed.includeScalingBrands
        : DEFAULT_WIZARD_CONFIG.includeScalingBrands,
    scalingBrandsLimit: [10, 25, 50].includes(parsed.scalingBrandsLimit)
      ? parsed.scalingBrandsLimit
      : DEFAULT_WIZARD_CONFIG.scalingBrandsLimit,
    includeDescalingBrands:
      typeof parsed.includeDescalingBrands === "boolean"
        ? parsed.includeDescalingBrands
        : DEFAULT_WIZARD_CONFIG.includeDescalingBrands,
    includeCloneTraps:
      typeof parsed.includeCloneTraps === "boolean"
        ? parsed.includeCloneTraps
        : DEFAULT_WIZARD_CONFIG.includeCloneTraps,
    codParameters,
    targetLlm,
    htmlTheme,
  };
}

export function WizardProvider({ children }: { children: React.ReactNode }) {
  const { activeWorkspace } = useWorkspace();
  const workspaceId = activeWorkspace?.id;

  const [currentStep, setCurrentStep] = useState<number>(1);
  const [config, setConfig] = useState<WizardConfig>(() => {
    if (typeof window === "undefined") return DEFAULT_WIZARD_CONFIG;
    try {
      const raw = localStorage.getItem(getStorageKey(workspaceId));
      if (raw) {
        return sanitizeWizardConfig(JSON.parse(raw));
      }
    } catch {
      // Clean fallback if localStorage is corrupted
    }
    return DEFAULT_WIZARD_CONFIG;
  });

  const [telemetry, setTelemetry] = useState<TelemetrySnapshot | null>(null);
  const [loadingTelemetry, setLoadingTelemetry] = useState<boolean>(true);
  const [telemetryError, setTelemetryError] = useState<string | null>(null);

  // Request sequence tracker to guard against out-of-order race conditions
  const requestSeqRef = useRef<number>(0);

  // Sync config from localStorage whenever workspace changes
  useEffect(() => {
    if (!workspaceId || typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(getStorageKey(workspaceId));
      if (raw) {
        setConfig(sanitizeWizardConfig(JSON.parse(raw)));
      } else {
        setConfig(DEFAULT_WIZARD_CONFIG);
      }
    } catch {
      setConfig(DEFAULT_WIZARD_CONFIG);
    }
  }, [workspaceId]);

  // Persist config changes to localStorage
  const updateConfig = useCallback(
    (updates: Partial<WizardConfig>) => {
      setConfig((prev) => {
        const next = sanitizeWizardConfig({ ...prev, ...updates });
        if (typeof window !== "undefined" && workspaceId) {
          try {
            localStorage.setItem(getStorageKey(workspaceId), JSON.stringify(next));
          } catch (e) {
            console.warn("Failed to persist wizard config to localStorage", e);
          }
        }
        return next;
      });
    },
    [workspaceId]
  );

  const resetConfig = useCallback(() => {
    setConfig(DEFAULT_WIZARD_CONFIG);
    if (typeof window !== "undefined" && workspaceId) {
      try {
        localStorage.removeItem(getStorageKey(workspaceId));
      } catch {}
    }
  }, [workspaceId]);

  // Fetch telemetry whenever workspace or timeWindow changes
  const fetchTelemetry = useCallback(
    async (windowRange: TimeWindow) => {
      if (!workspaceId) {
        setLoadingTelemetry(false);
        return;
      }

      const seq = ++requestSeqRef.current;
      setLoadingTelemetry(true);
      setTelemetryError(null);
      // Solves Finding 5: Clear previous snapshot so UI never displays mismatched window/workspace data while loading
      setTelemetry(null);

      try {
        const headers: Record<string, string> = {
          "x-workspace-id": workspaceId,
        };
        const res = await fetch(`/api/opportunities/telemetry?range=${windowRange}`, {
          method: "GET",
          headers,
        });

        // If a newer request was dispatched while this was inflight, ignore result
        if (seq !== requestSeqRef.current) return;

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${res.status}`);
        }

        const data: TelemetrySnapshot = await res.json();
        if (seq !== requestSeqRef.current) return;

        setTelemetry(data);
      } catch (err: any) {
        if (seq !== requestSeqRef.current) return;
        console.error("Failed to load opportunity telemetry:", err);
        setTelemetryError(err.message || "Failed to fetch market telemetry");
      } finally {
        if (seq === requestSeqRef.current) {
          setLoadingTelemetry(false);
        }
      }
    },
    [workspaceId]
  );

  useEffect(() => {
    void fetchTelemetry(config.timeWindow);
  }, [fetchTelemetry, config.timeWindow]);

  const nextStep = () => setCurrentStep((s) => Math.min(5, s + 1));
  const prevStep = () => setCurrentStep((s) => Math.max(1, s - 1));

  return (
    <WizardContext.Provider
      value={{
        config,
        updateConfig,
        resetConfig,
        telemetry,
        loadingTelemetry,
        telemetryError,
        currentStep,
        setCurrentStep,
        nextStep,
        prevStep,
        refreshTelemetry: () => fetchTelemetry(config.timeWindow),
      }}
    >
      {children}
    </WizardContext.Provider>
  );
}

export function useWizard() {
  const context = useContext(WizardContext);
  if (!context) {
    throw new Error("useWizard must be used within a WizardProvider");
  }
  return context;
}
