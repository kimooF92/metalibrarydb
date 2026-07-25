"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, LayoutDashboard, UploadCloud, BarChart3 } from "lucide-react";
import { WorkerStatus } from "./worker-status";

export function Navigation() {
  const pathname = usePathname();
  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY > lastScrollY && currentScrollY > 64) {
        setIsVisible(false);
      } else {
        setIsVisible(true);
      }
      setLastScrollY(currentScrollY);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [lastScrollY]);

  return (
    <header
      className={`sticky top-0 z-40 w-full glass-panel border-b border-slate-800/80 transition-transform duration-300 ${
        isVisible ? "translate-y-0" : "-translate-y-full"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Logo */}
        <div className="flex items-center space-x-3">
          <img
            src="/icon.png"
            alt="Meta Ad Tracker Logo"
            className="w-9 h-9 rounded-full border border-cyan-400/30 shadow-md shadow-cyan-500/20 object-cover"
          />
          <div>
            <span className="font-bold text-lg text-white tracking-tight">
              Meta Ad Tracker
            </span>
          </div>
        </div>

        {/* Nav Links */}
        <nav className="flex items-center space-x-1 sm:space-x-2">
          <Link
            href="/"
            className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              pathname === "/"
                ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Dashboard</span>
          </Link>

          <Link
            href="/import"
            className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              pathname === "/import"
                ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <UploadCloud className="w-4 h-4" />
            <span>Import</span>
          </Link>

          <Link
            href="/analytics"
            className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              pathname === "/analytics"
                ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Analytics</span>
          </Link>
        </nav>

        {/* Worker Status Widget */}
        <div className="flex items-center">
          <WorkerStatus />
        </div>
      </div>
    </header>
  );
}

