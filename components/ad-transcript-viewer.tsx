"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Mic,
  Loader2,
  CheckCircle2,
  VolumeX,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Copy,
  Check,
  RotateCw,
  Play,
  Search,
  FileText,
  Clock,
  ListFilter,
  Zap,
  Music,
  X,
  Activity,
  AlignLeft,
} from "lucide-react";
import { cn, isRtlText } from "@/lib/utils";

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  prob?: number;
}

export interface TranscriptSegment {
  id: number;
  start: number;
  end: number;
  text: string;
}

export interface TranscriptData {
  status: "pending" | "processing" | "completed" | "no_speech" | "failed";
  language?: string;
  languageConfidence?: number;
  fullText?: string;
  hookText?: string | null;
  words?: WordTimestamp[];
  segments?: TranscriptSegment[];
  durationSeconds?: number;
  isTruncated?: boolean;
  errorMessage?: string;
}

export interface AdTranscriptViewerProps {
  adId: string;
  onSeek?: (seconds: number) => void;
  compact?: boolean;
  variant?: "inline" | "full-tab";
  currentTime?: number;
  className?: string;
  onTranscribeComplete?: (data: TranscriptData) => void;
}

const LANGUAGE_NAMES: Record<string, string> = {
  ar: "Arabic",
  en: "English",
  fr: "French",
  es: "Spanish",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  tr: "Turkish",
  ru: "Russian",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
  hi: "Hindi",
  nl: "Dutch",
  pl: "Polish",
  sv: "Swedish",
  id: "Indonesian",
  vi: "Vietnamese",
  th: "Thai",
};

