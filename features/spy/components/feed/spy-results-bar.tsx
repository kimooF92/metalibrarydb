"use client";

const SPY_SORT_LABEL_MAP: Record<string, string> = {
  started_running_on: "Newest First",
  duplication_count: "Most Scaled Copies",
  winner_score: "Highest Winner Score",
  first_seen_at: "Recently Discovered",
  product_creatives: "Most Creative Angles",
  newest: "Newest First",
  oldest: "Oldest First",
  scale: "Most Scaled Copies",
  most_scaled: "Most Scaled Copies",
  days_running: "Longest Running",
  score: "Highest Winner Score",
  latest: "Newest First",
};

function formatSortLabel(sortBy?: string): string {
  if (!sortBy) return "Newest First";
  if (SPY_SORT_LABEL_MAP[sortBy]) return SPY_SORT_LABEL_MAP[sortBy];
  return sortBy
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export interface SpyResultsBarProps {
  loading: boolean;
  adsCount: number;
  totalCount: number;
  isFetchingMore: boolean;
  sortBy?: string;
}

export function SpyResultsBar({
  loading,
  adsCount,
  totalCount,
  isFetchingMore,
  sortBy = "started_running_on",
}: SpyResultsBarProps) {
  return (
    <div className="flex items-center justify-between text-xs text-muted-foreground px-1 py-0.5">
      <div className="flex items-center gap-2">
        <span>
          {loading && adsCount === 0 ? (
            "Loading ad creatives..."
          ) : (
            <>
              Showing <span className="font-semibold text-foreground">{adsCount}</span> of{" "}
              <span className="font-semibold text-foreground">{totalCount.toLocaleString()}</span> ads
            </>
          )}
        </span>
        {isFetchingMore && (
          <span className="inline-flex items-center gap-1 text-[11px] text-indigo-500 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping" />
            Loading more...
          </span>
        )}
      </div>

      <div className="hidden sm:flex items-center gap-1.5 text-[11px]">
        <span>Sorted by:</span>
        <span className="font-medium text-foreground bg-muted px-2 py-0.5 rounded-md border border-border/70">
          {formatSortLabel(sortBy)}
        </span>
      </div>
    </div>
  );
}
