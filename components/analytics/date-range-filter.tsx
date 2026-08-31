"use client";

export type DateRange = "today" | "7d" | "15d" | "30d";

export const DATE_RANGE_OPTIONS: Array<{ value: DateRange; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 Days" },
  { value: "15d", label: "15 Days" },
  { value: "30d", label: "Month" },
];

export function getDateRangeLabel(range: DateRange): string {
  return DATE_RANGE_OPTIONS.find((option) => option.value === range)?.label ?? "7 Days";
}

export function getDateRangeDescription(range: DateRange): string {
  return range === "today" ? "Today" : `Last ${getDateRangeLabel(range).toLowerCase()}`;
}

interface DateRangeFilterProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

export function DateRangeFilter({ value, onChange }: DateRangeFilterProps) {
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-xl border border-slate-200 bg-white/70 p-0.5 dark:border-slate-800 dark:bg-slate-900/60"
      aria-label="Analytics date range"
      role="group"
    >
      {DATE_RANGE_OPTIONS.map((option) => {
        const isActive = value === option.value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={isActive}
            className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition-all cursor-pointer ${
              isActive
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