export function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function formatDurationLabel(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

export function calculateSpeakingPace(wordCount: number, durationSeconds: number) {
  if (!durationSeconds || durationSeconds <= 0 || !wordCount) return null;
  const wpm = Math.round((wordCount / durationSeconds) * 60);
  if (wpm > 165) return { wpm, label: "High Energy", tone: "Fast pace", color: "text-amber-400" };
  if (wpm >= 115) return { wpm, label: "Conversational", tone: "Optimal pace", color: "text-emerald-400" };
  return { wpm, label: "Relaxed", tone: "Calm pace", color: "text-sky-400" };
}

export function AdTranscriptViewer({
  adId,
  onSeek,
  compact = false,
  variant = "inline",
  currentTime,
  className,
  onTranscribeComplete,
}: AdTranscriptViewerProps) {
  const [data, setData] = useState<TranscriptData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedFull, setCopiedFull] = useState(false);
  const [copiedHook, setCopiedHook] = useState(false);
  const [copiedSegmentId, setCopiedSegmentId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"timeline" | "prose">("timeline");
  const [searchQuery, setSearchQuery] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Check initial cache/db status
  const checkStatus = useCallback(async () => {
    if (!adId) return;
    try {
      const res = await fetch(`/api/spy/ads/${adId}/transcription-jobs`);
      if (res.ok) {
        const json = await res.json();
        if (json.transcript) {
          setData(json.transcript);
          onTranscribeComplete?.(json.transcript);
        }
      }
    } catch {
      // Graceful silence on background check
    }
  }, [adId, onTranscribeComplete]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // Elapsed timer during active processing
  useEffect(() => {
    if (isLoading) {
      setElapsedSeconds(0);
      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isLoading]);

  // Start on-demand transcription
  const handleTranscribe = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/spy/ads/${adId}/transcription-jobs`, {
        method: "POST",
      });

      const resData = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(resData.error || `HTTP ${res.status}`);
      }

      if (resData.status === "completed" && resData.transcript) {
        setData(resData.transcript);
        setIsLoading(false);
        setIsExpanded(true);
        onTranscribeComplete?.(resData.transcript);
        return;
      }

      if (resData.status === "no_speech" || resData.transcript?.status === "no_speech") {
        const noSpeech = resData.transcript || { status: "no_speech" };
        setData(noSpeech);
        setIsLoading(false);
        onTranscribeComplete?.(noSpeech);
        return;
      }

      // If async processing, poll until finished (max 45 seconds)
      const startTime = Date.now();
      const pollInterval = setInterval(async () => {
        try {
          if (Date.now() - startTime > 45000) {
            clearInterval(pollInterval);
            setIsLoading(false);
            setError("Transcription timed out. Please try again.");
            return;
          }

          const pollRes = await fetch(`/api/spy/ads/${adId}/transcription-jobs`);
          if (pollRes.ok) {
            const pollData = await pollRes.json();
            if (pollData.transcript?.status === "completed") {
              clearInterval(pollInterval);
              setData(pollData.transcript);
              setIsLoading(false);
              setIsExpanded(true);
              onTranscribeComplete?.(pollData.transcript);
            } else if (pollData.transcript?.status === "no_speech") {
              clearInterval(pollInterval);
              setData(pollData.transcript);
              setIsLoading(false);
              onTranscribeComplete?.(pollData.transcript);
            } else if (pollData.transcript?.status === "failed") {
              clearInterval(pollInterval);
              setError(pollData.transcript.errorMessage || "Transcription failed");
              setIsLoading(false);
            }
          }
        } catch {
          // Keep polling
        }
      }, 1500);
    } catch (err: any) {
      setIsLoading(false);
      setError(err.message || "Failed to start transcription");
    }
  };

  const copyFullText = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const textToCopy = data?.fullText || (data as any)?.full_text;
    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy);
      setCopiedFull(true);
      setTimeout(() => setCopiedFull(false), 2000);
    }
  };

  const copyHookText = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const textToCopy = data?.hookText || (data as any)?.hook_text;
    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy);
      setCopiedHook(true);
      setTimeout(() => setCopiedHook(false), 2000);
    }
  };

  const copySegment = (segId: number, text: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    navigator.clipboard.writeText(text);
    setCopiedSegmentId(segId);
    setTimeout(() => setCopiedSegmentId(null), 2000);
  };

  // Normalization
  const fullText = (data?.fullText || (data as any)?.full_text || "").trim();
  const hookText = (data?.hookText || (data as any)?.hook_text || "").trim();
  const durationSeconds = Number(data?.durationSeconds || (data as any)?.duration_seconds || 0);
  const languageCode = (data?.language || "").toLowerCase();
  const languageName = LANGUAGE_NAMES[languageCode] || languageCode.toUpperCase();
  const confidencePercent = data?.languageConfidence
    ? Math.round(data.languageConfidence * 100)
    : (data as any)?.language_confidence
    ? Math.round((data as any).language_confidence * 100)
    : null;

  const totalWords = useMemo(() => {
    if (!fullText) return 0;
    return fullText.split(/\s+/).filter(Boolean).length;
  }, [fullText]);

  const paceInfo = useMemo(() => {
    return calculateSpeakingPace(totalWords, durationSeconds);
  }, [totalWords, durationSeconds]);

  const isRtl = useMemo(() => {
    return isRtlText(fullText) || isRtlText(hookText);
  }, [fullText, hookText]);

  const segments: TranscriptSegment[] = useMemo(() => {
    if (data?.segments && Array.isArray(data.segments)) {
      return data.segments;
    }
    return [];
  }, [data?.segments]);

  // Filtered segments for search query
  const filteredSegments = useMemo(() => {
    if (!searchQuery.trim()) return segments;
    const q = searchQuery.toLowerCase().trim();
    return segments.filter((s) => s.text.toLowerCase().includes(q));
  }, [segments, searchQuery]);

  const searchMatchCount = useMemo(() => {
    if (!searchQuery.trim() || !fullText) return 0;
    const q = searchQuery.toLowerCase().trim();
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const matches = fullText.match(regex);
    return matches ? matches.length : 0;
  }, [searchQuery, fullText]);

  // Helper to render text with search highlights
  const renderHighlightedText = useCallback(
    (text: string) => {
      if (!searchQuery.trim()) return text;
      const q = searchQuery.trim();
      const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
      return parts.map((part, i) =>
        part.toLowerCase() === q.toLowerCase() ? (
          <mark
            key={i}
            className="bg-indigo-500/30 text-indigo-200 px-1 py-0.5 rounded font-bold"
          >
            {part}
          </mark>
        ) : (
          part
        )
      );
    },
    [searchQuery]
  );

  // =========================================================================
  // 1. INLINE VARIANT (Backward Compatibility for existing callers)
  // =========================================================================
  if (variant === "inline") {
    if (isLoading || data?.status === "processing" || data?.status === "pending") {
      return (
        <div className="pt-2 flex items-center gap-2 text-[11px] font-semibold text-indigo-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Transcribing voiceover on InstaBox ({elapsedSeconds}s)...</span>
        </div>
      );
    }

    if (error || data?.status === "failed") {
      const errorMsg = error || data?.errorMessage || "Transcription failed";
      return (
        <div className="pt-2 flex items-center gap-2 text-[11px] text-destructive">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span className="line-clamp-1 truncate max-w-[220px]">{errorMsg}</span>
          <button
            type="button"
            onClick={handleTranscribe}
            className="font-bold underline hover:no-underline ml-1 cursor-pointer text-indigo-400 shrink-0"
          >
            Retry
          </button>
        </div>
      );
    }

    if (data?.status === "no_speech") {
      return (
        <div className="pt-2 flex items-center gap-1.5 text-[11px] text-slate-400 italic">
          <VolumeX className="w-3 h-3 text-slate-400" />
          <span>Instrumental / No speech detected in video</span>
        </div>
      );
    }

    if (data?.status === "completed" && fullText) {
      return (
        <div className="pt-2 space-y-2">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-black text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="w-2.5 h-2.5" />
                <span>{languageCode ? languageCode.toUpperCase() : "VOICEOVER"}</span>
              </span>
              {durationSeconds > 0 && (
                <span className="text-[10px] text-slate-400 font-mono">
                  {Math.round(durationSeconds)}s
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={copyFullText}
                title="Copy transcript"
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
              >
                {copiedFull ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsExpanded(!isExpanded);
                }}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10.5px] font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
              >
                <span>{isExpanded ? "Collapse" : "Read Transcript"}</span>
                {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>
          </div>

          {hookText && !isExpanded && (
            <div className="p-2 rounded-lg bg-indigo-950/40 border border-indigo-800/60 text-[11px] leading-relaxed">
              <div className="flex items-center gap-1 text-[9.5px] font-black uppercase text-indigo-400 mb-0.5 tracking-wider">
                <Sparkles className="w-2.5 h-2.5" />
                <span>Opening Hook (0–3.2s)</span>
              </div>
              <p className="text-slate-200 font-medium italic">&ldquo;{hookText}&rdquo;</p>
            </div>
          )}

          {isExpanded && (
            <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 text-[11px] leading-relaxed space-y-2">
              {segments.length > 0 ? (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {segments.map((seg) => (
                    <div key={seg.id} className="flex items-baseline gap-2">
                      {onSeek && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onSeek(seg.start);
                          }}
                          className="text-[9.5px] font-mono font-bold text-indigo-400 hover:underline shrink-0 cursor-pointer"
                          title={`Jump video to ${formatTimestamp(seg.start)}`}
                        >
                          [{formatTimestamp(seg.start)}]
                        </button>
                      )}
                      <span className="text-slate-300 font-normal">{seg.text}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-300 whitespace-pre-line">{fullText}</p>
              )}
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="pt-2">
        <button
          type="button"
          onClick={handleTranscribe}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-950/50 text-indigo-300 border border-indigo-800/60 hover:bg-indigo-900/60 transition-all cursor-pointer shadow-2xs"
        >
          <Mic className="w-3 h-3 text-indigo-400" />
          <span>Transcribe Voiceover</span>
        </button>
      </div>
    );
  }

  // =========================================================================
  // 2. FULL TAB VARIANT ("Voiceover & Hook Intelligence" Dedicated Tab)
  // =========================================================================

  // A. Loading / Processing State
  if (isLoading || data?.status === "processing" || data?.status === "pending") {
    return (
      <div className={cn("p-5 flex flex-col items-center justify-center text-center space-y-4 min-h-[380px]", className)}>
        <div className="relative flex items-center justify-center">
          <div className="w-16 h-16 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 animate-pulse">
            <Mic className="w-8 h-8" />
          </div>
          <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/50">
            <Loader2 className="w-3 h-3 text-white animate-spin" />
          </div>
        </div>

        <div className="space-y-1.5 max-w-xs">
          <h4 className="text-sm font-bold text-white">Transcribing Video Audio...</h4>
          <p className="text-xs text-slate-400 leading-relaxed">
            Streaming audio stream into Whisper <span className="font-mono text-indigo-300">large-v3-turbo</span> on InstaBox.
          </p>
        </div>

        {/* Live Processing Steps */}
        <div className="w-full max-w-xs space-y-2 pt-2">
          <div className="flex items-center justify-between text-[11px] text-slate-300 font-mono px-3 py-2 rounded-lg bg-slate-900/80 border border-slate-800">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />
              <span>Inference In Progress</span>
            </span>
            <span className="font-bold text-indigo-400">{elapsedSeconds}s</span>
          </div>
          <div className="text-[10px] text-slate-400 text-left space-y-1 px-1">
            <div className="flex items-center gap-1.5 text-emerald-400">
              <Check className="w-3 h-3" />
              <span>Audio track extracted with PyAV</span>
            </div>
            <div className="flex items-center gap-1.5 text-indigo-300">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Detecting dialect & generating word timestamps</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // B. Error State
  if (error || data?.status === "failed") {
    const errorMsg = error || data?.errorMessage || "Transcription failed";
    return (
      <div className={cn("p-5 flex flex-col items-center justify-center text-center space-y-4 min-h-[380px]", className)}>
        <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
          <AlertCircle className="w-7 h-7" />
        </div>
        <div className="space-y-1 max-w-sm">
          <h4 className="text-sm font-bold text-white">Transcription Error</h4>
          <p className="text-xs text-slate-400 leading-relaxed">{errorMsg}</p>
        </div>
        <button
          type="button"
          onClick={handleTranscribe}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-600/30 cursor-pointer"
        >
          <RotateCw className="w-3.5 h-3.5" />
          <span>Retry Transcription</span>
        </button>
      </div>
    );
  }

  // C. Instrumental / No Speech State
  if (data?.status === "no_speech") {
    return (
      <div className={cn("p-5 flex flex-col items-center justify-center text-center space-y-4 min-h-[380px]", className)}>
        <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
          <Music className="w-7 h-7" />
        </div>
        <div className="space-y-1.5 max-w-sm">
          <h4 className="text-sm font-bold text-white">Instrumental Audio Creative</h4>
          <p className="text-xs text-slate-400 leading-relaxed">
            Whisper analyzed the entire audio track and detected no spoken voiceover or dialogue. This ad relies strictly on background music, sound effects, and visual text overlays.
          </p>
        </div>
        <button
          type="button"
          onClick={handleTranscribe}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors cursor-pointer"
        >
          <RotateCw className="w-3 h-3" />
          <span>Force Re-analyze</span>
        </button>
      </div>
    );
  }

  // D. Un-transcribed / Initial State
  if (!data || !fullText) {
    return (
      <div className={cn("p-5 flex flex-col items-center justify-center text-center space-y-5 min-h-[380px]", className)}>
        <div className="relative">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600/20 via-purple-600/20 to-indigo-600/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-xl shadow-indigo-950/40">
            <Mic className="w-8 h-8" />
          </div>
          <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center shadow-md">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
        </div>

        <div className="space-y-2 max-w-sm">
          <h4 className="text-base font-bold text-white">Voiceover & Hook Intelligence</h4>
          <p className="text-xs text-slate-300 leading-relaxed">
            Extract the full voiceover transcript, isolate the critical <span className="text-indigo-300 font-semibold">3.2s stop-the-scroll hook</span>, measure speaking pace, and navigate synchronized word timestamps.
          </p>
        </div>

        <div className="flex flex-col items-center gap-2 w-full max-w-xs">
          <button
            type="button"
            onClick={handleTranscribe}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-600/30 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
          >
            <Mic className="w-4 h-4 text-indigo-200" />
            <span>Transcribe Video Voiceover</span>
          </button>
          <span className="text-[11px] text-slate-400 font-mono">
            Whisper large-v3-turbo • ~5-8s average inference
          </span>
        </div>
      </div>
    );
  }

  // E. Completed State: Full Rich Intelligence Dashboard
  return (
    <div className={cn("flex flex-col space-y-4 p-4 sm:p-5 select-text", className)}>
      {/* 1. Engine & Status Ribbon */}
      <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-xs">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span>{languageName ? languageName.toUpperCase() : "SPEECH"}</span>
            {confidencePercent && (
              <span className="text-emerald-300/80 font-mono">({confidencePercent}%)</span>
            )}
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-mono text-slate-400 bg-slate-900 border border-slate-800">
            <Zap className="w-3 h-3 text-indigo-400" />
            <span>large-v3-turbo</span>
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={copyFullText}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700/80 transition-colors cursor-pointer"
            title="Copy entire transcript"
          >
            {copiedFull ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-slate-400" />
            )}
            <span className="text-[11px]">{copiedFull ? "Copied" : "Copy"}</span>
          </button>
          <button
            type="button"
            onClick={handleTranscribe}
            title="Re-run Whisper transcription"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-transparent hover:border-slate-700 transition-colors cursor-pointer"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Speech Intelligence Metrics Grid (4-card metric strip) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/80 flex flex-col">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
            <Clock className="w-3 h-3 text-indigo-400" />
            <span>Duration</span>
          </span>
          <span className="text-sm font-bold text-white mt-1 font-mono">
            {durationSeconds > 0 ? formatDurationLabel(durationSeconds) : "—"}
          </span>
          <span className="text-[10px] text-slate-400">Audio length</span>
        </div>

        <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/80 flex flex-col">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
            <FileText className="w-3 h-3 text-indigo-400" />
            <span>Words</span>
          </span>
          <span className="text-sm font-bold text-white mt-1 font-mono">
            {totalWords} <span className="text-[10px] text-slate-400 font-normal">words</span>
          </span>
          <span className="text-[10px] text-slate-400">{fullText.length} characters</span>
        </div>

        <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/80 flex flex-col">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
            <Activity className="w-3 h-3 text-indigo-400" />
            <span>Pace</span>
          </span>
          <span className="text-sm font-bold text-white mt-1 font-mono">
            {paceInfo?.wpm ? `${paceInfo.wpm} wpm` : "—"}
          </span>
          <span className={cn("text-[10px] font-semibold", paceInfo?.color || "text-slate-400")}>
            {paceInfo?.tone || "Standard"}
          </span>
        </div>

        <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/80 flex flex-col">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-indigo-400" />
            <span>Hook Win</span>
          </span>
          <span className="text-sm font-bold text-indigo-300 mt-1 font-mono">
            0–3.2s
          </span>
          <span className="text-[10px] text-slate-400">Thumb-stop</span>
        </div>
      </div>

      {/* 3. Opening Hook Intelligence Card (0–3.2s) */}
      {hookText ? (
        <div className="relative overflow-hidden rounded-xl border border-indigo-500/30 bg-gradient-to-br from-indigo-950/40 via-purple-950/20 to-slate-900/60 p-3.5 shadow-lg shadow-indigo-950/20 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-black uppercase text-indigo-400 tracking-wider">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400 fill-indigo-400/20" />
              <span>Opening Hook (0–3.2s)</span>
            </div>
            <div className="flex items-center gap-1">
              {onSeek && (
                <button
                  type="button"
                  onClick={() => onSeek(0)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-bold text-indigo-300 hover:text-white bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/30 transition-colors cursor-pointer"
                  title="Replay hook from 0:00"
                >
                  <Play className="w-2.5 h-2.5 fill-current" />
                  <span>Replay</span>
                </button>
              )}
              <button
                type="button"
                onClick={copyHookText}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-bold text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 transition-colors cursor-pointer"
                title="Copy opening hook text"
              >
                {copiedHook ? (
                  <Check className="w-2.5 h-2.5 text-emerald-400" />
                ) : (
                  <Copy className="w-2.5 h-2.5" />
                )}
                <span>{copiedHook ? "Copied" : "Copy"}</span>
              </button>
            </div>
          </div>

          <div
            dir={isRtl ? "rtl" : "ltr"}
            className={cn(
              "text-sm font-medium text-slate-100 leading-relaxed font-serif italic selection:bg-indigo-500/30",
              isRtl ? "text-right" : "text-left"
            )}
          >
            &ldquo;{hookText}&rdquo;
          </div>

          <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-indigo-500/15">
            <span>Critical window capturing audience before scroll-off</span>
            <span className="font-mono">{hookText.split(/\s+/).filter(Boolean).length} words</span>
          </div>
        </div>
      ) : null}

      {/* 4. Controls: View Mode Toggle & Keyword Search */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between gap-2">
          {/* View Mode Toggle */}
          <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-900 border border-slate-800">
            <button
              type="button"
              onClick={() => setViewMode("timeline")}
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer",
                viewMode === "timeline"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "text-slate-400 hover:text-slate-200"
              )}
            >
              <Clock className="w-3 h-3" />
              <span>Timeline</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("prose")}
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer",
                viewMode === "prose"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "text-slate-400 hover:text-slate-200"
              )}
            >
              <AlignLeft className="w-3 h-3" />
              <span>Prose Script</span>
            </button>
          </div>

          {searchMatchCount > 0 && searchQuery && (
            <span className="text-[11px] font-mono text-indigo-400 font-semibold">
              {searchMatchCount} {searchMatchCount === 1 ? "match" : "matches"}
            </span>
          )}
        </div>

        {/* Search Input */}
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search keywords (promo, discount, product)..."
            className="w-full bg-slate-900/90 border border-slate-800 rounded-xl pl-8 pr-7 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-hidden focus:border-indigo-500/80 transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 text-slate-400 hover:text-white p-0.5 cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* 5. Transcript Body: Timeline Mode or Prose Mode */}
      {viewMode === "timeline" ? (
        <div className="space-y-2">
          {filteredSegments.length > 0 ? (
            <div className="space-y-1.5">
              {filteredSegments.map((seg) => {
                const isActive =
                  currentTime !== undefined &&
                  currentTime >= seg.start &&
                  currentTime <= seg.end;
                const segRtl = isRtlText(seg.text);

                return (
                  <div
                    key={seg.id}
                    className={cn(
                      "group p-2.5 rounded-xl border transition-all text-xs flex flex-col gap-1.5",
                      isActive
                        ? "bg-indigo-600/15 border-indigo-500/60 shadow-sm shadow-indigo-600/10"
                        : "bg-slate-900/70 hover:bg-slate-900 border-slate-800/80 hover:border-slate-700/80"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        {onSeek ? (
                          <button
                            type="button"
                            onClick={() => onSeek(seg.start)}
                            className={cn(
                              "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all cursor-pointer",
                              isActive
                                ? "bg-indigo-500 text-white shadow-xs"
                                : "bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 hover:text-indigo-300 border border-indigo-500/20"
                            )}
                            title={`Jump video to ${formatTimestamp(seg.start)}`}
                          >
                            <Play className="w-2.5 h-2.5 fill-current" />
                            <span>{formatTimestamp(seg.start)}</span>
                          </button>
                        ) : (
                          <span className="text-[10px] font-mono font-bold text-indigo-400">
                            [{formatTimestamp(seg.start)}]
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400 font-mono">
                          {seg.start.toFixed(1)}s – {seg.end.toFixed(1)}s
                        </span>
                      </div>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={(e) => copySegment(seg.id, seg.text, e)}
                          className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                          title="Copy segment text"
                        >
                          {copiedSegmentId === seg.id ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </div>

                    <p
                      dir={segRtl ? "rtl" : "ltr"}
                      className={cn(
                        "text-slate-200 leading-relaxed font-normal selection:bg-indigo-500/30",
                        segRtl ? "text-right" : "text-left"
                      )}
                    >
                      {renderHighlightedText(seg.text)}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-4 text-center rounded-xl bg-slate-900/60 border border-slate-800/80 text-xs text-slate-400">
              No transcript segments matched &ldquo;{searchQuery}&rdquo;.
            </div>
          )}
        </div>
      ) : (
        /* Prose Mode */
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-200 leading-relaxed space-y-3">
          <div
            dir={isRtl ? "rtl" : "ltr"}
            className={cn(
              "whitespace-pre-wrap selection:bg-indigo-500/30 font-normal",
              isRtl ? "text-right" : "text-left"
            )}
          >
            {renderHighlightedText(fullText)}
          </div>

          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
            <span>Continuous voiceover reading mode</span>
            <button
              type="button"
              onClick={copyFullText}
              className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer"
            >
              <Copy className="w-3 h-3" />
              <span>Copy Entire Script</span>
            </button>
          </div>
        </div>
      )}

      {/* Truncated notice if applicable */}
      {data?.isTruncated && (
        <div className="text-[11px] text-slate-400 italic px-2 pt-2 border-t border-slate-800/80">
          Audio stream was capped at 3 minutes to preserve microVM resources.
        </div>
      )}
    </div>
  );
}
