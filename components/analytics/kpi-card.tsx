import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";

interface KPICardProps {
  title: string;
  value: string | number;
  subtext?: ReactNode;
  icon: LucideIcon;
  badge?: {
    text: string;
    variant?: "emerald" | "rose" | "indigo" | "amber" | "purple" | "cyan" | "slate";
  };
  colorTheme?: "emerald" | "rose" | "indigo" | "amber" | "purple" | "cyan" | "slate";
  isLoading?: boolean;
}

const themeStyles: Record<
  string,
  {
    border: string;
    bg: string;
    iconBg: string;
    iconColor: string;
    valColor: string;
    badgeBg: string;
    badgeText: string;
  }
> = {
  emerald: {
    border: "border-emerald-500/20",
    bg: "bg-emerald-500/5",
    iconBg: "bg-emerald-500/10",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    valColor: "text-emerald-700 dark:text-emerald-300",
    badgeBg: "bg-emerald-500/20",
    badgeText: "text-emerald-700 dark:text-emerald-300",
  },
  rose: {
    border: "border-rose-500/20",
    bg: "bg-rose-500/5",
    iconBg: "bg-rose-500/10",
    iconColor: "text-rose-600 dark:text-rose-400",
    valColor: "text-rose-700 dark:text-rose-300",
    badgeBg: "bg-rose-500/20",
    badgeText: "text-rose-700 dark:text-rose-300",
  },
  indigo: {
    border: "border-indigo-500/20",
    bg: "bg-indigo-500/5",
    iconBg: "bg-indigo-500/10",
    iconColor: "text-indigo-600 dark:text-indigo-400",
    valColor: "text-indigo-700 dark:text-indigo-300",
    badgeBg: "bg-indigo-500/20",
    badgeText: "text-indigo-700 dark:text-indigo-300",
  },
  amber: {
    border: "border-amber-500/20",
    bg: "bg-amber-500/5",
    iconBg: "bg-amber-500/10",
    iconColor: "text-amber-600 dark:text-amber-400",
    valColor: "text-amber-700 dark:text-amber-300",
    badgeBg: "bg-amber-500/20",
    badgeText: "text-amber-700 dark:text-amber-300",
  },
  purple: {
    border: "border-purple-500/20",
    bg: "bg-purple-500/5",
    iconBg: "bg-purple-500/10",
    iconColor: "text-purple-600 dark:text-purple-400",
    valColor: "text-purple-700 dark:text-purple-300",
    badgeBg: "bg-purple-500/20",
    badgeText: "text-purple-700 dark:text-purple-300",
  },
  cyan: {
    border: "border-cyan-500/20",
    bg: "bg-cyan-500/5",
    iconBg: "bg-cyan-500/10",
    iconColor: "text-cyan-600 dark:text-cyan-400",
    valColor: "text-cyan-700 dark:text-cyan-300",
    badgeBg: "bg-cyan-500/20",
    badgeText: "text-cyan-700 dark:text-cyan-300",
  },
  slate: {
    border: "border-slate-200 dark:border-slate-800",
    bg: "bg-white/60 dark:bg-slate-900/60",
    iconBg: "bg-slate-100 dark:bg-slate-800",
    iconColor: "text-slate-600 dark:text-slate-400",
    valColor: "text-slate-900 dark:text-slate-100",
    badgeBg: "bg-slate-100 dark:bg-slate-800",
    badgeText: "text-slate-700 dark:text-slate-300",
  },
};

export function KPICard({
  title,
  value,
  subtext,
  icon: Icon,
  badge,
  colorTheme = "indigo",
  isLoading = false,
}: KPICardProps) {
  const theme = themeStyles[colorTheme] || themeStyles.indigo;
  const badgeTheme = badge?.variant ? themeStyles[badge.variant] : theme;

  return (
    <div
      className={`glass-card rounded-2xl p-4 flex flex-col justify-between border ${theme.border} ${theme.bg} transition-all duration-300 hover:-translate-y-0.5 shadow-sm min-h-[112px] relative overflow-hidden`}
    >
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className={`text-[11px] font-bold uppercase tracking-wider ${theme.iconColor} flex items-center gap-1.5`}>
            <span className={`p-1 rounded-lg ${theme.iconBg}`}>
              <Icon className="w-3.5 h-3.5" />
            </span>
            {title}
          </span>
          {badge && (
            <span
              className={`text-[10px] ${badgeTheme.badgeBg} ${badgeTheme.badgeText} font-bold px-2 py-0.5 rounded-full`}
            >
              {badge.text}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="h-7 w-24 bg-slate-200 dark:bg-slate-800 animate-pulse rounded my-1" />
        ) : (
          <div className={`text-2xl font-black tracking-tight ${theme.valColor}`}>
            {value}
          </div>
        )}
      </div>

      {subtext && (
        <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-2 truncate">
          {subtext}
        </div>
      )}
    </div>
  );
}
