"use client";

import { useEffect, useState } from "react";
import { TrackedPage, ScanHistoryEntry } from "@/types";
import { X, Calendar, Loader2, ExternalLink, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";

interface HistoryModalProps {
  page: TrackedPage | null;
  isOpen: boolean;
  onClose: () => void;
}

export function HistoryModal({ page, isOpen, onClose }: HistoryModalProps) {
  const [history, setHistory] = useState<ScanHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl glass-panel rounded-2xl border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-900/50">
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-base font-bold text-slate-100">
                Scan History
              </h2>
              <a
                href={page.url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center space-x-1"
              >
                <span>View Meta Ad Library</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {page.displayName || page.url}
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-400 mb-2" />
              <span className="text-xs">Loading scan history...</span>
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              No historical scan records available yet.
            </div>
          ) : (
            <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-950/50">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/80 text-slate-400 uppercase font-semibold border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Scan Date</th>
                    <th className="px-4 py-3">Result Count</th>
                    <th className="px-4 py-3">Difference</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {history.map((item) => {
                    const diff = item.difference;
                    let diffBadge = (
                      <span className="inline-flex items-center text-slate-400">
                        <Minus className="w-3 h-3 mr-1" /> 0
                      </span>
                    );

                    if (diff !== null && diff !== undefined && diff !== 0) {
                      if (diff > 0) {
                        diffBadge = (
                          <span className="inline-flex items-center font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                            <ArrowUpRight className="w-3 h-3 mr-0.5" /> +{diff}
                          </span>
                        );
                      } else {
                        diffBadge = (
                          <span className="inline-flex items-center font-semibold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                            <ArrowDownRight className="w-3 h-3 mr-0.5" /> {diff}
                          </span>
                        );
                      }
                    }

                    return (
                      <tr key={item.id} className="hover:bg-slate-900/40 transition-all">
                        <td className="px-4 py-3 text-slate-300 font-mono">
                          {new Date(item.checkedAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-100">
                          {item.results !== null ? item.results.toLocaleString() : "—"}
                        </td>
                        <td className="px-4 py-3">{diffBadge}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium uppercase ${
                              item.status === "success"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : item.status === "unclear"
                                ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                            }`}
                          >
                            {item.status}
                            {item.failureReason ? ` (${item.failureReason})` : ""}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
