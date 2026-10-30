"use client";

import React from "react";

export interface SettingsCardProps {
  title: string | React.ReactNode;
  description?: string | React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
  statusBanner?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  headerClassName?: string;
}

export function SettingsCard({
  title,
  description,
  icon: Icon,
  action,
  statusBanner,
  children,
  className = "",
  headerClassName = "",
}: SettingsCardProps) {
  return (
    <div
      className={`p-5 rounded-2xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-slate-900/60 shadow-xs hover:border-slate-300 dark:hover:border-slate-700/80 transition-all flex flex-col justify-between space-y-3.5 ${className}`}
    >
      <div className="space-y-3">
        {/* Header: Title, Description, and Action */}
        <div className={`flex items-start justify-between gap-4 ${headerClassName}`}>
          <div className="flex items-start space-x-3 min-w-0 flex-1">
            {Icon && (
              <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 mt-0.5">
                <Icon className="w-4 h-4" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              {typeof title === "string" ? (
                <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">
                  {title}
                </h3>
              ) : (
                title
              )}
              {description && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                  {description}
                </p>
              )}
            </div>
          </div>

          {action && <div className="shrink-0 pt-0.5">{action}</div>}
        </div>

        {/* Optional Status Banner */}
        {statusBanner && <div>{statusBanner}</div>}
      </div>

      {/* Main Body / Inputs / Selectors */}
      {children && <div className="pt-1">{children}</div>}
    </div>
  );
}
