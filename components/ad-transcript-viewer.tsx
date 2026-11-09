"use client";

import React, { useState, useEffect, useCallback } from "react";
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
} from "lucide-react";

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  prob?: number;
}

export interface TranscriptData {
  status: "pending" | "processing" | "completed" | "no_speech" | "failed";
  language?: string;
  languageConfidence?: number;
  fullText?: string;
  hookText?: string | null;
  words?: WordTimestamp[];
  segments?: Array<{ id: number; start: number; end: number; text: string }>;
  durationSeconds?: number;
  isTruncated?: boolean;
  errorMessage?: string;
}

export interface AdTranscriptViewerProps {
  adId: string;
  onSeek?: (seconds: number) => void;
  compact?: boolean;
}

export function AdTranscriptViewer({ adId, onSeek, compact = false }: AdTranscriptViewerProps) {
  const [data, setData] = useState<TranscriptData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check initial cache/db status
  const checkStatus = useCallback(async () => {
    if (!adId) return;
    try {
      const res = await fetch(`/api/spy/ads/${adId}/transcription-jobs`);
      if (res.ok) {
        const json = await res.json();
        if (json.transcript) {
          setData(json.transcript);
        }
      }
    } catch {
      // Graceful silence on background check
    }
  }, [adId]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

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
        return;
      }

      if (resData.status === "no_speech" || resData.transcript?.status === "no_speech") {
        setData(resData.transcript || { status: "no_speech" });
        setIsLoading(false);
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
            } else if (pollData.transcript?.status === "no_speech") {
              clearInterval(pollInterval);
              setData(pollData.transcript);
              setIsLoading(false);
            } else if (pollData.transcript?.status === "failed") {
              clearInterval(pollInterval);
              setError(pollData.transcript.errorMessage || "Transcription failed");
              setIsLoading(false);
            }
          }
        } catch {
          // Keep polling
        }
      }, 2000);
    } catch (err: any) {
      setIsLoading(false);
      setError(err.message || "Failed to start transcription");
    }
  };

  const copyToClipboard = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const textToCopy = data?.fullText || (data as any)?.full_text;
    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Normalize camelCase and snake_case to support both DB records and cached MicroVM payloads
  const fullText = data?.fullText || (data as any)?.full_text;
  const hookText = data?.hookText || (data as any)?.hook_text;
  const durationSeconds = data?.durationSeconds || (data as any)?.duration_seconds;

  // 1. Loading State: Live animated feedback
  if (isLoading || data?.status === "processing" || data?.status === "pending") {
    return (
      <div className="pt-2 flex items-center gap-2 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span>Transcribing audio on InstaBox (~10s)...</span>
      </div>
    );
  }

  // 2. Error State: Local error or database recorded failure
  if (error || data?.status === "failed") {
    const errorMsg = error || data?.errorMessage || "Transcription failed";
    return (
      <div className="pt-2 flex items-center gap-2 text-[11px] text-destructive">
        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
        <span className="line-clamp-1 truncate max-w-[220px]">{errorMsg}</span>
        <button
          type="button"
          onClick={handleTranscribe}
          className="font-bold underline hover:no-underline ml-1 cursor-pointer text-indigo-600 dark:text-indigo-400 shrink-0"
        >
          Retry
        </button>
      </div>
    );
  }

  // 3. No Speech / Instrumental State
  if (data?.status === "no_speech") {
    return (
      <div className="pt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground italic">
        <VolumeX className="w-3 h-3 text-slate-400" />
        <span>Instrumental / No speech detected in video</span>
      </div>
    );
  }

  // 4. Completed Transcript View (Handles both fullText and full_text)
  if (data?.status === "completed" && fullText) {
    return (
      <div className="pt-2 space-y-2">
        {/* Header Ribbon */}
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-black text-[9px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="w-2.5 h-2.5" />
              <span>{data.language ? data.language.toUpperCase() : "VOICEOVER"}</span>
            </span>

            {durationSeconds && (
              <span className="text-[10px] text-muted-foreground font-mono">
                {Math.round(Number(durationSeconds))}s
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={copyToClipboard}
              title="Copy transcript"
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-all cursor-pointer"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10.5px] font-bold text-muted-foreground hover:text-foreground hover:bg-muted transition-all cursor-pointer"
            >
              <span>{isExpanded ? "Collapse" : "Read Transcript"}</span>
              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>
        </div>

        {/* Highlight Opening Hook (0-3.2s) */}
        {hookText && !isExpanded && (
          <div className="p-2 rounded-lg bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-800/60 text-[11px] leading-relaxed">
            <div className="flex items-center gap-1 text-[9.5px] font-black uppercase text-indigo-600 dark:text-indigo-400 mb-0.5 tracking-wider">
              <Sparkles className="w-2.5 h-2.5" />
              <span>Opening Hook (0–3.2s)</span>
            </div>
            <p className="text-foreground font-medium italic">
              &ldquo;{hookText}&rdquo;
            </p>
          </div>
        )}

        {/* Expanded Transcript with Word Timestamps */}
        {isExpanded && (
          <div className="p-2.5 rounded-lg bg-muted/50 border border-border/80 text-[11px] leading-relaxed space-y-2">
            {data.segments && data.segments.length > 0 ? (
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {data.segments.map((seg) => (
                  <div key={seg.id} className="flex items-baseline gap-2">
                    {onSeek && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onSeek(seg.start);
                        }}
                        className="text-[9.5px] font-mono font-bold text-indigo-600 dark:text-indigo-400 hover:underline shrink-0 cursor-pointer"
                        title={`Jump video to ${formatTimestamp(seg.start)}`}
                      >
                        [{formatTimestamp(seg.start)}]
                      </button>
                    )}
                    <span className="text-foreground font-normal">{seg.text}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-foreground whitespace-pre-line">{fullText}</p>
            )}

            {data.isTruncated && (
              <span className="block text-[10px] text-muted-foreground/70 italic pt-1 border-t border-border/50">
                Audio was capped at 3 minutes to preserve server quotas.
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  // 5. Default State: Transcribe button is ALWAYS visible! (Never return null)
  return (
    <div className="pt-2">
      <button
        type="button"
        onClick={handleTranscribe}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-all cursor-pointer shadow-2xs"
      >
        <Mic className="w-3 h-3 text-indigo-500" />
        <span>Transcribe Voiceover</span>
      </button>
    </div>
  );
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

