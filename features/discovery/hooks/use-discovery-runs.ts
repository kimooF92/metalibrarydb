"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { parseMetaAdLibraryDiscoveryUrl, type ParsedMetaAdUrl } from "@/lib/url-parser";
import { useWorkspace } from "@/components/workspace-context";

export interface DiscoveryRun {
  id: string;
  country: string;
  searchUrl: string;
  query?: string;
  targetMaxAds?: number | null;
  maxScrolls?: number | null;
  status: "pending" | "running" | "completed" | "partial" | "failed";
  totalAdsScanned: number;
  totalPagesDiscovered: number;
  failureReason?: string;
  outcomeDetails?: string;
  createdAt: string;
  finishedAt?: string;
}

export function getRunKeywordDisplay(run: DiscoveryRun): string {
  let q = run.query;
  if (q && q.startsWith("page:")) {
    return `Page ID: ${q.replace(/^page:/, "")}`;
  }
  if (!q || q.startsWith("http://") || q.startsWith("https://")) {
    const target = q || run.searchUrl || "";
    try {
      const urlObj = new URL(target);
      const pageId = urlObj.searchParams.get("view_all_page_id");
      if (pageId) return `Page ID: ${pageId}`;
      q = urlObj.searchParams.get("q") || "";
    } catch {
      const pageMatch = target.match(/[?&]view_all_page_id=([^&]+)/);
      if (pageMatch) return `Page ID: ${decodeURIComponent(pageMatch[1])}`;
      const match = target.match(/[?&]q=([^&]+)/);
      q = match ? decodeURIComponent(match[1]) : "";
    }
  }
  if (!q || q === "\u200D" || q === "%E2%80%8D") {
    return "ZWJ (Broad Search)";
  }
  return q;
}

export const KEYWORD_GROUPS = [
  {
    groupName: "Popular E-Commerce Hooks",
    options: [
      { label: "Zero Width Joiner (Broadest Search)", value: "\u200D" },
      { label: '"توصيل" (Delivery)', value: "توصيل" },
      { label: '"عرض خاص" (Special Offer)', value: "عرض خاص" },
      { label: '"تخفيض" (Discount)', value: "تخفيض" },
      { label: '"الدفع عند الاستلام" (COD)', value: "الدفع عند الاستلام" },
    ],
  },
  {
    groupName: "Problem Solving",
    options: [
      { label: '"بدون تعب" (Effortless)', value: "بدون تعب" },
      { label: '"يحمي" (Protects)', value: "يحمي" },
      { label: '"في دقائق" (In Minutes)', value: "في دقائق" },
      { label: '"حل مشكلة" (Problem Solved)', value: "حل مشكلة" },
    ],
  },
  {
    groupName: "Transformation",
    options: [
      { label: '"شوف الفرق" (See the Difference)', value: "شوف الفرق" },
      { label: '"النتيجة من أول استعمال" (Results from 1st use)', value: "النتيجة من أول استعمال" },
      { label: '"النتيجة" (Results)', value: "النتيجة" },
    ],
  },
];

interface UseDiscoveryRunsOptions {
  selectedRunId: string | null;
  onSelectRunId: (runId: string | null | ((prev: string | null) => string | null)) => void;
  country?: string;
  onCountryChange?: (country: string) => void;
  mediaType?: "all" | "video" | "image";
  onMediaTypeChange?: (mediaType: "all" | "video" | "image") => void;
  onNotify?: (message: string) => void;
}

