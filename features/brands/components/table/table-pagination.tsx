"use client";

interface TablePaginationProps {
  page: number;
  pageSize: number;
  totalPages: number;
  totalCount?: number;
  onPageChange: (newPage: number) => void;
  onPageSizeChange: (newPageSize: number) => void;
}

export function TablePagination({
  page,
  pageSize,
  totalPages,
  totalCount,
  onPageChange,
  onPageSizeChange,
}: TablePaginationProps) {
  const getPageNumbers = () => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (page <= 4) {
      return [1, 2, 3, 4, 5, "...", totalPages];
    }
    if (page >= totalPages - 3) {
      return [1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }
    return [1, "...", page - 1, page, page + 1, "...", totalPages];
  };

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
      <div className="flex items-center space-x-4">
        <span>
          Page <strong className="text-slate-800 dark:text-slate-200">{page}</strong> of{" "}
          <strong className="text-slate-800 dark:text-slate-200">{totalPages}</strong>
          {totalCount !== undefined && totalCount > 0 && (
            <span className="ml-1 text-slate-400 dark:text-slate-500">({totalCount} total)</span>
          )}
        </span>

        {/* Rows Per Page Select */}
        <div className="flex items-center space-x-1.5">
          <label htmlFor="rows-per-page-select" className="text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">
            Show:
          </label>
          <select
            id="rows-per-page-select"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 font-semibold px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-indigo-500 cursor-pointer text-xs transition-colors hover:border-slate-300 dark:hover:border-slate-700"
            aria-label="Select number of rows per page"
          >
            <option value={25} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">25 rows</option>
            <option value={50} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">50 rows</option>
            <option value={100} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">100 rows</option>
          </select>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 disabled:opacity-40 text-slate-600 dark:text-slate-300 transition-all cursor-pointer disabled:cursor-not-allowed text-xs font-medium"
            aria-label="Previous page"
          >
            Previous
          </button>

          {getPageNumbers().map((p, idx) => {
            if (p === "...") {
              return (
                <span key={`ellipsis-${idx}`} className="px-1.5 py-1 text-slate-500 text-xs select-none">
                  ...
                </span>
              );
            }
            const pageNum = p as number;
            const isActive = pageNum === page;
            return (
              <button
                key={`page-${pageNum}`}
                onClick={() => onPageChange(pageNum)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30 border border-indigo-500"
                    : "bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800"
                }`}
              >
                {pageNum}
              </button>
            );
          })}

          <button
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 disabled:opacity-40 text-slate-600 dark:text-slate-300 transition-all cursor-pointer disabled:cursor-not-allowed text-xs font-medium"
            aria-label="Next page"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
