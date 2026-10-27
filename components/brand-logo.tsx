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
  xs: { container: "w-5 h-5 min-w-5 rounded-md", text: "text-[9px]" },
  sm: { container: "w-7 h-7 min-w-7 rounded-lg", text: "text-[10px]" },
  md: { container: "w-8 h-8 min-w-8 rounded-lg", text: "text-xs" },
  lg: { container: "w-11 h-11 min-w-11 rounded-xl", text: "text-base font-bold" },
  xl: { container: "w-14 h-14 min-w-14 rounded-2xl", text: "text-xl font-bold" },
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

type LogoTone = "unknown" | "light" | "dark" | "balanced";

/**
 * Samples non-transparent pixels from an image to detect if the graphic
 * is predominantly light (e.g. white text/icon) or dark (e.g. black text/icon).
 */
function analyzeImageLuminance(img: HTMLImageElement): LogoTone {
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return "unknown";

    canvas.width = 16;
    canvas.height = 16;
    ctx.drawImage(img, 0, 0, 16, 16);

    const { data } = ctx.getImageData(0, 0, 16, 16);
    let totalLuminance = 0;
    let nonTransparentCount = 0;

    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      // Only count non-transparent pixels (alpha > 30 out of 255)
      if (alpha > 30) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        // Standard perceived luminance formula (ITU-R BT.601)
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        totalLuminance += lum;
        nonTransparentCount++;
      }
    }

    if (nonTransparentCount === 0) return "unknown";
    const avgLuminance = totalLuminance / nonTransparentCount;

    // Predominantly white / light graphic (needs dark background in light mode)
    if (avgLuminance > 180) {
      return "light";
    }

    // Predominantly black / dark graphic (needs white background in dark mode)
    if (avgLuminance < 100) {
      return "dark";
    }

    return "balanced";
  } catch {
    return "unknown";
  }
}

export function BrandLogo({
  name,
  url,
  domain,
  size = "sm",
  className = "",
}: BrandLogoProps) {
  const cleanUrl = useMemo(() => {
    if (!url || typeof url !== "string") return null;
    const trimmed = url.trim();
    if (!trimmed || trimmed === "null" || trimmed === "undefined") return null;
    return trimmed;
  }, [url]);

  // Clean domain for display / domain favicon resolution
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

  const domainFaviconUrl = useMemo(() => {
    if (!cleanDomain) return null;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(cleanDomain)}&sz=128`;
  }, [cleanDomain]);

  const candidates = useMemo(() => {
    const list: string[] = [];
    if (cleanUrl) list.push(cleanUrl);
    if (domainFaviconUrl && domainFaviconUrl !== cleanUrl) list.push(domainFaviconUrl);
    return list;
  }, [cleanUrl, domainFaviconUrl]);

  const [candidateIndex, setCandidateIndex] = useState<number>(0);
  const [logoTone, setLogoTone] = useState<LogoTone>("unknown");

  // Reset state if candidates change
  useEffect(() => {
    setCandidateIndex(0);
    setLogoTone("unknown");
  }, [candidates]);

  const activeSrc = candidateIndex < candidates.length ? candidates[candidateIndex] : null;
  const hasImage = Boolean(activeSrc);

  const handleImageError = () => {
    setCandidateIndex((prev) => prev + 1);
    setLogoTone("unknown");
  };

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const currentImg = e.currentTarget;
    try {
      const tone = analyzeImageLuminance(currentImg);
      if (tone !== "unknown") {
        setLogoTone(tone);
        return;
      }
    } catch {}

    // If direct canvas read was blocked by cross-origin, attempt via CORS Image object
    try {
      const testImg = new window.Image();
      testImg.crossOrigin = "anonymous";
      testImg.onload = () => {
        const tone = analyzeImageLuminance(testImg);
        if (tone !== "unknown") setLogoTone(tone);
      };
      testImg.src = currentImg.currentSrc || currentImg.src;
    } catch {}
  };

  const sizeCfg = SIZE_MAP[size] || SIZE_MAP.sm;
  const initial = (name || cleanDomain || "B").trim().charAt(0).toUpperCase();
  const gradientClass = useMemo(() => getGradient(name || cleanDomain || "Brand"), [name, cleanDomain]);

  // Adaptive background:
  // - If logo is white/light: in Light Mode add dark background (bg-slate-900), in Dark Mode natural dark
  // - If logo is black/dark: in Dark Mode add white background (dark:bg-white), in Light Mode natural light
  // - Otherwise: clean soft neutral adaptive background
  const toneBgClass = useMemo(() => {
    if (!hasImage) return "";

    if (logoTone === "light") {
      return "bg-slate-900 dark:bg-slate-900/60 text-white";
    }

    if (logoTone === "dark") {
      return "bg-slate-100/70 dark:bg-white text-slate-900";
    }

    return "bg-slate-100/70 dark:bg-slate-800/70 text-slate-900 dark:text-white";
  }, [hasImage, logoTone]);

  return (
    <div
      className={`relative inline-flex shrink-0 select-none ${className}`}
    >
      {/* Borderless Avatar Badge Tile */}
      <div
        className={`${sizeCfg.container} overflow-hidden ${hasImage ? toneBgClass : ""} flex items-center justify-center transition-all duration-150`}
        title={name || cleanDomain || "Brand logo"}
      >
        {hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={activeSrc!}
            src={activeSrc!}
            alt={name ? `${name} logo` : "Brand logo"}
            className="w-full h-full object-cover rounded-[inherit]"
            loading="lazy"
            referrerPolicy="no-referrer"
            onLoad={handleImageLoad}
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
    </div>
  );
}