export function useDiscoveryRuns({
  selectedRunId,
  onSelectRunId,
  country = "TN",
  onCountryChange,
  mediaType = "video",
  onMediaTypeChange,
  onNotify,
}: UseDiscoveryRunsOptions) {
  const { activeWorkspace } = useWorkspace();

  const [runs, setRuns] = useState<DiscoveryRun[]>([]);
  const [isLoadingRuns, setIsLoadingRuns] = useState(true);
  const [isLaunchingScan, setIsLaunchingScan] = useState(false);
  const [isNewScanModalOpen, setIsNewScanModalOpen] = useState(false);

  // Search Mode: "controls" vs "url" vs "sequence"
  const [searchMode, setSearchMode] = useState<"controls" | "url" | "sequence">("controls");
  const [directUrlInput, setDirectUrlInput] = useState("");

  const parsedUrlPreview = useMemo(() => {
    if (!directUrlInput.trim()) return null;
    return parseMetaAdLibraryDiscoveryUrl(directUrlInput.trim());
  }, [directUrlInput]);

  const handleSetSearchMode = useCallback((mode: "controls" | "url" | "sequence") => {
    setSearchMode(mode);
    try {
      localStorage.setItem("discovery_search_mode", mode);
    } catch {}
  }, []);

  // Filter Form State inside Modal
  const [selectedKeyword, setSelectedKeyword] = useState("\u200D");
  const [isCustomKeyword, setIsCustomKeyword] = useState(false);
  const [customKeywordText, setCustomKeywordText] = useState("");

  const getSevenDaysAgoStr = () => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  };

  const getTodayStr = () => {
    return new Date().toISOString().split("T")[0];
  };

  const [startDateMin, setStartDateMin] = useState(getSevenDaysAgoStr);
  const [startDateMax, setStartDateMax] = useState(getTodayStr);
  const [activeDatePreset, setActiveDatePreset] = useState<"last7" | "last30" | "today" | "custom">("last7");

  // Scan Depth / Limits State
  const [scanDepthPreset, setScanDepthPreset] = useState<"quick" | "balanced" | "deep" | "custom">("balanced");
  const [customMaxAds, setCustomMaxAds] = useState("1000");
  const [customMaxScrolls, setCustomMaxScrolls] = useState("75");

  const { effectiveTargetMaxAds, effectiveMaxScrolls } = useMemo(() => {
    switch (scanDepthPreset) {
      case "quick":
        return { effectiveTargetMaxAds: 300, effectiveMaxScrolls: 30 };
      case "deep":
        return { effectiveTargetMaxAds: 2500, effectiveMaxScrolls: 150 };
      case "custom": {
        const ads = parseInt(customMaxAds, 10);
        const scrolls = parseInt(customMaxScrolls, 10);
        return {
          effectiveTargetMaxAds: Number.isFinite(ads) && ads > 0 ? Math.min(Math.max(ads, 50), 10000) : 1000,
          effectiveMaxScrolls: Number.isFinite(scrolls) && scrolls > 0 ? Math.min(Math.max(scrolls, 5), 500) : 75,
        };
      }
      case "balanced":
      default:
        return { effectiveTargetMaxAds: 1000, effectiveMaxScrolls: 75 };
    }
  }, [scanDepthPreset, customMaxAds, customMaxScrolls]);

  // Load saved search mode on client mount
  useEffect(() => {
    try {
      const savedMode = localStorage.getItem("discovery_search_mode");
      if (savedMode === "url" || savedMode === "controls" || savedMode === "sequence") {
        setSearchMode(savedMode);
      }
    } catch {}
  }, []);

  // Fetch app settings to prefill defaultCountry and discoveryWindow
  useEffect(() => {
    const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    const hasExplicitCountry = urlParams?.has("country");

    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.settings) {
          if (!hasExplicitCountry && data.settings.defaultCountry && onCountryChange) {
            onCountryChange(data.settings.defaultCountry);
          }
          if (data.settings.discoveryWindowDays && data.settings.discoveryWindowDays !== 7) {
            const d = new Date();
            d.setDate(d.getDate() - data.settings.discoveryWindowDays);
            setStartDateMin(d.toISOString().split("T")[0]);
            if (data.settings.discoveryWindowDays === 30) {
              setActiveDatePreset("last30");
            }
          }
        }
      })
      .catch(() => {});
  }, [onCountryChange]);

  const applyDatePreset = useCallback((preset: "today" | "last7" | "last30") => {
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    setStartDateMax(todayStr);

    if (preset === "today") {
      setStartDateMin(todayStr);
      setActiveDatePreset("today");
    } else if (preset === "last7") {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      setStartDateMin(d.toISOString().split("T")[0]);
      setActiveDatePreset("last7");
    } else if (preset === "last30") {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      setStartDateMin(d.toISOString().split("T")[0]);
      setActiveDatePreset("last30");
    }
  }, []);

  // 1. Fetch Discovery Runs
  const fetchRuns = useCallback(async () => {
    try {
      setIsLoadingRuns(true);
      const res = await fetch("/api/discovery/runs");
      const data = await res.json();
      if (data.success && Array.isArray(data.runs)) {
        setRuns(data.runs);
        if (data.runs.length > 0) {
          onSelectRunId((prev: string | null) => {
            const stillExists = prev && data.runs.some((r: DiscoveryRun) => r.id === prev);
            return stillExists ? prev : data.runs[0].id;
          });
        } else {
          onSelectRunId(null);
        }
      } else {
        setRuns([]);
        onSelectRunId(null);
      }
    } catch {
      // Fetch error silently
    } finally {
      setIsLoadingRuns(false);
    }
  }, [onSelectRunId]);

  // Re-fetch runs and sync default country whenever active workspace changes
  useEffect(() => {
    fetchRuns();
    if (activeWorkspace?.countryCode && onCountryChange) {
      const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
      if (!urlParams?.has("country")) {
        onCountryChange(activeWorkspace.countryCode);
      }
    }
  }, [activeWorkspace?.id, activeWorkspace?.countryCode, fetchRuns, onCountryChange]);

  // Helper to compute final formatted query for launch
  const computeFinalQuery = useCallback(() => {
    if (isCustomKeyword) {
      const trimmed = customKeywordText.trim();
      if (!trimmed) return "\u200D";
      if (trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed;
      return `"${trimmed}"`;
    }
    if (selectedKeyword === "\u200D") return "\u200D";
    return `"${selectedKeyword}"`;
  }, [isCustomKeyword, customKeywordText, selectedKeyword]);

  // Handle Launching Scan from Direct Meta Ad Library URL
  const handleLaunchUrlScan = useCallback(async () => {
    const trimmedUrl = directUrlInput.trim();
    if (!trimmedUrl) {
      onNotify?.("Please enter a Meta Ad Library URL.");
      return;
    }
    const parsed = parseMetaAdLibraryDiscoveryUrl(trimmedUrl);
    if (!parsed.isValid) {
      onNotify?.(`Invalid Meta Ad Library URL: ${parsed.error || "Please check the URL"}`);
      return;
    }

    try {
      setIsLaunchingScan(true);
      const res = await fetch("/api/discovery/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: parsed.cleanUrl,
          targetMaxAds: effectiveTargetMaxAds,
          maxScrolls: effectiveMaxScrolls,
        }),
      });
      const data = await res.json();
      if (data.success && data.runId) {
        onSelectRunId(data.runId);
        setIsNewScanModalOpen(false);
        const kwDisplay = parsed.query && parsed.query !== "\u200D" ? parsed.query : "Broad URL Search";
        onNotify?.(`Discovery scan launched from Meta URL (${parsed.country} - ${kwDisplay})! Worker is harvesting pages...`);
        await fetchRuns();
      } else {
        onNotify?.(`Error launching scan: ${data.error || "Unknown error"}`);
      }
    } catch (err: any) {
      onNotify?.(`Failed to launch scan: ${err.message}`);
    } finally {
      setIsLaunchingScan(false);
    }
  }, [
    directUrlInput,
    effectiveTargetMaxAds,
    effectiveMaxScrolls,
    onNotify,
    onSelectRunId,
    fetchRuns,
  ]);

  // Helper to load parsed URL parameters into existing search controls
  const handlePopulateControlsFromUrl = useCallback(
    (parsed: ParsedMetaAdUrl) => {
      if (!parsed.isValid) return;
      if (parsed.country && parsed.country !== "ALL" && onCountryChange) {
        onCountryChange(parsed.country);
      }
      if (
        parsed.mediaType &&
        (parsed.mediaType === "video" || parsed.mediaType === "image" || parsed.mediaType === "all") &&
        onMediaTypeChange
      ) {
        onMediaTypeChange(parsed.mediaType);
      }
      if (parsed.query && parsed.query !== "\u200D") {
        const cleaned = parsed.query.replace(/^"|"$/g, "");
        setIsCustomKeyword(true);
        setCustomKeywordText(cleaned);
      }
      if (parsed.startDateMin) {
        setStartDateMin(parsed.startDateMin);
        setActiveDatePreset("custom");
      }
      if (parsed.startDateMax) {
        setStartDateMax(parsed.startDateMax);
        setActiveDatePreset("custom");
      }
      handleSetSearchMode("controls");
      onNotify?.("Transferred URL parameters into Search Controls.");
    },
    [onCountryChange, onMediaTypeChange, handleSetSearchMode, onNotify]
  );

  // Handle Launching New Country Discovery Scan from Controls
  const handleLaunchScan = useCallback(
    async (targetCountry?: string, targetMediaType?: string) => {
      try {
        setIsLaunchingScan(true);
        const resolvedCountry = targetCountry || country;
        const resolvedMediaType = targetMediaType || mediaType;
        const finalQuery = computeFinalQuery();
        const res = await fetch("/api/discovery/runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            country: resolvedCountry,
            mediaType: resolvedMediaType,
            query: finalQuery,
            startDateMin,
            startDateMax,
            targetMaxAds: effectiveTargetMaxAds,
            maxScrolls: effectiveMaxScrolls,
          }),
        });
        const data = await res.json();
        if (data.success && data.runId) {
          onSelectRunId(data.runId);
          setIsNewScanModalOpen(false);
          onNotify?.(
            `Country discovery scan launched with keyword ${
              finalQuery === "\u200D" ? "ZWJ (Broad Search)" : finalQuery
            }! Worker is harvesting pages...`
          );
          await fetchRuns();
        } else {
          onNotify?.(`Error launching scan: ${data.error || "Unknown error"}`);
        }
      } catch (err: any) {
        onNotify?.(`Failed to launch scan: ${err.message}`);
      } finally {
        setIsLaunchingScan(false);
      }
    },
    [
      country,
      mediaType,
      computeFinalQuery,
      startDateMin,
      startDateMax,
      effectiveTargetMaxAds,
      effectiveMaxScrolls,
      onSelectRunId,
      onNotify,
      fetchRuns,
    ]
  );

  // Handle Launching Sequence Discovery Request
  const handleLaunchSequenceScan = useCallback(
    async (payload: {
      sequenceType: "urls" | "keywords";
      urlsText?: string;
      keywordsText?: string;
      country?: string;
      mediaType?: string;
      startDateMin?: string;
      startDateMax?: string;
    }) => {
      try {
        setIsLaunchingScan(true);
        const res = await fetch("/api/discovery/runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sequence: true,
            sequenceType: payload.sequenceType,
            ...(payload.sequenceType === "urls"
              ? { urlsText: payload.urlsText }
              : { keywordsText: payload.keywordsText }),
            country: payload.country,
            mediaType: payload.mediaType,
            startDateMin: payload.startDateMin || startDateMin,
            startDateMax: payload.startDateMax || startDateMax,
            targetMaxAds: effectiveTargetMaxAds,
            maxScrolls: effectiveMaxScrolls,
          }),
        });
        const data = await res.json();
        if (data.success && data.runIds && data.runIds.length > 0) {
          onSelectRunId(data.firstRunId || data.runIds[0]);
          setIsNewScanModalOpen(false);
          onNotify?.(
            `Sequence queued! ${data.count} discovery scan(s) scheduled. Worker will scan 1-by-1 and close Chromium between runs to save RAM.`
          );
          await fetchRuns();
        } else {
          onNotify?.(`Error launching sequence: ${data.error || "Unknown error"}`);
        }
      } catch (err: any) {
        onNotify?.(`Failed to launch sequence: ${err.message}`);
      } finally {
        setIsLaunchingScan(false);
      }
    },
    [
      startDateMin,
      startDateMax,
      effectiveTargetMaxAds,
      effectiveMaxScrolls,
      onSelectRunId,
      onNotify,
      fetchRuns,
    ]
  );

  const activeRun = useMemo(
    () => runs.find((r) => r.id === selectedRunId) || null,
    [runs, selectedRunId]
  );

  const modalProps = useMemo(
    () => ({
      isOpen: isNewScanModalOpen,
      onClose: () => setIsNewScanModalOpen(false),
      searchMode,
      onSetSearchMode: handleSetSearchMode,
      country,
      onCountryChange: onCountryChange || (() => {}),
      mediaType,
      onMediaTypeChange: onMediaTypeChange || (() => {}),
      selectedKeyword,
      onSelectedKeywordChange: setSelectedKeyword,
      isCustomKeyword,
      onIsCustomKeywordChange: setIsCustomKeyword,
      customKeywordText,
      onCustomKeywordTextChange: setCustomKeywordText,
      startDateMin,
      onStartDateMinChange: (val: string) => {
        setStartDateMin(val);
        setActiveDatePreset("custom");
      },
      startDateMax,
      onStartDateMaxChange: (val: string) => {
        setStartDateMax(val);
        setActiveDatePreset("custom");
      },
      activeDatePreset,
      onApplyDatePreset: applyDatePreset,
      scanDepthPreset,
      onScanDepthPresetChange: setScanDepthPreset,
      customMaxAds,
      onCustomMaxAdsChange: setCustomMaxAds,
      customMaxScrolls,
      onCustomMaxScrollsChange: setCustomMaxScrolls,
      effectiveTargetMaxAds,
      effectiveMaxScrolls,
      directUrlInput,
      onDirectUrlInputChange: setDirectUrlInput,
      parsedUrlPreview,
      onPopulateControlsFromUrl: handlePopulateControlsFromUrl,
      isLaunchingScan,
      onLaunchScan: () => handleLaunchScan(country, mediaType),
      onLaunchUrlScan: handleLaunchUrlScan,
      onLaunchSequenceScan: handleLaunchSequenceScan,
    }),
    [
      isNewScanModalOpen,
      searchMode,
      country,
      onCountryChange,
      mediaType,
      onMediaTypeChange,
      selectedKeyword,
      isCustomKeyword,
      customKeywordText,
      startDateMin,
      startDateMax,
      activeDatePreset,
      scanDepthPreset,
      customMaxAds,
      customMaxScrolls,
      effectiveTargetMaxAds,
      effectiveMaxScrolls,
      directUrlInput,
      parsedUrlPreview,
      handlePopulateControlsFromUrl,
      isLaunchingScan,
      handleLaunchScan,
      handleLaunchUrlScan,
      handleLaunchSequenceScan,
      handleSetSearchMode,
      applyDatePreset,
    ]
  );

  return {
    runs,
    activeRun,
    isLoadingRuns,
    isLaunchingScan,
    isNewScanModalOpen,
    setIsNewScanModalOpen,
    modalProps,
    searchMode,
    handleSetSearchMode,
    directUrlInput,
    setDirectUrlInput,
    parsedUrlPreview,
    selectedKeyword,
    setSelectedKeyword,
    isCustomKeyword,
    setIsCustomKeyword,
    customKeywordText,
    setCustomKeywordText,
    startDateMin,
    setStartDateMin,
    startDateMax,
    setStartDateMax,
    activeDatePreset,
    applyDatePreset,
    scanDepthPreset,
    setScanDepthPreset,
    customMaxAds,
    setCustomMaxAds,
    customMaxScrolls,
    setCustomMaxScrolls,
    effectiveTargetMaxAds,
    effectiveMaxScrolls,
    fetchRuns,
    handleLaunchUrlScan,
    handlePopulateControlsFromUrl,
    handleLaunchScan,
    handleLaunchSequenceScan,
  };
}
