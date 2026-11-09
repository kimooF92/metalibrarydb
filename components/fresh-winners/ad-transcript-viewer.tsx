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

interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  prob?: number;
}

interface TranscriptData {
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

interface AdTranscriptViewerProps {
  adId: string;
  onSeek?: (seconds: number) => void;
}

export function AdTranscriptViewer({ adId, onSeek }: AdTranscriptViewerProps) {
  const [data, setData] = useState<TranscriptData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check initial cache/db status
  const checkStatus = useCallback(async () => {
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
  const handleTranscribe = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/spy/ads/${adId}/transcription-jobs`, {
        method: "POST",
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }

      const resData = await res.json();
      if (resData.status === "completed" && resData.transcript) {
        setData(resData.transcript);
        setIsLoading(false);
        setIsExpanded(true);
        return;
      }

      // Poll until finished (max 45 seconds)
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
      }, 2500);
    } catch (err: any) {
      setIsLoading(false);
      setError(err.message || "Failed to start transcription");
    }
  };

  const copyToClipboard = () => {
    if (data?.fullText) {
      navigator.clipboard.writeText(data.fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // 1. Initial State: Button to trigger transcription
  if (!data && !isLoading && !error) {
    return (
      <div className="pt-2">
        <button
          onClick={handleTranscribe}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-all cursor-pointer shadow-2xs"
        >
          <Mic className="w-3 h-3 text-indigo-500" />
          <span>Transcribe Voiceover</span>
        </button>
      </div>
    );
  }

  // 2. Loading State: Live animated feedback
  if (isLoading) {
    return (
      <div className="pt-2 flex items-center gap-2 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span>Transcribing audio on InstaBox (~5s)...</span>
      </div>
    );
  }

  // 3. Error State
  if (error) {
    return (
      <div className="pt-2 flex items-center gap-2 text-[11px] text-destructive">
        <AlertCircle className="w-3 h-3 shrink-0" />
        <span className="line-clamp-1">{error}</span>
        <button
          onClick={handleTranscribe}
          className="font-bold underline hover:no-underline ml-1 cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  // 4. No Speech / Instrumental State
  if (data?.status === "no_speech") {
    return (
      <div className="pt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground italic">
        <VolumeX className="w-3 h-3 text-slate-400" />
        <span>Instrumental / No speech detected in video</span>
      </div>
    );
  }

  // 5. Completed Transcript View
  if (data?.status === "completed" && data.fullText) {
    return (
      <div className="pt-2 space-y-2">
        {/* Header Ribbon */}
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-black text-[9px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="w-2.5 h-2.5" />
              <span>{data.language ? data.language.toUpperCase() : "VOICEOVER"}</span>
            </span>

            {data.durationSeconds && (
              <span className="text-[10px] text-muted-foreground font-mono">
                {Math.round(Number(data.durationSeconds))}s
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={copyToClipboard}
              title="Copy transcript"
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-all cursor-pointer"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
            </button>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10.5px] font-bold text-muted-foreground hover:text-foreground hover:bg-muted transition-all cursor-pointer"
            >
              <span>{isExpanded ? "Collapse" : "Read Transcript"}</span>
              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>
        </div>

        {/* 3.2s Opening Hook Badge */}
        {data.hookText && (
          <div className="p-2 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-800/40 text-[11px] leading-relaxed">
            <div className="flex items-center gap-1 font-black text-[9.5px] text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-0.5">
              <Sparkles className="w-2.5 h-2.5" />
              <span>3-Second Hook</span>
            </div>
            <p className="text-foreground font-semibold italic">"{data.hookText}"</p>
          </div>
        )}

        {/* Expandable Word / Sentence Flow with Click-to-Seek */}
        {isExpanded && (
          <div className="p-2.5 rounded-lg bg-muted/40 border border-border text-[11.5px] leading-relaxed max-h-48 overflow-y-auto space-y-2">
            {data.segments && data.segments.length > 0 ? (
              <div className="space-y-1.5">
                {data.segments.map((seg, idx) => (
                  <div key={seg.id || idx} className="group flex items-start gap-2">
                    {onSeek && (
                      <button
                        onClick={() => onSeek(seg.start)}
                        className="shrink-0 font-mono text-[9.5px] text-muted-foreground/70 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 group-hover:underline cursor-pointer pt-0.5"
                      >
                        {formatTimestamp(seg.start)}
                      </button>
                    )}
                    <span className="text-foreground font-normal">{seg.text}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-foreground whitespace-pre-line">{data.fullText}</p>
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

  return null;
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

