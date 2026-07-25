"use client";

import { useEffect, useState } from "react";
import { WorkerState } from "@/types";
import { PauseCircle, PlayCircle, ShieldAlert, Cpu } from "lucide-react";

export function WorkerStatus() {
  const [state, setState] = useState<WorkerState | null>(null);
  const [isBackoffActive, setIsBackoffActive] = useState(false);
  const [loading, setLoading] = useState(false);

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
      <div className="flex items-center space-x-2 text-xs text-slate-400 bg-slate-900/60 px-3 py-1.5 rounded-full border border-slate-800">
        <Cpu className="w-3.5 h-3.5 animate-pulse" />
        <span>Worker: Checking...</span>
      </div>
    );
  }

  const isPaused = state.isPaused;

  return (
    <div className="flex items-center space-x-3">
      {/* Backoff Warning Banner */}
      {isBackoffActive && (
        <div className="hidden md:flex items-center space-x-1.5 text-xs text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>Worker paused — repeated failures detected</span>
        </div>
      )}

      {/* Main Status Pill & Kill Switch Button */}
      <div className="flex items-center space-x-2 bg-slate-900/80 p-1 pl-3 rounded-full border border-slate-800">
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
          <span className="text-xs font-medium text-slate-300">
            {isPaused
              ? "Paused"
              : isBackoffActive
              ? "Backoff Cooldown"
              : "Worker Ready"}
          </span>
        </div>

        <button
          onClick={toggleWorker}
          disabled={loading}
          title={isPaused ? "Resume worker activity" : "Immediately pause all worker activity"}
          className={`flex items-center space-x-1 text-xs px-2.5 py-1 rounded-full font-medium transition-all ${
            isPaused
              ? "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30"
              : "bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/30"
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
    </div>
  );
}
