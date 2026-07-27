"use client";

import { useEffect, useState } from "react";
import { TrackedPage, ScanHistoryEntry } from "@/types";
import { X, Calendar, Loader2, ExternalLink, ArrowUpRight, ArrowDownRight, Minus, ChevronUp, ChevronDown } from "lucide-react";

interface HistoryModalProps {
  page: TrackedPage | null;
  isOpen: boolean;
  onClose: () => void;
}

// Pure SVG sparkline — no external dependencies
function Sparkline({ data }: { data: (number | null)[] }) {
  const values = data.filter((v): v is number => v !== null);
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const width = 200;
  const height = 40;
  const padding = 4;

  const points = values.map((v, i) => {
    const x = padding + (i / (values.length - 1)) * (width - padding * 2);
    const y = padding + (1 - (v - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  const polyline = points.join(" ");
  const areaPoints = [
    `${padding},${height - padding}`,
    ...points,
    `${width - padding},${height - padding}`,
  ].join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-10"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="sparkGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill="url(#sparkGrad)" />
      <polyline points={polyline} fill="none" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Last point dot */}
      {points.length > 0 && (() => {
        const last = points[points.length - 1].split(",");
        return (
          <circle cx={last[0]} cy={last[1]} r="2.5" fill="#6366f1" />
        );
      })()}
    </svg>
  );
}

export function HistoryModal({ page, isOpen, onClose }: HistoryModalProps) {
  const [history, setHistory] = useState<ScanHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortAsc, setSortAsc] = useState(false); // newest first by default

  useEffect(() => {
    if (isOpen && page) {
      fetchHistory(page.id);
    }
  }, [isOpen, page]);

  const fetchHistory = async (pageId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/history/${pageId}`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history || []);
      }
    } catch (err) {
      console.error("Failed to fetch scan history", err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !page) return null;

  const sorted = [...history].sort((a, b) => {
    const ta = new Date(a.checkedAt).getTime();
    const tb = new Date(b.checkedAt).getTime();
    return sortAsc ? ta - tb : tb - ta;
  });

  // Sparkline data: chronological order (oldest → newest)
  const sparkData = [...history]
    .sort((a, b) => new Date(a.checkedAt).getTime() - new Date(b.checkedAt).getTime())
    .map((h) => h.results);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-20 px-4 bg-slate-950/40 dark:bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-modal-title"
        className="relative w-full max-w-2xl glass-panel rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-900/50">
          <div>
            <div className="flex items-center space-x-2">
              <h2 id="history-modal-title" className="text-base font-bold text-slate-900 dark:text-slate-100">
                Scan History
              </h2>
              <a
                href={page.url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-indigo-650 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-305 flex items-center space-x-1"
              >
                <span>View Meta Ad Library</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {page.displayName || page.url}
            </p>
          </div>

          <button
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 text-slate-800 dark:text-slate-100">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500 dark:text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500 dark:text-indigo-400 mb-2" />
              <span className="text-xs">Loading scan history...</span>
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-12 text-slate-550 dark:text-slate-400 text-sm">
              No historical scan records available yet.
            </div>
          ) : (
            <>
              {/* Sparkline Chart */}
              {sparkData.length >= 2 && (
                <div className="mb-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 px-4 pt-3 pb-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Result Trend ({history.length} scans)
                    </span>
                    <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                      min {Math.min(...sparkData.filter((v): v is number => v !== null)).toLocaleString()} →
                      max {Math.max(...sparkData.filter((v): v is number => v !== null)).toLocaleString()}
                    </span>
                  </div>
                  <Sparkline data={sparkData} />
                </div>
              )}

              {/* Sort Control */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-slate-500 dark:text-slate-400">{history.length} scan records</span>
                <button
                  onClick={() => setSortAsc((s) => !s)}
                  className="flex items-center space-x-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-205 bg-white dark:bg-slate-900/60 hover:bg-slate-50 dark:hover:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 transition-all cursor-pointer"
                >
                  <Calendar className="w-3 h-3" />
                  <span>{sortAsc ? "Oldest First" : "Newest First"}</span>
                  {sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-950/50">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-900/80 text-slate-550 dark:text-slate-400 uppercase font-semibold border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-4 py-3">Scan Date</th>
                      <th className="px-4 py-3">Result Count</th>
                      <th className="px-4 py-3">Difference</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
                    {sorted.map((item) => {
                      const diff = item.difference;
                      let diffBadge = (
                        <span className="inline-flex items-center text-slate-500 dark:text-slate-400">
                          <Minus className="w-3 h-3 mr-1" /> 0
                        </span>
                      );

                      if (diff !== null && diff !== undefined && diff !== 0) {
                        if (diff > 0) {
                          diffBadge = (
                            <span className="inline-flex items-center font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                              <ArrowUpRight className="w-3 h-3 mr-0.5" /> +{diff}
                            </span>
                          );
                        } else {
                          diffBadge = (
                            <span className="inline-flex items-center font-semibold text-rose-600 dark:text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                              <ArrowDownRight className="w-3 h-3 mr-0.5" /> {diff}
                            </span>
                          );
                        }
                      }

                      return (
                        <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-all">
                          <td className="px-4 py-3 text-slate-700 dark:text-slate-300 font-mono">
                            {new Date(item.checkedAt).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                            {item.results !== null ? item.results.toLocaleString() : "—"}
                          </td>
                          <td className="px-4 py-3">{diffBadge}</td>
                          <td className="px-4 py-3">
                            {item.status === "success" && item.results === 0 ? (
                              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border border-slate-205 dark:border-slate-700/60">
                                0 Active Ads
                              </span>
                            ) : (
                              <span
                                className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium uppercase ${
                                  item.status === "success"
                                    ? "bg-emerald-500/10 text-emerald-650 dark:text-emerald-400 border border-emerald-500/20"
                                    : item.status === "unclear"
                                    ? "bg-purple-500/10 text-purple-650 dark:text-purple-300 border border-purple-500/20"
                                    : "bg-rose-500/10 text-rose-650 dark:text-rose-400 border border-rose-500/20"
                                }`}
                              >
                                {item.status}
                                {item.failureReason ? ` (${item.failureReason})` : ""}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
