"use client";

export interface ProductsGridSkeletonProps {
  viewMode: "grid" | "list";
  count?: number;
  className?: string;
}

export function ProductsGridSkeleton({
  viewMode,
  count,
  className = "",
}: ProductsGridSkeletonProps) {
  const defaultCount = viewMode === "grid" ? (count ?? 8) : (count ?? 6);

  if (viewMode === "grid") {
    return (
      <div className={`products-cards-grid ${className}`}>
        {[...Array(defaultCount)].map((_, i) => (
          <div
            key={i}
            className="aspect-[3/4] bg-card rounded-xl border border-border animate-pulse p-4 flex flex-col justify-between"
          >
            <div className="aspect-square bg-muted rounded-lg" />
            <div className="space-y-2 mt-4">
              <div className="h-4 bg-muted rounded w-3/4" />
              <div className="h-3 bg-muted rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-2.5 ${className}`}>
      {[...Array(defaultCount)].map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 p-3.5 bg-card rounded-xl border border-border animate-pulse"
        >
          <div className="w-16 h-16 bg-muted rounded-lg shrink-0" />
          <div className="flex-1 space-y-2 min-w-0">
            <div className="h-4 bg-muted rounded w-2/3" />
            <div className="h-3 bg-muted rounded w-1/3" />
          </div>
          <div className="hidden sm:flex items-center gap-3 shrink-0">
            <div className="h-5 w-16 bg-muted rounded" />
            <div className="h-8 w-24 bg-muted rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

