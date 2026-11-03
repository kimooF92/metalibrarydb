"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getSupabase } from "@/lib/supabase";
import {
  SCAN_TELEMETRY_CHANNEL,
  SCAN_STEP_EVENT,
  SCAN_BATCH_EVENT,
  SCAN_STATE_EVENT,
  type ScanStepBroadcastPayload,
  type ScanBatchSummaryPayload,
  type EngineStatePayload,
  type ScanScheduleStatus,
} from "@/lib/realtime-scan-types";

export function formatCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return "Due Now";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => String(n).padStart(2, "0");
  if (hours > 0) {
    return `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
  }
  return `${pad(minutes)}m ${pad(seconds)}s`;
}

export function useScanStatus() {
  const [scheduleStatus, setScheduleStatus] = useState<ScanScheduleStatus | null>(null);
  const [activeScan, setActiveScan] = useState<ScanStepBroadcastPayload | null>(null);
  const [lastBatchSummary, setLastBatchSummary] = useState<ScanBatchSummaryPayload | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [isTriggering, setIsTriggering] = useState<boolean>(false);

  const targetScanTimeRef = useRef<number | null>(null);

  // 1. Initial HTTP Hydration from /api/scan-status
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/scan-status");
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setScheduleStatus({
            nextScanAt: json.nextScanAt,
            nextScanReason: json.nextScanReason,
            secondsRemaining: json.secondsRemaining,
            isQueueRunning: json.isQueueRunning,
            pendingJobsCount: json.pendingJobsCount,
            runningJobsCount: json.runningJobsCount,
            oldestBrandName: json.oldestBrandName,
            workerState: json.workerState,
          });

          if (json.nextScanAt) {
            const targetMs = new Date(json.nextScanAt).getTime();
            targetScanTimeRef.current = targetMs;
            const diff = Math.max(0, Math.round((targetMs - Date.now()) / 1000));
            setSecondsRemaining(diff);
          }

          if (json.activeScan) {
            setActiveScan(json.activeScan);
          }
          if (json.lastBatchSummary) {
            setLastBatchSummary(json.lastBatchSummary);
          }
        }
      }
    } catch (err) {
      console.warn("[useScanStatus] Failed to fetch scan status:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // 2. High-Precision Client-Side Countdown Ticker (1 second interval)
  useEffect(() => {
    const timer = setInterval(() => {
      if (targetScanTimeRef.current) {
        const remaining = Math.max(0, Math.round((targetScanTimeRef.current - Date.now()) / 1000));
        setSecondsRemaining(remaining);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // 3. Supabase Realtime Broadcast Listener (Zero Database WAL Overhead)
  useEffect(() => {
    let channel: any = null;
    try {
      const supabase = getSupabase();
      channel = supabase
        .channel(SCAN_TELEMETRY_CHANNEL)
        .on("broadcast", { event: SCAN_STEP_EVENT }, (msg: { payload: ScanStepBroadcastPayload }) => {
          if (!msg?.payload) return;
          const step = msg.payload;
          setActiveScan(step);

          // If job completed or failed, keep it visible for 4s then clear
          if (step.step === "completed" || step.step === "failed") {
            setTimeout(() => {
              setActiveScan((prev) => (prev?.jobId === step.jobId ? null : prev));
              fetchStatus();
            }, 4000);
          }
        })
        .on("broadcast", { event: SCAN_BATCH_EVENT }, (msg: { payload: ScanBatchSummaryPayload }) => {
          if (!msg?.payload) return;
          setLastBatchSummary(msg.payload);
          setActiveScan(null);
          fetchStatus();
        })
        .on("broadcast", { event: SCAN_STATE_EVENT }, (msg: { payload: EngineStatePayload }) => {
          if (!msg?.payload) return;
          fetchStatus();
        })
        .subscribe();
    } catch (err) {
      console.warn("[useScanStatus] Realtime broadcast subscription error:", err);
    }

    return () => {
      if (channel) {
        try {
          const supabase = getSupabase();
          supabase.removeChannel(channel);
        } catch {}
      }
    };
  }, [fetchStatus]);

  // 4. Trigger Scan Now Action
  const triggerScanNow = useCallback(
    async (forceAll = false) => {
      setIsTriggering(true);
      try {
        const res = await fetch(`/api/scan-status?force=${forceAll ? "true" : "false"}`, {
          method: "POST",
        });
        const data = await res.json();
        if (data.success) {
          await fetchStatus();
          return { success: true, count: data.enqueuedCount };
        }
        return { success: false, error: data.error || "Failed to trigger scan" };
      } catch (err: any) {
        return { success: false, error: err?.message || "Network error" };
      } finally {
        setIsTriggering(false);
      }
    },
    [fetchStatus]
  );

  const formattedCountdown = formatCountdown(secondsRemaining);

  return {
    scheduleStatus,
    activeScan,
    lastBatchSummary,
    secondsRemaining,
    formattedCountdown,
    loading,
    isTriggering,
    triggerScanNow,
    refreshStatus: fetchStatus,
  };
}

