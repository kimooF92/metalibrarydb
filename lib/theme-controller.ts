export type Theme = "light" | "dark";

const THEME_CHANGE_EVENT = "themechange";
const FADE_DURATION_MS = 300;

let cleanupTimer: number | undefined;

function cleanupThemeTransition() {
  const root = document.documentElement;
  root.classList.remove("theme-fade-running", "theme-fade-overlay", "theme-switching");
  root.style.removeProperty("--theme-transition-from");
  cleanupTimer = undefined;
}

export function getStoredTheme(): Theme {
  return localStorage.getItem("theme") === "light" ? "light" : "dark";
}

export function applyTheme(nextTheme: Theme) {
  const root = document.documentElement;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (cleanupTimer !== undefined) {
    window.clearTimeout(cleanupTimer);
  }

  cleanupThemeTransition();

  const currentBackground =
    getComputedStyle(root).getPropertyValue("--background").trim() ||
    getComputedStyle(document.body).backgroundColor;

  if (!reduceMotion) {
    root.style.setProperty("--theme-transition-from", currentBackground);
    root.classList.add("theme-switching", "theme-fade-overlay");
  } else {
    root.classList.add("theme-switching");
  }

  root.classList.toggle("dark", nextTheme === "dark");
  localStorage.setItem("theme", nextTheme);
  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: { theme: nextTheme } }));

  if (reduceMotion) {
    cleanupThemeTransition();
    return;
  }

  window.requestAnimationFrame(() => {
    if (root.classList.contains("theme-fade-overlay")) {
      root.classList.add("theme-fade-running");
    }
  });

  cleanupTimer = window.setTimeout(cleanupThemeTransition, FADE_DURATION_MS + 80);
}

export function onThemeChange(listener: (theme: Theme) => void) {
  const handleThemeChange = (event: Event) => {
    const theme = (event as CustomEvent<{ theme: Theme }>).detail?.theme;
    if (theme === "light" || theme === "dark") {
      listener(theme);
    }
  };

  window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
}
