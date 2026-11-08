"use client";

interface BrandMiniBarProps {
  value: number;
  max: number;
  colorClass?: string;
}

export function BrandMiniBar({
  value,
  max,
  colorClass = "bg-indigo-500",
}: BrandMiniBarProps) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;

  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full ${colorClass} rounded-full transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-mono text-slate-600 dark:text-slate-300 w-12 text-right shrink-0">
        {value.toLocaleString()}
      </span>
    </div>
  );
}

