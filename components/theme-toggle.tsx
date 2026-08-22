"use client";

import { useState, useEffect } from "react";
import { Sun, Moon } from "lucide-react";

interface ThemeToggleProps {
  className?: string;
  size?: "sm" | "md";
}

export function ThemeToggle({ className = "", size = "md" }: ThemeToggleProps) {
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    setMounted(true);
    const savedTheme = (localStorage.getItem("theme") as "light" | "dark") || "dark";
    setTheme(savedTheme);
    if (savedTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    const applyTheme = () => {
      setTheme(nextTheme);
      document.documentElement.classList.toggle("dark", nextTheme === "dark");
      localStorage.setItem("theme", nextTheme);
    };

    if (
      "startViewTransition" in document &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      (document as any).startViewTransition(applyTheme);
      return;
    }

    applyTheme();
  };

  const buttonSizeClass = size === "sm" ? "w-8 h-8" : "w-8.5 h-8.5";

  if (!mounted) {
    return (
      <div
        className={`${buttonSizeClass} rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 ${className}`}
      />
    );
  }

  return (
    <button
      onClick={toggleTheme}
      title={`Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`}
      aria-label={`Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`}
      className={`flex items-center justify-center ${buttonSizeClass} rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm transition-all cursor-pointer ${className}`}
    >
      {theme === "dark" ? (
        <Sun className="w-4 h-4 text-amber-400 hover:text-amber-300 transition-colors" />
      ) : (
        <Moon className="w-4 h-4 text-indigo-600 hover:text-indigo-700 transition-colors" />
      )}
    </button>
  );
}
