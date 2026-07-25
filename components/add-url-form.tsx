"use client";

import { useState } from "react";
import { PlusCircle, Loader2, Link2, AlertCircle, CheckCircle2 } from "lucide-react";

interface AddUrlFormProps {
  onSuccess?: () => void;
}

export function AddUrlForm({ onSuccess }: AddUrlFormProps) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error" | "duplicate";
    message: string;
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await res.json();

      if (res.status === 201) {
        setFeedback({
          type: "success",
          message: "URL successfully added to monitoring queue!",
        });
        setUrl("");
        if (onSuccess) onSuccess();
      } else if (res.status === 409) {
        setFeedback({
          type: "duplicate",
          message: data.error || "URL is already being tracked.",
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

  return (
    <div className="glass-card rounded-xl p-5 mb-8">
      <div className="flex items-center space-x-2 mb-3">
        <Link2 className="w-4 h-4 text-indigo-400" />
        <h3 className="text-sm font-semibold text-slate-200">
          Add Single Meta Ad Library URL
        </h3>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.facebook.com/ads/library/?active_status=all&ad_type=all&view_all_page_id=..."
            className="w-full bg-slate-950/80 text-sm text-slate-100 placeholder-slate-500 rounded-lg px-4 py-2.5 border border-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all"
            disabled={loading}
          />
        </div>

        <button
          type="submit"
          disabled={loading || !url.trim()}
          className="flex items-center justify-center space-x-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 disabled:opacity-50 text-white font-medium text-sm px-5 py-2.5 rounded-lg shadow-md shadow-indigo-600/20 transition-all cursor-pointer disabled:cursor-not-allowed"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <PlusCircle className="w-4 h-4" />
          )}
          <span>Track URL</span>
        </button>
      </form>

      {/* Feedback Messages */}
      {feedback && (
        <div
          className={`mt-3 flex items-start space-x-2 text-xs p-3 rounded-lg border ${
            feedback.type === "success"
              ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
              : feedback.type === "duplicate"
              ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
              : "bg-rose-500/10 text-rose-300 border-rose-500/20"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}
    </div>
  );
}
