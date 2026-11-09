import { cn } from "@/lib/utils";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Gradient fade direction:
   * - "bottom" / true: fades vertically top-to-bottom into transparent (default)
   * - "right": fades horizontally to transparent
   * - "none": uniform subtle muted background without gradient fade
   */
  fade?: boolean | "bottom" | "right" | "none";
}

function Skeleton({
  className,
  fade = "bottom",
  ...props
}: SkeletonProps) {
  const fadeClass =
    fade === "bottom" || fade === true
      ? "bg-gradient-to-b from-slate-200/90 via-slate-200/40 to-transparent dark:from-slate-800/90 dark:via-slate-800/40 dark:to-transparent"
      : fade === "right"
      ? "bg-gradient-to-r from-slate-200/90 via-slate-200/40 to-transparent dark:from-slate-800/90 dark:via-slate-800/40 dark:to-transparent"
      : "bg-slate-200/70 dark:bg-slate-800/70";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md animate-pulse",
        fadeClass,
        "before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_2s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/20 dark:before:via-white/5 before:to-transparent",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
