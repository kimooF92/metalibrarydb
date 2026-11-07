"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useSidebar } from "@/components/sidebar-context";

interface UseProductsLayoutParams {
  loading: boolean;
  isFetchingMore: boolean;
  page: number;
  totalPages: number;
  autoLoadCount: number;
  loadNextPage: () => void;
}

export function useProductsLayout({
  loading,
  isFetchingMore,
  page,
  totalPages,
  autoLoadCount,
  loadNextPage,
}: UseProductsLayoutParams) {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isAddProductModalOpen, setIsAddProductModalOpen] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);

  const contentScrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Dual-sidebar coordination (Main navigation sidebar <-> Second filters sidebar)
  const { isCollapsed: isMainSidebarCollapsed, setCollapsed: setMainSidebarCollapsed } = useSidebar();
  const initialMainCollapsedRef = useRef<boolean | null>(null);
  const prevMainCollapsedRef = useRef<boolean>(isMainSidebarCollapsed);

  // Initialize sidebar collapsed preference from localStorage
  useEffect(() => {
    try {
      const storedCollapse = localStorage.getItem("products_sidebar_collapsed");
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
      secondIsCollapsed = localStorage.getItem("products_sidebar_collapsed") === "true";
    } catch {}

    // When second sidebar is open on /products, collapse the main navigation sidebar
    if (!secondIsCollapsed) {
      setMainSidebarCollapsed(true);
    }

    return () => {
      // When leaving /products, restore main navigation sidebar preference
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
        localStorage.setItem("products_sidebar_collapsed", String(next));
      } catch {}

      if (!next) {
        // Second sidebar opened -> collapse main sidebar
        setMainSidebarCollapsed(true);
      } else {
        // Second sidebar collapsed -> expand main sidebar
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
          localStorage.setItem("products_sidebar_collapsed", "true");
        } catch {}
      }
    }
    prevMainCollapsedRef.current = isMainSidebarCollapsed;
  }, [isMainSidebarCollapsed, isSidebarCollapsed]);

  // Scroll listener on content canvas for back-to-top button & auto-scroll fallback
  useEffect(() => {
    const scrollContainer = contentScrollRef.current || document.querySelector("main") || window;

    const handleScroll = () => {
      const scrollPos =
        scrollContainer instanceof HTMLElement
          ? scrollContainer.scrollTop
          : window.scrollY || document.documentElement.scrollTop;

      setShowBackToTop(scrollPos > 350);

      // Auto-load trigger fallback when near bottom
      if (
        !loading &&
        !isFetchingMore &&
        page < totalPages &&
        autoLoadCount < 3
      ) {
        const scrollHeight =
          scrollContainer instanceof HTMLElement
            ? scrollContainer.scrollHeight
            : document.documentElement.scrollHeight;
        const clientHeight =
          scrollContainer instanceof HTMLElement
            ? scrollContainer.clientHeight
            : window.innerHeight;

        if (scrollPos + clientHeight >= scrollHeight - 350) {
          loadNextPage();
        }
      }
    };

    scrollContainer.addEventListener("scroll", handleScroll, { passive: true });
    return () => scrollContainer.removeEventListener("scroll", handleScroll);
  }, [loading, isFetchingMore, page, totalPages, autoLoadCount, loadNextPage]);

  // IntersectionObserver for sentinel element
  useEffect(() => {
    if (loading || isFetchingMore || page >= totalPages || autoLoadCount >= 3) {
      return;
    }

    const scrollContainer = contentScrollRef.current || document.querySelector("main");

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && !loading && !isFetchingMore && page < totalPages) {
          loadNextPage();
        }
      },
      {
        root: scrollContainer || null,
        rootMargin: "300px",
        threshold: 0.1,
      }
    );

    const currentSentinel = sentinelRef.current;
    if (currentSentinel) {
      observer.observe(currentSentinel);
    }

    return () => {
      if (currentSentinel) {
        observer.unobserve(currentSentinel);
      }
      observer.disconnect();
    };
  }, [loading, isFetchingMore, page, totalPages, autoLoadCount, loadNextPage]);

  const scrollToTop = useCallback(() => {
    if (contentScrollRef.current) {
      contentScrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      const mainContainer = document.querySelector("main");
      if (mainContainer) {
        mainContainer.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
  }, []);

  return {
    viewMode,
    setViewMode,
    isSidebarCollapsed,
    setIsSidebarCollapsed,
    isMobileDrawerOpen,
    setIsMobileDrawerOpen,
    isAddProductModalOpen,
    setIsAddProductModalOpen,
    contentScrollRef,
    sentinelRef,
    showBackToTop,
    scrollToTop,
    handleToggleSecondSidebar,
  };
}

