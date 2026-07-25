"use client";

import { useState } from "react";
import { PlusCircle, Loader2, Link2, AlertCircle, CheckCircle2 } from "lucide-react";

interface AddUrlFormProps {
  onSuccess?: () => void;
}

export function AddUrlForm({ onSuccess }: AddUrlFormProps) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [duplicatePage, setDuplicatePage] = useState<any | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error" | "duplicate";
    message: string;
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent, force = false) => {
    if (e) e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setFeedback(null);
    setDuplicatePage(null);

    try {
      const res = await fetch("/api/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), allowDuplicate: force }),
      });

      const data = await res.json();

      if (res.status === 201) {
        setFeedback({
          type: "success",
          message: force
            ? "URL added as a separate entry!"
            : "URL successfully added to monitoring queue!",
        });
        setUrl("");
        setDuplicatePage(null);
        if (onSuccess) onSuccess();
        setTimeout(() => setFeedback(null), 4500);
      } else if (res.status === 409) {
        setDuplicatePage(data.page || null);
        setFeedback({
          type: "duplicate",
          message: data.error || "A matching page is already being tracked.",
        });
      } else {
        setFeedback({
          type: "error",
          message: data.error || "Failed to add URL. Please verify format.",
        });
      }
    } catch (err) {
      setFeedback({
        type: "error",
        message: "Network error while adding URL.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshExisting = async () => {
    if (!duplicatePage?.id) return;
    setLoading(true);
    try {
      const res = await fetch("/api/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [duplicatePage.id] }),
      });
      if (res.ok) {
        setFeedback({
          type: "success",
          message: `Enqueued refresh scan for existing page "${duplicatePage.displayName || duplicatePage.url}".`,
        });
        setDuplicatePage(null);
        setUrl("");
        if (onSuccess) onSuccess();
        setTimeout(() => setFeedback(null), 4500);
      }
    } catch {
      setFeedback({ type: "error", message: "Failed to refresh existing page." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-card rounded-xl p-4 sm:p-5">
      <div className="flex items-center space-x-2 mb-3">
        <Link2 className="w-4 h-4 text-indigo-400" />
        <h3 className="text-sm font-semibold text-slate-200">
          Add Single Meta Ad Library URL
        </h3>
      </div>

      <form onSubmit={(e) => handleSubmit(e, false)} className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.facebook.com/ads/library/?active_status=all&ad_type=all&view_all_page_id=..."
            className="w-full bg-slate-950/80 text-sm text-slate-100 placeholder-slate-500 rounded-lg px-4 py-2.5 border border-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all"
            disabled={loading}
          />
          <p className="text-[11px] text-slate-500 mt-1">
            Must be a valid Meta Ad Library link (<code className="text-indigo-300">facebook.com/ads/library</code>)
          </p>
        </div>

        <button
          type="submit"
          disabled={loading || !url.trim()}
          className="flex items-center justify-center space-x-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 disabled:opacity-50 text-white font-medium text-sm px-5 py-2.5 rounded-lg shadow-md shadow-indigo-600/20 transition-all cursor-pointer disabled:cursor-not-allowed self-start"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <PlusCircle className="w-4 h-4" />
          )}
          <span>Track URL</span>
        </button>
      </form>

      {/* Interactive Duplicate Choice Banner */}
      {feedback?.type === "duplicate" && duplicatePage && (
        <div className="mt-3 p-3.5 rounded-xl border bg-amber-950/40 border-amber-500/30 text-amber-200 text-xs space-y-3 animate-in fade-in duration-200">
          <div className="flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-white">Duplicate Found: </span>
              <span>"{duplicatePage.displayName || duplicatePage.url}" is already being tracked</span>
              {duplicatePage.currentResults !== null && duplicatePage.currentResults !== undefined && (
                <span className="text-amber-300 font-medium"> ({duplicatePage.currentResults} active ads)</span>
              )}.
              <p className="text-slate-400 text-[11px] mt-0.5">Would you like to refresh the existing page or force add a separate entry?</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-amber-500/20">
            <button
              onClick={handleRefreshExisting}
              disabled={loading}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all cursor-pointer shadow-sm"
            >
              Refresh Existing Page
            </button>
            <button
              onClick={() => handleSubmit(null as any, true)}
              disabled={loading}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium border border-slate-700 transition-all cursor-pointer"
            >
              Keep Separate / Add Anyway
            </button>
            <button
              onClick={() => {
                setFeedback(null);
                setDuplicatePage(null);
              }}
              className="px-2.5 py-1.5 text-slate-400 hover:text-slate-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* General Feedback Messages */}
      {feedback && feedback.type !== "duplicate" && (
        <div
          className={`mt-3 flex items-start space-x-2 text-xs p-3 rounded-lg border ${
            feedback.type === "success"
              ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
              : "bg-rose-500/10 text-rose-300 border-rose-500/20"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}
    </div>
  );
}

