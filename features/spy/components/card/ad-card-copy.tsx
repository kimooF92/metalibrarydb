"use client";

export interface AdCardCopyProps {
  title?: string | null;
  caption?: string | null;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export function AdCardCopy({
  title,
  caption,
  isExpanded,
  onToggleExpand,
}: AdCardCopyProps) {
  if (!title && !caption) return null;

  return (
    <div className="mb-2">
      {/* Title */}
      {title && (
        <h4
          className="text-[13px] sm:text-sm font-bold text-slate-900 dark:text-slate-100 line-clamp-1 mb-1 leading-snug"
          title={title}
        >
          {title}
        </h4>
      )}

      {/* Copy / Caption */}
      {caption && (
        <div>
          <p
            className={`text-xs text-slate-600 dark:text-slate-400 whitespace-pre-line leading-relaxed ${
              isExpanded ? "" : "line-clamp-2"
            }`}
          >
            {caption}
          </p>
          {caption.length > 100 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand();
              }}
              className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline mt-0.5 cursor-pointer"
            >
              {isExpanded ? "Show less" : "Read full copy..."}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
