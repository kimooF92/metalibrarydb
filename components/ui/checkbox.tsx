"use client";

import * as React from "react";
import { Checkbox as BaseCheckbox } from "@base-ui/react";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CheckboxProps
  extends React.ComponentPropsWithoutRef<typeof BaseCheckbox.Root> {}

export const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(
  ({ className, checked, ...props }, ref) => (
    <BaseCheckbox.Root
      ref={ref}
      checked={checked}
      className={cn(
        "peer h-4 w-4 shrink-0 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 disabled:cursor-not-allowed disabled:opacity-50 data-[checked]:bg-indigo-600 data-[checked]:border-indigo-600 data-[checked]:text-white data-[indeterminate]:bg-indigo-600 data-[indeterminate]:border-indigo-600 data-[indeterminate]:text-white transition-all shadow-2xs cursor-pointer flex items-center justify-center",
        className
      )}
      {...props}
    >
      <BaseCheckbox.Indicator className="flex items-center justify-center text-current">
        {props.indeterminate ? (
          <Minus className="h-3 w-3 stroke-[3]" />
        ) : (
          <Check className="h-3 w-3 stroke-[3]" />
        )}
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  )
);
Checkbox.displayName = "Checkbox";

