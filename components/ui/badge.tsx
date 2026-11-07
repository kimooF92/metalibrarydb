import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md text-[11px] font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/40 select-none",
  {
    variants: {
      variant: {
        default:
          "border border-transparent bg-indigo-600 text-white shadow-xs hover:bg-indigo-700",
        secondary:
          "border border-transparent bg-slate-100 text-slate-800 dark:bg-slate-800/80 dark:text-slate-200",
        destructive:
          "border border-transparent bg-rose-500 text-white shadow-xs hover:bg-rose-600",
        outline:
          "border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300",
        // Specialized SaaS & Archetype variants
        scaling:
          "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/25",
        burst:
          "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/25",
        breakout:
          "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/25",
        stable:
          "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border border-emerald-500/20",
        tester:
          "bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 border border-cyan-500/20",
        descaling:
          "bg-rose-500/10 text-rose-600 dark:text-rose-300 border border-rose-500/20",
        inactive:
          "bg-slate-500/10 text-slate-500 dark:text-slate-400 border border-slate-500/20",
        alert:
          "bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20",
      },
      size: {
        default: "h-[22px] px-2 py-0.5",
        sm: "h-[19px] px-1.5 text-[10px]",
        lg: "h-[26px] px-2.5 text-xs",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant, size }), className)} {...props} />
  );
}

export { badgeVariants };

