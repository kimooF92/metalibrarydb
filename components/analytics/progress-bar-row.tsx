import { ReactNode } from "react";

interface ProgressBarRowProps {
  label: string;
  count: number;
  total: number;
  percentage?: number;
  colorClass?: string;
  textColor?: string;
  subtext?: string;
  valueLabel?: ReactNode;
  icon?: ReactNode;
  onClick?: () => void;
}

export function ProgressBarRow({
  label,
  count,
  total,
  percentage,
  colorClass = "bg-indigo-500",
  textColor = "text-slate-800 dark:text-slate-200",
  subtext,
  valueLabel,
  icon,
  onClick,
}: ProgressBarRowProps) {
  const computedPct =
    percentage !== undefined
      ? percentage
      : total > 0
      ? Math.min(100, Math.round((count / total) * 100))
      : 0;

  return (
    <div
      onClick={onClick}
      className={`group ${
        onClick ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/50 p-1.5 -mx-1.5 rounded-xl transition-all" : ""
      }`}
    >
      <div className="flex items-center justify-between mb-1 text-xs">
        <div className="flex items-center gap-1.5 truncate max-w-[65%]">
          {icon}
          <span className={`font-semibold ${textColor} truncate`}>{label}</span>
          {subtext && (
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal hidden sm:inline truncate">
              • {subtext}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0 font-mono">
          {valueLabel ? (
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{valueLabel}</span>
          ) : (
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
              {count.toLocaleString()}
            </span>
          )}
          <span className="text-[10px] text-slate-500 dark:text-slate-400 w-9 text-right">
            ({computedPct}%)
          </span>
        </div>
      </div>

      <div className="w-full h-2 bg-slate-100 dark:bg-slate-800/80 rounded-full overflow-hidden">
        <div
          className={`h-full ${colorClass} rounded-full transition-all duration-700 ease-out`}
          style={{ width: `${computedPct}%` }}
        />
      </div>
    </div>
  );
}
