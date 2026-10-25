"use client";

import { useState, useMemo, useEffect } from "react";

interface BrandLogoProps {
  name?: string | null;
  url?: string | null;
  domain?: string | null;
  pageId?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  showHoverPreview?: boolean;
}

const SIZE_MAP = {
  xs: { container: "w-5 h-5 min-w-5 rounded-md", text: "text-[9px]", padding: "p-0.5" },
  sm: { container: "w-6 h-6 min-w-6 rounded-md", text: "text-[10px]", padding: "p-0.5" },
  md: { container: "w-8 h-8 min-w-8 rounded-lg", text: "text-xs", padding: "p-1" },
  lg: { container: "w-12 h-12 min-w-12 rounded-xl", text: "text-base font-bold", padding: "p-1.5" },
  xl: { container: "w-16 h-16 min-w-16 rounded-2xl", text: "text-xl font-bold", padding: "p-2" },
};

// Deterministic vibrant gradient palettes for fallback letter avatars
const GRADIENTS = [
  "from-indigo-500 to-purple-600 text-white",
  "from-blue-500 to-indigo-600 text-white",
  "from-emerald-500 to-teal-600 text-white",
  "from-violet-500 to-purple-700 text-white",
  "from-rose-500 to-pink-600 text-white",
  "from-amber-500 to-orange-600 text-white",
  "from-cyan-500 to-blue-600 text-white",
  "from-fuchsia-500 to-rose-600 text-white",
];

function getGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % GRADIENTS.length;
  return GRADIENTS[index];
}

export function BrandLogo({
  name,
  url,
  domain,
  size = "sm",
  className = "",
  showHoverPreview = false,
}: BrandLogoProps) {
  const [imgFailed, setImgFailed] = useState<boolean>(false);
  const [isHovered, setIsHovered] = useState(false);

  const cleanUrl = useMemo(() => {
    if (!url || typeof url !== "string") return null;
    const trimmed = url.trim();
    if (!trimmed || trimmed === "null" || trimmed === "undefined") return null;
    // Reject any Google Favicon URL that could return a generic globe
    if (trimmed.includes("google.com/s2/favicons")) return null;
    return trimmed;
  }, [url]);

  // Clean domain for display / initial fallback
  const cleanDomain = useMemo(() => {
    if (!domain) return null;
    const cleaned = domain
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .split("/")[0]
      .split("?")[0]
      .trim()
      .toLowerCase();
    if (!cleaned || cleaned.includes("facebook.com") || cleaned.includes("instagram.com")) {
      return null;
    }
    return cleaned;
  }, [domain]);

  // Reset error state if url changes
  useEffect(() => {
    setImgFailed(false);
  }, [cleanUrl]);

  const sizeCfg = SIZE_MAP[size] || SIZE_MAP.sm;
  const initial = (name || cleanDomain || "B").trim().charAt(0).toUpperCase();
  const gradientClass = useMemo(() => getGradient(name || cleanDomain || "Brand"), [name, cleanDomain]);

  const hasImage = Boolean(cleanUrl && !imgFailed);

  return (
    <div
      className={`relative inline-flex shrink-0 select-none ${className}`}
      onMouseEnter={() => showHoverPreview && setIsHovered(true)}
      onMouseLeave={() => showHoverPreview && setIsHovered(false)}
    >
      {/* Main Avatar Badge Tile */}
      <div
        className={`${sizeCfg.container} overflow-hidden border border-slate-200/90 dark:border-slate-700/80 bg-white dark:bg-slate-800 flex items-center justify-center shadow-2xs transition-transform duration-150 ${
          showHoverPreview ? "hover:scale-105 cursor-pointer" : ""
        }`}
        title={name || cleanDomain || "Brand logo"}
      >
        {hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cleanUrl!}
            alt={name ? `${name} logo` : "Brand logo"}
            className={`w-full h-full object-contain ${sizeCfg.padding} rounded-[inherit]`}
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div
            className={`w-full h-full bg-linear-to-br ${gradientClass} flex items-center justify-center font-extrabold ${sizeCfg.text}`}
          >
            {initial}
          </div>
        )}
      </div>

      {/* Enlarged Hover Popover with Dual Dark/Light Background Preview for Transparent Logos */}
      {showHoverPreview && isHovered && (hasImage || name) && (
        <div className="absolute left-0 bottom-full mb-2 z-50 pointer-events-none animate-in fade-in zoom-in-95 duration-100">
          <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col gap-2.5 min-w-[180px] max-w-[280px]">
            {/* Dual Background Previews for Transparent Logos (Dark & Light) */}
            <div className="flex items-center gap-2">
              {/* Light Background Preview Tile */}
              <div
                className="w-12 h-12 rounded-lg border border-slate-200/90 bg-white p-1 overflow-hidden flex flex-col items-center justify-center shrink-0 shadow-2xs relative group/light"
                title="Preview on Light Background"
              >
                {hasImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={cleanUrl!}
                    alt={name || "Brand logo"}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div
                    className={`w-full h-full rounded-md bg-linear-to-br ${gradientClass} flex items-center justify-center font-black text-lg`}
                  >
                    {initial}
                  </div>
                )}
                <span className="absolute bottom-0 inset-x-0 bg-slate-900/70 text-[7px] text-white font-semibold text-center py-0.2 tracking-wider uppercase">
                  Light
                </span>
              </div>

              {/* Dark Background Preview Tile */}
              <div
                className="w-12 h-12 rounded-lg border border-slate-700 bg-slate-950 p-1 overflow-hidden flex flex-col items-center justify-center shrink-0 shadow-2xs relative group/dark"
                title="Preview on Dark Background"
              >
                {hasImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={cleanUrl!}
                    alt={name || "Brand logo"}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div
                    className={`w-full h-full rounded-md bg-linear-to-br ${gradientClass} flex items-center justify-center font-black text-lg`}
                  >
                    {initial}
                  </div>
                )}
                <span className="absolute bottom-0 inset-x-0 bg-white/20 text-[7px] text-white font-semibold text-center py-0.2 tracking-wider uppercase backdrop-blur-xs">
                  Dark
                </span>
              </div>

              {/* Brand Metadata */}
              <div className="min-w-0 flex-1 pl-1">
                <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                  {name || "Brand"}
                </div>
                {cleanDomain && (
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono truncate">
                    {cleanDomain}
                  </div>
                )}
                <div className="text-[9px] text-indigo-600 dark:text-indigo-400 font-medium mt-0.5">
                  {hasImage ? "Store Logo" : "Initial Badge"}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
