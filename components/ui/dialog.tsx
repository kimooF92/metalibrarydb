"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;

export interface DialogContentProps extends DialogPrimitive.Popup.Props {
  showClose?: boolean;
  containerClassName?: string;
}

export function DialogContent({
  className,
  children,
  showClose = true,
  containerClassName,
  ...props
}: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      {/* Accessible Backdrop with Built-in Body Scroll Locking */}
      <DialogPrimitive.Backdrop
        className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
      />
      {/* Scrollable Viewport Wrapper (prevents top-clipping on short screens) */}
      <div
        className={cn(
          "fixed inset-0 z-50 overflow-y-auto p-4 sm:p-6 md:p-10 flex items-center justify-center",
          containerClassName
        )}
      >
        <DialogPrimitive.Popup
          className={cn(
            "relative w-full max-w-md rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-2xl p-6 outline-none duration-150",
            "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...props}
        >
          {children}
          {showClose && (
            <DialogPrimitive.Close
              aria-label="Close"
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Popup>
      </div>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col space-y-1.5 text-left mb-4", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("mt-6 flex items-center justify-end space-x-3 pt-4 border-t border-slate-200 dark:border-slate-800/80", className)}
      {...props}
    />
  );
}

