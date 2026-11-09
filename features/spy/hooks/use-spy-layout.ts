"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useSidebar } from "@/components/sidebar-context";
import type { AdFilterParams } from "@/types";

export interface UseSpyLayoutReturn {
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  isMobileDrawerOpen: boolean;
  setIsMobileDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  handleToggleSecondSidebar: () => void;
  contentScrollRef: React.RefObject<HTMLDivElement | null>;
  showBackToTop: boolean;
  activeFilterCount: number;
  scrollToTop: () => void;
}

export function useSpyLayout(params?: AdFilterParams): UseSpyLayoutReturn {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);

  const contentScrollRef = useRef<HTMLDivElement | null>(null);

  // Dual-sidebar coordination (Main navigation sidebar <-> Second filters sidebar)
  const { isCollapsed: isMainSidebarCollapsed, setCollapsed: setMainSidebarCollapsed } = useSidebar();
  const initialMainCollapsedRef = useRef<boolean | null>(null);
  const prevMainCollapsedRef = useRef<boolean>(isMainSidebarCollapsed);

  // Initialize sidebar collapsed preference from localStorage
  useEffect(() => {
    try {
      const storedCollapse = localStorage.getItem("spy_sidebar_collapsed");
      if (storedCollapse === "true") setIsSidebarCollapsed(true);
    } catch {}
  }, []);

  // Coordinate main navigation sidebar collapse with the second filters sidebar
  useEffect(() => {
    if (initialMainCollapsedRef.current === null) {
      initialMainCollapsedRef.current = isMainSidebarCollapsed;
    }

    let secondIsCollapsed = false;
    try {
      secondIsCollapsed = localStorage.getItem("spy_sidebar_collapsed") === "true";
    } catch {}

    // When second sidebar is open on /spy, collapse the main navigation sidebar
    if (!secondIsCollapsed) {
      setMainSidebarCollapsed(true);
    }

    return () => {
      // When leaving /spy, restore main navigation sidebar preference
      if (initialMainCollapsedRef.current !== null) {
        setMainSidebarCollapsed(initialMainCollapsedRef.current);
      }
    };
  }, [setMainSidebarCollapsed]);

  // Handler to toggle the second sidebar (filters sidebar)
  const handleToggleSecondSidebar = useCallback(() => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("spy_sidebar_collapsed", String(next));
      } catch {}

      if (!next) {
        setMainSidebarCollapsed(true);
      } else {
        setMainSidebarCollapsed(false);
      }

      return next;
    });
  }, [setMainSidebarCollapsed]);

  // If user explicitly expands main sidebar while second sidebar is open, auto-collapse second sidebar
  useEffect(() => {
    if (prevMainCollapsedRef.current === true && isMainSidebarCollapsed === false) {
      if (!isSidebarCollapsed) {
        setIsSidebarCollapsed(true);
        try {
          localStorage.setItem("spy_sidebar_collapsed", "true");
        } catch {}
      }
    }
    prevMainCollapsedRef.current = isMainSidebarCollapsed;
  }, [isMainSidebarCollapsed, isSidebarCollapsed]);

  // Scroll listener for back-to-top button in the inner scroll container
  useEffect(() => {
    const el = contentScrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      setShowBackToTop(el.scrollTop > 350);
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = useCallback(() => {
    contentScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const activeFilterCount = useMemo(() => {
    if (!params) return 0;
    return (
      (params.mediaType && params.mediaType !== "all" ? 1 : 0) +
      (params.status && params.status !== "all" ? 1 : 0) +
      (params.minDuplications && params.minDuplications > 1 ? 1 : 0) +
      (params.minWinnerScore && params.minWinnerScore > 0 ? 1 : 0) +
      (params.minDaysRunning && params.minDaysRunning > 0 ? 1 : 0) +
      (params.dateFrom || params.dateTo ? 1 : 0) +
      ((params.excludePageIds || []).length > 0 ? 1 : 0) +
      (params.search?.trim() ? 1 : 0)
    );
  }, [params]);

  return {
    isSidebarCollapsed,
    setIsSidebarCollapsed,
    isMobileDrawerOpen,
    setIsMobileDrawerOpen,
    handleToggleSecondSidebar,
    contentScrollRef,
    showBackToTop,
    activeFilterCount,
    scrollToTop,
  };
}
