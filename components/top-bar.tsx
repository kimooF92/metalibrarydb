"use client";

import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Globe,
  Eye,
  ShoppingBag,
  BarChart3,
  UploadCloud,
  Settings,
  LogOut,
  ShieldCheck,
  Flame,
  Sparkles,
  Building2,
  Search,
  Command as CommandIcon,
} from "lucide-react";
import { SmallPagesScanBadge } from "./small-pages-scan-banner";
import { DispatchWorkerBtn } from "./dispatch-worker-btn";
import { NotificationCenter } from "./notification-center";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { ProfileMenu } from "./profile-menu";
import { useAuth } from "./auth-context";
import { useGlobalSearch } from "./global-search-dialog";

const ROUTE_INFO: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  "/": { label: "Dashboard", icon: LayoutDashboard },
  "/products": { label: "Products", icon: ShoppingBag },
  "/brands": { label: "Tracked Brands", icon: Building2 },
  "/analytics": { label: "Analytics", icon: BarChart3 },
  "/fresh-winners": { label: "Fresh Winners", icon: Flame },
  "/opportunities": { label: "Opportunities", icon: Sparkles },
  "/spy": { label: "Ad Feed", icon: Eye },
  "/discovery": { label: "Discover Brands", icon: Globe },
  "/settings": { label: "Settings", icon: Settings },
  "/import": { label: "Import Brands", icon: UploadCloud },
};

export function TopBar() {
  const pathname = usePathname();
  const { isStaff } = useAuth();
  const { openSearch } = useGlobalSearch();

  const currentRoute =
    ROUTE_INFO[pathname] ||
    (pathname.startsWith("/spy/brand/")
      ? { label: "Brand Overview", icon: Eye }
      : { label: "Meta Ad Tracker", icon: LayoutDashboard });
  const Icon = currentRoute.icon;

  return (
    <header className="hidden md:flex items-center justify-between h-12 px-6 border-b border-slate-200 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-900/30 backdrop-blur-md shrink-0 sticky top-0 z-30 transition-colors select-none">
      {/* Left: Logo/Breadcrumb & Workspace Switcher */}
      <div className="flex items-center space-x-3 text-xs shrink-0">
        {isStaff ? (
          <div className="flex items-center space-x-2.5 mr-1">
            <img
              src="/icon.png"
              alt="Meta Ad Tracker Logo"
              className="w-6 h-6 object-contain shrink-0"
            />
            <span className="font-extrabold text-sm text-slate-900 dark:text-white tracking-tight">
              Meta Ad Tracker
            </span>
            <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
              <ShieldCheck className="w-2.5 h-2.5" />
              <span>Staff</span>
            </span>
          </div>
        ) : (
          <>
            <div className="flex items-center space-x-1.5 text-slate-400 dark:text-slate-500 font-medium">
              <span>Tracker</span>
              <span className="text-slate-300 dark:text-slate-700">/</span>
            </div>
            <div className="flex items-center space-x-1.5 font-bold text-slate-800 dark:text-slate-200">
              <Icon className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
              <span>{currentRoute.label}</span>
            </div>
          </>
        )}

        <div className="h-4 w-px bg-slate-200 dark:bg-slate-800" />
        <WorkspaceSwitcher />
      </div>

      {/* Center: Global Search Bar Trigger */}
      <div className="flex-1 max-w-sm mx-4">
        <button
          type="button"
          onClick={openSearch}
          className="w-full flex items-center justify-between gap-2 px-3 py-1.5 h-8 text-xs rounded-lg bg-slate-200/50 dark:bg-white/[0.05] hover:bg-slate-200/80 dark:hover:bg-white/[0.08] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 border border-slate-300/50 dark:border-white/[0.08] transition-all cursor-pointer group shadow-2xs"
          title="Search anything (⌘K or Ctrl+K)"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Search className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors shrink-0" />
            <span className="truncate text-slate-400 dark:text-slate-500 font-normal">
              Search brands, products, ads...
            </span>
          </div>
          <kbd className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono font-medium rounded bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700/60 shrink-0">
            <CommandIcon className="w-2.5 h-2.5 inline" />
            <span>K</span>
          </kbd>
        </button>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center space-x-2 shrink-0">
        {!isStaff && <DispatchWorkerBtn variant="navbar" />}
        {!isStaff && <SmallPagesScanBadge />}
        {!isStaff && <NotificationCenter layout="navbar" />}
        {isStaff && <ProfileMenu layout="topbar" />}
      </div>
    </header>
  );
}
