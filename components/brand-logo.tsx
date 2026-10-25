"use client";

import { useState, useMemo, useEffect } from "react";
import Image from "next/image";
import { resolveTrackableDomain } from "@/lib/url-parser";

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
  xs: { container: "w-5 h-5 min-w-5 rounded-md", text: "text-[9px]", icon: 20 },
  sm: { container: "w-6 h-6 min-w-6 rounded-md", text: "text-[10px]", icon: 24 },
  md: { container: "w-8 h-8 min-w-8 rounded-lg", text: "text-xs", icon: 32 },
  lg: { container: "w-12 h-12 min-w-12 rounded-xl", text: "text-base font-bold", icon: 48 },
  xl: { container: "w-16 h-16 min-w-16 rounded-2xl", text: "text-xl font-bold", icon: 64 },
};

// Deterministic gradient palettes for fallback initial avatars
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
  // Stage 0: url (if provided), Stage 1: domain favicon, Stage 2: letter fallback
  const [stage, setStage] = useState<number>(0);
  const [isHovered, setIsHovered] = useState(false);

  // Clean the domain if provided (e.g. https://zara.com/tn -> zara.com)
  const cleanDomain = useMemo(() => {
    if (!domain) return null;
    const raw = resolveTrackableDomain(domain) || domain.replace(/^https?:\/\//i, "").split("/")[0].split("?")[0];
    const cleaned = raw.replace(/^www\./i, "").trim().toLowerCase();
    // Exclude social networks and strings without a valid domain TLD dot
    if (
      !cleaned ||
      cleaned.includes("facebook.com") ||
      cleaned.includes("fb.me") ||
      cleaned.includes("instagram.com") ||
      !cleaned.includes(".") ||
      cleaned.includes(" ")
    ) {
      return null;
    }
    return cleaned;
  }, [domain]);

  // Reset stage if url or domain changes
  useEffect(() => {
    setStage(0);
  }, [url, cleanDomain]);

  const sizeCfg = SIZE_MAP[size] || SIZE_MAP.sm;
  const initial = (name || cleanDomain || "B").trim().charAt(0).toUpperCase();
  const gradientClass = useMemo(() => getGradient(name || cleanDomain || "Brand"), [name, cleanDomain]);

  // Compute favicon URL (with default_icon=404 so Google doesn't return the generic blue globe)
  const faviconUrl = cleanDomain
    ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(cleanDomain)}&sz=128&default_icon=404`
    : null;

  // Determine active image source
  let activeSrc: string | null = null;
  if (stage === 0 && url) {
    activeSrc = url;
  } else if ((stage <= 1 && faviconUrl) || (!url && stage === 0 && faviconUrl)) {
    activeSrc = faviconUrl;
  }

  const handleImageError = () => {
    if (stage === 0 && faviconUrl && activeSrc !== faviconUrl) {
      setStage(1); // Try favicon next
    } else {
      setStage(2); // Fallback to initial badge
    }
  };

  return (
    <div
      className={`relative inline-flex shrink-0 select-none ${className}`}
      onMouseEnter={() => showHoverPreview && setIsHovered(true)}
      onMouseLeave={() => showHoverPreview && setIsHovered(false)}
    >
      <div
        className={`${sizeCfg.container} overflow-hidden border border-slate-200/80 dark:border-slate-800/80 bg-slate-100 dark:bg-slate-900 flex items-center justify-center shadow-2xs transition-transform duration-150 ${
          showHoverPreview ? "hover:scale-105 cursor-pointer" : ""
        }`}
        title={name || cleanDomain || "Brand logo"}
      >
        {activeSrc && stage < 2 ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={activeSrc}
            alt={name ? `${name} logo` : "Brand logo"}
            className="w-full h-full object-cover rounded-[inherit]"
            loading="lazy"
            onError={handleImageError}
          />
        ) : (
          <div
            className={`w-full h-full bg-linear-to-br ${gradientClass} flex items-center justify-center font-extrabold ${sizeCfg.text}`}
          >
            {initial}
          </div>
        )}
      </div>

      {/* Optional Enlarged Hover Popover */}
      {showHoverPreview && isHovered && (activeSrc || name) && (
        <div className="absolute left-0 bottom-full mb-2 z-50 pointer-events-none animate-in fade-in zoom-in-95 duration-100">
          <div className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl flex items-center gap-2.5 min-w-[140px] max-w-[240px]">
            <div className="w-12 h-12 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 overflow-hidden flex items-center justify-center shrink-0">
              {activeSrc && stage < 2 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={activeSrc}
                  alt={name || "Brand logo"}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div
                  className={`w-full h-full bg-linear-to-br ${gradientClass} flex items-center justify-center font-black text-lg`}
                >
                  {initial}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                {name || "Brand"}
              </div>
              {cleanDomain && (
                <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono truncate">
                  {cleanDomain}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
