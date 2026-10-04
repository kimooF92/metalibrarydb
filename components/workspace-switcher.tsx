"use client";

import React, { useState, useRef, useEffect } from "react";
import { useWorkspace } from "@/components/workspace-context";
import {
  ChevronDown,
  Check,
  Plus,
  Settings2,
  Globe,
  Loader2,
  Store,
} from "lucide-react";

export function WorkspaceSwitcher() {
  const {
    workspaces,
    activeWorkspace,
    isLoading,
    switchWorkspace,
    setIsCreateModalOpen,
    setEditingWorkspace,
  } = useWorkspace();

  const [isOpen, setIsOpen] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleSelect = async (id: string) => {
    if (id === activeWorkspace?.id) {
      setIsOpen(false);
      return;
    }
    setSwitchingId(id);
    try {
      await switchWorkspace(id);
      setIsOpen(false);
    } finally {
      setSwitchingId(null);
    }
  };

  const handleEdit = (e: React.MouseEvent, w: any) => {
    e.stopPropagation();
    setIsOpen(false);
    setEditingWorkspace(w);
  };

  const handleCreate = () => {
    setIsOpen(false);
    setIsCreateModalOpen(true);
  };

  if (isLoading || !activeWorkspace) {
    return (
      <div className="h-8 w-28 rounded-xl bg-slate-200/70 dark:bg-slate-800/60 animate-pulse" />
    );
  }

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      {/* Dropdown Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-3 py-1.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 hover:bg-slate-50 dark:hover:bg-slate-800/90 shadow-xs transition-all text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer select-none group"
      >
        <span className="text-sm leading-none">{activeWorkspace.flag || "🌐"}</span>
        <span className="max-w-[110px] truncate font-bold tracking-tight">
          {activeWorkspace.name}
        </span>
        <span className="px-1 py-0.2 text-[9px] font-mono rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
          {activeWorkspace.countryCode}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Popover Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 md:left-0 md:right-auto mt-2 w-72 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="px-3.5 py-1.5 flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Workspaces & Markets
            </span>
            <span className="text-[10px] font-medium text-slate-400">
              {workspaces.length} active
            </span>
          </div>

          {/* List of Workspaces */}
          <div className="max-h-64 overflow-y-auto px-1.5 py-1 space-y-1">
            {workspaces.map((w) => {
              const isActive = w.id === activeWorkspace.id;
              const isSwitching = switchingId === w.id;

              return (
                <div
                  key={w.id}
                  onClick={() => handleSelect(w.id)}
                  className={`flex items-center justify-between px-2.5 py-2 rounded-xl text-xs cursor-pointer transition group ${
                    isActive
                      ? "bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-200 border border-indigo-200/60 dark:border-indigo-800/60"
                      : "hover:bg-slate-100/70 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300"
                  }`}
                >
                  <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                    <span className="text-base leading-none shrink-0">
                      {w.flag || "🌐"}
                    </span>
                    <div className="truncate flex-1">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-bold truncate text-slate-900 dark:text-slate-100">
                          {w.name}
                        </span>
                        {w.isDefault && (
                          <span className="text-[9px] px-1 py-0.2 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 font-medium">
                            Default
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate flex items-center space-x-1.5 mt-0.5">
                        <span>{w.pageCount ?? 0} pages</span>
                        <span>•</span>
                        <span>{w.productCount ?? 0} prods</span>
                        <span>•</span>
                        <span className="font-mono text-slate-400">
                          {w.currency} ({w.currencySymbol})
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1 ml-2 shrink-0">
                    <button
                      type="button"
                      title="Edit Workspace"
                      onClick={(e) => handleEdit(e, w)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition"
                    >
                      <Settings2 className="w-3.5 h-3.5" />
                    </button>

                    {isSwitching ? (
                      <Loader2 className="w-3.5 h-3.5 text-indigo-500 animate-spin" />
                    ) : isActive ? (
                      <Check className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Divider */}
          <div className="my-1.5 border-t border-slate-100 dark:border-slate-800" />

          {/* Create New Workspace Action */}
          <div className="px-1.5">
            <button
              type="button"
              onClick={handleCreate}
              className="w-full flex items-center space-x-2 px-2.5 py-1.5 text-xs font-semibold rounded-xl text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create New Workspace</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
