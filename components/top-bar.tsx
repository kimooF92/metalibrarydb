"use client";

import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Globe,
  Eye,
  ShoppingBag,
  BarChart3,
  UploadCloud,
} from "lucide-react";
import { NotificationCenter } from "./notification-center";
import { ThemeToggle } from "./theme-toggle";

const ROUTE_INFO: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  "/": { label: "Dashboard", icon: LayoutDashboard },
  "/discovery": { label: "Discover Pages", icon: Globe },
  "/spy": { label: "Ad Spy Feed", icon: Eye },
  "/products": { label: "Product Intelligence", icon: ShoppingBag },
  "/analytics": { label: "Analytics", icon: BarChart3 },
  "/import": { label: "Import Pages", icon: UploadCloud },
};

export function TopBar() {
  const pathname = usePathname();
  const currentRoute = ROUTE_INFO[pathname] || {
    label: "Meta Ad Tracker",
    icon: LayoutDashboard,
  };
  const Icon = currentRoute.icon;

  return (
    <header className="hidden md:flex items-center justify-between h-12 px-6 border-b border-slate-200 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-900/30 backdrop-blur-md shrink-0 sticky top-0 z-30 transition-all select-none">
      {/* Left: Breadcrumb / Active Page */}
      <div className="flex items-center space-x-2 text-xs">
        <div className="flex items-center space-x-1.5 text-slate-400 dark:text-slate-500 font-medium">
          <span>Tracker</span>
          <span className="text-slate-300 dark:text-slate-700">/</span>
        </div>
        <div className="flex items-center space-x-1.5 font-bold text-slate-800 dark:text-slate-200">
          <Icon className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
          <span>{currentRoute.label}</span>
        </div>
      </div>

      {/* Right: Actions (Notification Center & Theme Button Only) */}
      <div className="flex items-center space-x-2">
        <NotificationCenter layout="navbar" />
        <ThemeToggle size="sm" />
      </div>
    </header>
  );
}
