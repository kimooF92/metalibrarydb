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
    <>
      {/* Title */}
      {title && (
        <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 mb-1 line-clamp-1">
          {title}
        </h4>
      )}

      {/* Copy / Caption */}
      {caption && (
        <div className="mb-3">
          <p
            className={`text-[11px] text-slate-600 dark:text-slate-400 whitespace-pre-line leading-relaxed ${
              isExpanded ? "" : "line-clamp-3"
            }`}
          >
            {caption}
          </p>
          {caption.length > 120 && (
            <button
              type="button"
              onClick={onToggleExpand}
              className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline mt-1 cursor-pointer"
            >
              {isExpanded ? "Show less" : "Read full copy..."}
            </button>
          )}
        </div>
      )}
    </>
  );
}

