"use client";

import * as React from "react";
import { Menu as BaseMenu } from "@base-ui/react";
import { cn } from "@/lib/utils";

export const DropdownMenu = BaseMenu.Root;
export const DropdownMenuTrigger = BaseMenu.Trigger;
export const DropdownMenuGroup = BaseMenu.Group;
export const DropdownMenuLabel = BaseMenu.GroupLabel;

export interface DropdownMenuContentProps
  extends React.ComponentPropsWithoutRef<typeof BaseMenu.Popup> {
  side?: "top" | "bottom" | "left" | "right";
  sideOffset?: number;
  align?: "start" | "center" | "end";
  alignOffset?: number;
}

export const DropdownMenuContent = React.forwardRef<HTMLDivElement, DropdownMenuContentProps>(
  (
    {
      className,
      side = "bottom",
      sideOffset = 4,
      align = "end",
      alignOffset = 0,
      children,
      ...props
    },
    ref
  ) => (
    <BaseMenu.Portal>
      <BaseMenu.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        className="z-50"
      >
        <BaseMenu.Popup
          ref={ref}
          className={cn(
            "min-w-[130px] overflow-hidden rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1 text-slate-800 dark:text-slate-200 shadow-2xl focus:outline-none select-none",
            className
          )}
          {...props}
        >
          {children}
        </BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  )
);
DropdownMenuContent.displayName = "DropdownMenuContent";

export interface DropdownMenuItemProps
  extends React.ComponentPropsWithoutRef<typeof BaseMenu.Item> {
  inset?: boolean;
}

export const DropdownMenuItem = React.forwardRef<HTMLDivElement, DropdownMenuItemProps>(
  ({ className, inset, children, ...props }, ref) => (
    <BaseMenu.Item
      ref={ref}
      className={cn(
        "relative flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-xs outline-none transition-colors hover:bg-slate-100 dark:hover:bg-slate-800/80 focus:bg-slate-100 dark:focus:bg-slate-800/80 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100",
        inset && "pl-8",
        className
      )}
      {...props}
    >
      {children}
    </BaseMenu.Item>
  )
);
DropdownMenuItem.displayName = "DropdownMenuItem";

export const DropdownMenuSeparator = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseMenu.Separator>
>(({ className, ...props }, ref) => (
  <BaseMenu.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-slate-100 dark:bg-slate-800", className)}
    {...props}
  />
));
DropdownMenuSeparator.displayName = "DropdownMenuSeparator";

