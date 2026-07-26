"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, UploadCloud, BarChart3, Menu, X, ChevronLeft, ChevronRight } from "lucide-react";
import { WorkerStatus } from "./worker-status";
import { useSidebar } from "@/components/sidebar-context";

export function Navigation() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const { isCollapsed, toggleSidebar } = useSidebar();

  return (
    <>
      {/* Desktop Left Sidebar */}
      <header
        className={`hidden md:flex flex-col ${
          isCollapsed ? "w-16 p-3" : "w-64 p-5"
        } h-screen border-r border-slate-800/80 bg-slate-900/20 backdrop-blur-md shrink-0 sticky top-0 left-0 z-40 justify-between transition-all duration-300 relative`}
      >
        {/* Floating Border Toggle Button (Shadcn Style) */}
        <button
          onClick={toggleSidebar}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={isCollapsed ? "Expand Sidebar (Ctrl+B)" : "Collapse Sidebar (Ctrl+B)"}
          className="absolute -right-3 top-6 z-50 w-6 h-6 rounded-full bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-900 shadow-md cursor-pointer transition-all hover:scale-105 active:scale-95"
        >
          {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>

        <div className="flex flex-col flex-1 min-w-0">
          {/* Header Row (Logo & Title) */}
          {isCollapsed ? (
            <div className="flex flex-col items-center mb-8">
              <img
                src="/icon.png"
                alt="Meta Ad Tracker Logo"
                className="w-9 h-9 rounded-lg border border-cyan-400/30 object-cover"
              />
            </div>
          ) : (
            <div className="flex items-center space-x-3 mb-8 px-1 truncate">
              <img
                src="/icon.png"
                alt="Meta Ad Tracker Logo"
                className="w-9 h-9 rounded-lg border border-cyan-400/30 object-cover shrink-0"
              />
              <div className="truncate">
                <span className="font-extrabold text-sm text-white tracking-tight block leading-tight">
                  Meta Ad Tracker
                </span>
                <span className="text-[9px] text-slate-500 font-medium block">
                  Competitor Intelligence
                </span>
              </div>
            </div>
          )}

          {/* Navigation Links */}
          <nav className="flex flex-col space-y-1.5">
            {[
              { href: "/", label: "Dashboard", icon: LayoutDashboard },
              { href: "/import", label: "Bulk Import", icon: UploadCloud },
              { href: "/analytics", label: "Analytics", icon: BarChart3 },
            ].map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              
              if (isCollapsed) {
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.label}
                    className={`flex items-center justify-center w-10 h-10 mx-auto rounded-lg transition-all border ${
                      active
                        ? "bg-indigo-600/10 border-indigo-500/30 text-indigo-300 shadow-md shadow-indigo-600/[0.03]"
                        : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${active ? "text-indigo-400" : "text-slate-400"}`} />
                  </Link>
                );
              }

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all border ${
                    active
                      ? "bg-indigo-600/10 border-indigo-500/30 text-indigo-300 shadow-md shadow-indigo-600/[0.03]"
                      : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${active ? "text-indigo-400" : "text-slate-400"}`} />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Worker Status at Bottom of Sidebar */}
        {isCollapsed ? (
          <div className="pt-4 border-t border-slate-800/80 flex justify-center">
            <WorkerStatus layout="collapsed" />
          </div>
        ) : (
          <div className="pt-4 border-t border-slate-800/80">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-2 px-1">
              System Status
            </span>
            <div className="bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/60 overflow-hidden">
              <WorkerStatus layout="vertical" />
            </div>
          </div>
        )}
      </header>

      {/* Mobile Top Bar */}
      <header className="flex md:hidden items-center justify-between h-16 w-full px-4 border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-40">
        <div className="flex items-center space-x-3">
          <img
            src="/icon.png"
            alt="Meta Ad Tracker Logo"
            className="w-8 h-8 rounded-lg border border-cyan-400/30 object-cover"
          />
          <span className="font-extrabold text-sm text-white tracking-tight">
            Meta Ad Tracker
          </span>
        </div>

        <button
          onClick={() => setIsOpen(!isOpen)}
          aria-label={isOpen ? "Close menu" : "Open menu"}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-850 transition-all cursor-pointer"
        >
          {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {/* Mobile Drawer Menu Overlay */}
      {isOpen && (
        <div className="fixed inset-x-0 bottom-0 top-16 z-40 bg-[#0b0f19]/98 backdrop-blur-md md:hidden flex flex-col p-6 space-y-6 animate-in slide-in-from-top-5 duration-200">
          <nav className="flex flex-col space-y-2">
            {[
              { href: "/", label: "Dashboard", icon: LayoutDashboard },
              { href: "/import", label: "Bulk Import", icon: UploadCloud },
              { href: "/analytics", label: "Analytics", icon: BarChart3 },
            ].map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all border ${
                    active
                      ? "bg-indigo-600/10 border-indigo-500/30 text-indigo-300"
                      : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="pt-6 border-t border-slate-800/80 mt-auto">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-2 px-1">
              System Status
            </span>
            <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/60 overflow-hidden">
              <WorkerStatus layout="vertical" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
