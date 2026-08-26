import { ReactNode } from "react";
import Link from "next/link";
import { ExternalLink, Flame, Trophy, Video, Image as ImageIcon, Layers } from "lucide-react";

interface LeaderboardRowProps {
  rank: number;
  imageUrl?: string | null;
  title: string;
  subtitle?: string | null;
  tag?: string | null;
  badge?: {
    text: string;
    variant?: "emerald" | "amber" | "indigo" | "rose" | "purple" | "slate";
  };
  metrics: Array<{
    label: string;
    value: string | number;
    highlight?: boolean;
  }>;
  actionUrl?: string;
  actionLabel?: string;
  onSelect?: () => void;
  mediaType?: string | null;
}

export function LeaderboardRow({
  rank,
  imageUrl,
  title,
  subtitle,
  tag,
  badge,
  metrics,
  actionUrl,
  actionLabel = "View",
  onSelect,
  mediaType,
}: LeaderboardRowProps) {
  const rankColors: Record<number, string> = {
    1: "bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30",
    2: "bg-slate-300/30 text-slate-700 dark:text-slate-300 border-slate-400/30",
    3: "bg-amber-700/20 text-amber-800 dark:text-amber-500 border-amber-700/30",
  };

  const rankBadgeClass =
    rankColors[rank] ||
    "bg-slate-100 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800";

  const badgeColorClass =
    badge?.variant === "emerald"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/20"
      : badge?.variant === "amber"
      ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/20"
      : badge?.variant === "rose"
      ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/20"
      : badge?.variant === "purple"
      ? "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/20"
      : "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/20";

  return (
    <div
      onClick={onSelect}
      className={`p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white/60 dark:bg-slate-900/40 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-all duration-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
        onSelect ? "cursor-pointer" : ""
      }`}
    >
      {/* Left: Rank + Thumbnail + Info */}
      <div className="flex items-center space-x-3 min-w-0 flex-1">
        {/* Rank indicator */}
        <div
          className={`w-7 h-7 rounded-xl border flex items-center justify-center font-bold text-xs shrink-0 ${rankBadgeClass}`}
        >
          {rank <= 3 ? (
            <span className="flex items-center">
              {rank === 1 && <Trophy className="w-3.5 h-3.5 mr-0.5" />}
              {rank}
            </span>
          ) : (
            rank
          )}
        </div>

        {/* Thumbnail Preview */}
        <div className="relative w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden shrink-0">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={title}
              className="w-full h-full object-cover"
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={(e) => {
                (e.target as HTMLElement).style.display = "none";
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400">
              {mediaType === "video" ? (
                <Video className="w-4 h-4" />
              ) : mediaType === "image" ? (
                <ImageIcon className="w-4 h-4" />
              ) : (
                <Layers className="w-4 h-4" />
              )}
            </div>
          )}
          {mediaType && (
            <span className="absolute bottom-0.5 right-0.5 bg-black/70 text-white rounded p-0.5 text-[8px]">
              {mediaType === "video" ? <Video className="w-2.5 h-2.5" /> : <ImageIcon className="w-2.5 h-2.5" />}
            </span>
          )}
        </div>

        {/* Title & metadata */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate max-w-[280px]">
              {title}
            </h4>
            {badge && (
              <span
                className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${badgeColorClass}`}
              >
                {badge.text}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
            {subtitle && <span className="font-medium truncate">{subtitle}</span>}
            {tag && (
              <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-1.5 py-0.2 rounded text-[9px] font-semibold truncate">
                {tag}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Right: Metrics + Action */}
      <div className="flex items-center justify-between sm:justify-end space-x-4 shrink-0 pl-10 sm:pl-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100 dark:border-slate-800/60">
        <div className="flex items-center space-x-3 sm:space-x-4">
          {metrics.map((m, idx) => (
            <div key={idx} className="text-right">
              <span className="text-[10px] text-slate-600 dark:text-slate-400 block uppercase tracking-wider font-semibold">
                {m.label}
              </span>
              <span
                className={`text-xs font-mono font-bold ${
                  m.highlight
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-slate-800 dark:text-slate-200"
                }`}
              >
                {m.value}
              </span>
            </div>
          ))}
        </div>

        {actionUrl && (
          <Link
            href={actionUrl}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center space-x-1 px-2.5 py-1 text-[11px] font-bold rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800/60 transition-all cursor-pointer"
          >
            <span>{actionLabel}</span>
            <ExternalLink className="w-3 h-3" />
          </Link>
        )}
      </div>
    </div>
  );
}
