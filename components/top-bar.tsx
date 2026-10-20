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
  Plus,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { SmallPagesScanBadge } from "./small-pages-scan-banner";
import { NotificationCenter } from "./notification-center";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { useAddUrlModal } from "./add-url-modal";
import { useAuth } from "./auth-context";
import { useLogout } from "@/hooks/use-logout";

const ROUTE_INFO: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  "/": { label: "Dashboard", icon: LayoutDashboard },
  "/discovery": { label: "Discover Pages", icon: Globe },
  "/spy": { label: "Ad Spy Feed", icon: Eye },
  "/products": { label: "Tracked Products", icon: ShoppingBag },
  "/analytics": { label: "Analytics", icon: BarChart3 },
  "/settings": { label: "Settings", icon: Settings },
  "/import": { label: "Import Pages", icon: UploadCloud },
};

export function TopBar() {
  const pathname = usePathname();
  const { openAddUrlModal } = useAddUrlModal();
  const { isStaff } = useAuth();
  const { logout, isLoggingOut } = useLogout();

  const currentRoute = ROUTE_INFO[pathname] || {
    label: "Meta Ad Tracker",
    icon: LayoutDashboard,
  };
  const Icon = currentRoute.icon;

  return (
    <header className="hidden md:flex items-center justify-between h-12 px-6 border-b border-slate-200 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-900/30 backdrop-blur-md shrink-0 sticky top-0 z-30 transition-all select-none">
      {/* Left: Logo/Breadcrumb & Workspace Switcher */}
      <div className="flex items-center space-x-3 text-xs">
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

      {/* Right: Actions (Add Page CTA, Notification Center, Theme Toggle & Logout) */}
      <div className="flex items-center space-x-2">
        <button
          onClick={openAddUrlModal}
          className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs transition-all cursor-pointer"
          title="Add new tracked page"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Page</span>
        </button>
        {!isStaff && <SmallPagesScanBadge />}
        <NotificationCenter layout="navbar" />
        <ThemeToggle size="sm" />

        {isStaff && (
          <>
            <div className="h-4 w-px bg-slate-200 dark:border-slate-800 mx-1" />
            <button
              onClick={logout}
              disabled={isLoggingOut}
              className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-slate-200 dark:border-slate-800 hover:border-rose-200 dark:hover:border-rose-900/50 transition-all cursor-pointer disabled:opacity-50"
              title="Sign out of Staff session"
            >
              <LogOut className={`w-3.5 h-3.5 ${isLoggingOut ? "animate-spin" : ""}`} />
              <span>{isLoggingOut ? "Exiting..." : "Log Out"}</span>
            </button>
          </>
        )}
      </div>
    </header>
  );
}

