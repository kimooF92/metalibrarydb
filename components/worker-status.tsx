"use client";

import { useEffect, useState } from "react";
import { WorkerState } from "@/types";
import { PauseCircle, PlayCircle, ShieldAlert, Cpu, Trash2, CheckCircle2 } from "lucide-react";

export function WorkerStatus({ layout = "horizontal" }: { layout?: "horizontal" | "vertical" | "collapsed" }) {
  const [state, setState] = useState<WorkerState | null>(null);
  const [isBackoffActive, setIsBackoffActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pruning, setPruning] = useState(false);
  const [pruneCount, setPruneCount] = useState<number | null>(null);
  const [pruneToast, setPruneToast] = useState<string | null>(null);

  const fetchWorkerState = async () => {
    try {
      const res = await fetch("/api/worker");
      if (res.ok) {
        const data = await res.json();
        setState(data.state);
        setIsBackoffActive(data.isBackoffActive);
      }
    } catch {
      // Quiet failure
    }
  };

  useEffect(() => {
    fetchWorkerState();
    const interval = setInterval(fetchWorkerState, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Fetch prunable count on mount
    fetch("/api/queue/prune")
      .then((r) => r.json())
      .then((d) => setPruneCount(d.eligible ?? 0))
      .catch(() => {});
  }, []);

  const pruneQueue = async () => {
    if (pruneCount === 0) return;
    setPruning(true);
    try {
      const res = await fetch("/api/queue/prune", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setPruneToast(`Pruned ${data.pruned} old job(s).`);
        setPruneCount(0);
        setTimeout(() => setPruneToast(null), 3000);
      }
    } catch {
    } finally {
      setPruning(false);
    }
  };

  const toggleWorker = async () => {
    if (!state) return;
    setLoading(true);
    try {
      const res = await fetch("/api/worker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pause: !state.isPaused }),
      });
      if (res.ok) {
        const data = await res.json();
        setState(data.state);
      }
    } catch (err) {
      console.error("Failed to toggle worker state", err);
    } finally {
      setLoading(false);
    }
  };

  if (!state) {
    return (
      <div className="flex items-center justify-center py-1.5 px-3 rounded-lg bg-slate-105 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
        <Cpu className="w-3.5 h-3.5 animate-pulse mr-1.5" />
        {layout !== "collapsed" && <span>Checking...</span>}
      </div>
    );
  }

  const isPaused = state.isPaused;

  if (layout === "collapsed") {
    return (
      <button
        onClick={toggleWorker}
        disabled={loading}
        title={isPaused ? "Worker is Paused. Click to Resume." : isBackoffActive ? "Worker Cooldown. Click to Resume." : "Worker Active. Click to Pause."}
        className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-slate-200/40 dark:hover:bg-slate-805 border border-transparent hover:border-slate-200 dark:hover:border-slate-800/60 transition-all cursor-pointer relative"
      >
        <span className="relative flex h-3.5 w-3.5">
          {!isPaused && !isBackoffActive && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          )}
          <span
            className={`relative inline-flex rounded-full h-3.5 w-3.5 ${
              isPaused
                ? "bg-slate-500"
                : isBackoffActive
                ? "bg-amber-400"
                : "bg-emerald-500"
            }`}
          ></span>
        </span>
      </button>
    );
  }

  if (layout === "vertical") {
    return (
      <div className="flex flex-col space-y-3 w-full">
        {/* Status Indicator & Control */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="relative flex h-2 w-2">
              {!isPaused && !isBackoffActive && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              )}
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  isPaused
                    ? "bg-slate-500"
                    : isBackoffActive
                    ? "bg-amber-400"
                    : "bg-emerald-500"
                }`}
              ></span>
            </span>
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              {isPaused
                ? "Paused"
                : isBackoffActive
                ? "Backoff Cooldown"
                : "Worker Active"}
            </span>
          </div>
          
          <button
            onClick={toggleWorker}
            disabled={loading}
            className={`text-[10px] px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
              isPaused
                ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 border border-emerald-200 dark:border-emerald-500/20"
                : "bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/20 border border-rose-200 dark:border-rose-500/20"
            }`}
          >
            {isPaused ? "Resume" : "Pause"}
          </button>
        </div>

        {/* Backoff / Warning */}
        {isBackoffActive && (
          <div className="flex items-start space-x-1.5 text-[10px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 p-2 rounded-lg border border-amber-250 dark:border-amber-500/20">
            <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>Repeated scraper failures detected. Cooldown active.</span>
          </div>
        )}

        {/* Progress Bars Stack */}
        <div className="flex flex-col space-y-2 bg-white dark:bg-slate-950/65 p-2.5 rounded-lg border border-slate-200 dark:border-slate-900">
          {/* Hourly Scans */}
          <div className="flex flex-col space-y-1">
            <div className="flex justify-between text-[9px]">
              <span className="text-slate-450 dark:text-slate-500 font-medium">Hourly Scans</span>
              <span className="text-slate-700 dark:text-slate-400 font-mono font-bold">{state.scansThisHour ?? 0} / 20</span>
            </div>
            <div className="w-full h-1 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, ((state.scansThisHour ?? 0) / 20) * 100)}%`,
                  background: (state.scansThisHour ?? 0) >= 18
                    ? "#f87171"
                    : (state.scansThisHour ?? 0) >= 12
                    ? "#fbbf24"
                    : "#6366f1",
                }}
              />
            </div>
          </div>
          {/* Daily Scans */}
          <div className="flex flex-col space-y-1">
            <div className="flex justify-between text-[9px]">
              <span className="text-slate-450 dark:text-slate-500 font-medium">Daily Scans</span>
              <span className="text-slate-700 dark:text-slate-400 font-mono font-bold">{state.scansToday ?? 0} / 150</span>
            </div>
            <div className="w-full h-1 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, ((state.scansToday ?? 0) / 150) * 100)}%`,
                  background: (state.scansToday ?? 0) >= 135
                    ? "#f87171"
                    : (state.scansToday ?? 0) >= 100
                    ? "#fbbf24"
                    : "#6366f1",
                }}
              />
            </div>
          </div>
        </div>

        {/* Queue Pruning Action */}
        {pruneCount !== null && pruneCount > 0 && (
          <button
            onClick={pruneQueue}
            disabled={pruning}
            className="flex items-center justify-center space-x-1.5 text-[10px] w-full text-slate-550 dark:text-slate-400 hover:text-rose-650 dark:hover:text-rose-300 bg-white dark:bg-slate-900/60 hover:bg-rose-50 dark:hover:bg-rose-500/10 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-rose-300 dark:hover:border-rose-500/30 transition-all cursor-pointer"
          >
            <Trash2 className="w-3 h-3" />
            <span>Prune {pruneCount} old jobs</span>
          </button>
        )}
        
        {/* Pruning Toast inside Vertical */}
        {pruneToast && (
          <div className="flex items-center justify-center space-x-1.5 text-[10px] text-emerald-400 bg-emerald-500/10 py-1.5 rounded-lg border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" />
            <span>{pruneToast}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-3">
      {/* Prune Toast */}
      {pruneToast && (
        <div className="hidden md:flex items-center space-x-1.5 text-xs text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>{pruneToast}</span>
        </div>
      )}
      {/* Backoff Warning Banner */}
      {isBackoffActive && (
        <div className="hidden md:flex items-center space-x-1.5 text-xs text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>Worker paused — repeated failures detected</span>
        </div>
      )}

      {/* Main Status Pill & Kill Switch Button */}
      <div className="flex items-center space-x-2 bg-white dark:bg-slate-900/80 p-1 pl-3 rounded-full border border-slate-200 dark:border-slate-800">
        <div className="flex items-center space-x-2">
          <span className="relative flex h-2 w-2">
            {!isPaused && !isBackoffActive && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            )}
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                isPaused
                  ? "bg-slate-500"
                  : isBackoffActive
                  ? "bg-amber-400"
                  : "bg-emerald-500"
              }`}
            ></span>
          </span>
          <span className="text-xs font-medium text-slate-705 dark:text-slate-300">
            {isPaused
              ? "Paused"
              : isBackoffActive
              ? "Backoff Cooldown"
              : "Worker Ready"}
          </span>
        </div>

        <div className="hidden lg:flex flex-col gap-0.5 border-l border-slate-200 dark:border-slate-800 pl-2 min-w-[80px]">
          {/* Hourly rate bar */}
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-slate-400 dark:text-slate-500 w-4 shrink-0">1h</span>
            <div className="flex-1 h-1 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, ((state.scansThisHour ?? 0) / 20) * 100)}%`,
                  background: (state.scansThisHour ?? 0) >= 18
                    ? "#f87171"
                    : (state.scansThisHour ?? 0) >= 12
                    ? "#fbbf24"
                    : "#6366f1",
                }}
              />
            </div>
            <span className="text-[9px] font-mono text-slate-600 dark:text-slate-400">{state.scansThisHour ?? 0}/20</span>
          </div>
          {/* Daily rate bar */}
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-slate-400 dark:text-slate-500 w-4 shrink-0">1d</span>
            <div className="flex-1 h-1 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, ((state.scansToday ?? 0) / 150) * 100)}%`,
                  background: (state.scansToday ?? 0) >= 135
                    ? "#f87171"
                    : (state.scansToday ?? 0) >= 100
                    ? "#fbbf24"
                    : "#6366f1",
                }}
              />
            </div>
            <span className="text-[9px] font-mono text-slate-600 dark:text-slate-400">{state.scansToday ?? 0}/150</span>
          </div>
        </div>

        <button
          onClick={toggleWorker}
          disabled={loading}
          title={isPaused ? "Resume worker activity" : "Immediately pause all worker activity"}
          className={`flex items-center space-x-1 text-xs px-2.5 py-1 rounded-full font-medium transition-all ${
            isPaused
              ? "bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-500/30 border border-emerald-250 dark:border-emerald-500/30"
              : "bg-rose-50 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-500/30 border border-rose-250 dark:border-rose-500/30"
          }`}
        >
          {isPaused ? (
            <>
              <PlayCircle className="w-3.5 h-3.5" />
              <span>Resume</span>
            </>
          ) : (
            <>
              <PauseCircle className="w-3.5 h-3.5" />
              <span>Pause Worker</span>
            </>
          )}
        </button>
      </div>

      {/* Queue Prune button */}
      {pruneCount !== null && pruneCount > 0 && !pruneToast && (
        <button
          onClick={pruneQueue}
          disabled={pruning}
          title={`Prune ${pruneCount} completed queue job(s) older than 30 days`}
          className="hidden md:flex items-center space-x-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-rose-650 dark:hover:text-rose-300 bg-white dark:bg-slate-900/60 hover:bg-rose-50 dark:hover:bg-rose-505/10 px-2.5 py-1 rounded-full border border-slate-202 dark:border-slate-800 hover:border-rose-300 dark:hover:border-rose-500/30 transition-all cursor-pointer"
        >
          <Trash2 className="w-3 h-3" />
          <span>Prune ({pruneCount})</span>
        </button>
      )}
    </div>
  );
}
