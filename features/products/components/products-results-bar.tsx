"use client";

const SORT_LABEL_MAP: Record<string, string> = {
  latest: "Newest Discovered",
  oldest: "Oldest Discovered",
  launched_desc: "Newest Launched",
  launched_asc: "Oldest Launched",
  price_desc: "Price: High to Low",
  price_asc: "Price: Low to High",
  title: "Title: A to Z",
  title_desc: "Title: Z to A",
  top_lasting: "Oldest Launched",
  most_scaled: "Newest Discovered",
};

export interface ProductsResultsBarProps {
  loading: boolean;
  productsCount: number;
  totalCount: number;
  isFetchingMore: boolean;
  sortBy: string;
}

export function ProductsResultsBar({
  loading,
  productsCount,
  totalCount,
  isFetchingMore,
  sortBy,
}: ProductsResultsBarProps) {
  return (
    <div className="flex items-center justify-between text-xs text-muted-foreground px-1 py-1">
      <div className="flex items-center gap-2">
        <span>
          {loading && productsCount === 0 ? (
            "Loading products catalog..."
          ) : (
            <>
              Showing <span className="font-semibold text-foreground">{productsCount}</span> of{" "}
              <span className="font-semibold text-foreground">{totalCount}</span> products
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
          {SORT_LABEL_MAP[sortBy] || sortBy}
        </span>
      </div>
    </div>
  );
}

