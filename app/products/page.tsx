"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ScrapedProduct } from "@/types";
import { ProductCard } from "@/components/products/product-card";
import { ProductRow } from "@/components/products/product-row";
import { ProductDetailsModal } from "@/components/products/product-details-modal";
import { AddProductModal } from "@/components/products/add-product-modal";
import { ProductsKpiBar } from "@/components/products/products-kpi-bar";
import type { SmartPreset } from "@/components/products/products-kpi-bar";
import { ProductsSidebarFilters } from "@/components/products/products-sidebar-filters";
import { ProductsTopBar } from "@/components/products/products-top-bar";
import { MobileFilterDrawer } from "@/components/products/mobile-filter-drawer";
import { ProductsEmptyState } from "@/components/products/products-empty-state";
import { resolveProductForRefresh } from "@/lib/product-extraction";
import { useToast } from "@/components/toast-context";
import { useWorkspace } from "@/components/workspace-context";
import { useSidebar } from "@/components/sidebar-context";
import {
  ShoppingBag,
  RotateCw,
  Eye,
  ArrowUp,
  Loader2,
  CheckCircle2,
  PlusCircle,
} from "lucide-react";

export default function ProductsPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { activeWorkspace } = useWorkspace();
  const [products, setProducts] = useState<ScrapedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Smart preset tab & view mode
  const [smartPreset, setSmartPreset] = useState<SmartPreset>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isAddProductModalOpen, setIsAddProductModalOpen] = useState(false);

  // Dual-sidebar coordination (Main navigation sidebar <-> Second filters sidebar)
  const { isCollapsed: isMainSidebarCollapsed, setCollapsed: setMainSidebarCollapsed } = useSidebar();
  const initialMainCollapsedRef = useRef<boolean | null>(null);
  const prevMainCollapsedRef = useRef<boolean>(isMainSidebarCollapsed);
  const contentScrollRef = useRef<HTMLDivElement | null>(null);

  // Filters & Pagination
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [brandInput, setBrandInput] = useState("");
  const [debouncedBrand, setDebouncedBrand] = useState("");

  const [platform, setPlatform] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedNiches, setSelectedNiches] = useState<string[]>([]);
  const [selectedSubNiches, setSelectedSubNiches] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [hideInactive, setHideInactive] = useState(false);
  const [discoveryFilter, setDiscoveryFilter] = useState("all");
  const [discoveryFrom, setDiscoveryFrom] = useState("");
  const [discoveryTo, setDiscoveryTo] = useState("");
  const [adLaunchFilter, setAdLaunchFilter] = useState("all");
  const [adLaunchFrom, setAdLaunchFrom] = useState("");
  const [adLaunchTo, setAdLaunchTo] = useState("");
  const [stillRunningOnly, setStillRunningOnly] = useState(true);
  const [sortBy, setSortBy] = useState<string>("latest");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 24,
    total: 0,
    totalPages: 1,
  });

  // Hybrid auto-scroll tracking
  const [autoLoadCount, setAutoLoadCount] = useState(0);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [statsLoading, setStatsLoading] = useState(true);
  const [stats, setStats] = useState<{
    totalProducts: number;
    successfulProducts: number;
    pendingProducts: number;
    withOffersCount: number;
    favoritesCount: number;
    newThisWeekCount: number;
    evergreenCount: number;
    activeCount: number;
    inactiveCount: number;
    platforms: {
      shopify: number;
      youcan: number;
      woocommerce: number;
    };
    nicheCounts?: { category: string; subCategory: string | null; count: number }[];
  }>({
    totalProducts: 0,
    successfulProducts: 0,
    pendingProducts: 0,
    withOffersCount: 0,
    favoritesCount: 0,
    newThisWeekCount: 0,
    evergreenCount: 0,
    activeCount: 0,
    inactiveCount: 0,
    platforms: {
      shopify: 0,
      youcan: 0,
      woocommerce: 0,
    },
    nicheCounts: [],
  });

  // Modal state
  const [selectedProduct, setSelectedProduct] = useState<ScrapedProduct | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const detailRequestIdRef = useRef(0);
  const lastStatsFetchedRef = useRef(0);

  // Recently inspected products tracking (session-based)
  const [recentlyViewedIds, setRecentlyViewedIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("recently_viewed_products");
      if (stored) {
        setRecentlyViewedIds(JSON.parse(stored));
      }
    } catch {}
  }, []);

  // Async stats fetcher (cached on backend, does not block product feed)
  const fetchStats = useCallback(async (forceRefresh = false) => {
    const now = Date.now();
    if (!forceRefresh && now - lastStatsFetchedRef.current < 45000 && lastStatsFetchedRef.current > 0) {
      return;
    }
    lastStatsFetchedRef.current = now;
    try {
      const res = await fetch(`/api/products/stats${forceRefresh ? "?refresh=true" : ""}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.stats) {
          setStats(data.stats);
        }
      }
    } catch (err) {
      console.warn("[Products Page] Stats fetch error:", err);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // Fetch stats once on initial mount
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Debounce search input (350ms) to prevent keystroke request storms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Debounce brand filter input (350ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedBrand(brandInput);
    }, 350);
    return () => clearTimeout(timer);
  }, [brandInput]);

  // Read URL query params on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const searchParam = params.get("search");
      if (searchParam) {
        setSearchInput(searchParam);
        setDebouncedSearch(searchParam);
      }
      const brandParam = params.get("brand");
      if (brandParam) {
        setBrandInput(brandParam);
        setDebouncedBrand(brandParam);
      }
      const presetParam = params.get("preset");
      if (presetParam && ["all", "breakout", "most_scaled", "new_discovered", "top_lasting", "with_offers", "favorites"].includes(presetParam)) {
        setSmartPreset(presetParam as SmartPreset);
      }
      const platformParam = params.get("platform");
      if (platformParam) setPlatform(platformParam);
      const categoryParam = params.get("category");
      if (categoryParam) setCategoryFilter(categoryParam);
      const nicheParam = params.get("niche") || categoryParam;
      if (nicheParam && nicheParam !== "all") {
        setSelectedNiches(nicheParam.split(",").map((n) => n.trim()).filter(Boolean));
      }
      const subNicheParam = params.get("subNiche") || params.get("subCategory");
      if (subNicheParam && subNicheParam !== "all") {
        setSelectedSubNiches(subNicheParam.split(",").map((s) => s.trim()).filter(Boolean));
      }
      try {
        const storedCollapse = localStorage.getItem("products_sidebar_collapsed");
        if (storedCollapse === "true") setIsSidebarCollapsed(true);
      } catch {}
      const statusParam = params.get("status");
      if (statusParam) setStatusFilter(statusParam);
      const sortByParam = params.get("sortBy");
      if (sortByParam) setSortBy(sortByParam);
      const hideInactiveParam = params.get("hideInactive");
      if (hideInactiveParam === "true") setHideInactive(true);
      const discoveryParam = params.get("discovery");
      if (discoveryParam) setDiscoveryFilter(discoveryParam);
      const discoveryFromParam = params.get("discoveryFrom");
      if (discoveryFromParam) setDiscoveryFrom(discoveryFromParam);
      const discoveryToParam = params.get("discoveryTo");
      if (discoveryToParam) setDiscoveryTo(discoveryToParam);
      const adLaunchParam = params.get("adLaunch") || params.get("adLaunchFilter");
      if (adLaunchParam) setAdLaunchFilter(adLaunchParam);
      const adLaunchFromParam = params.get("adLaunchFrom");
      if (adLaunchFromParam) setAdLaunchFrom(adLaunchFromParam);
      const adLaunchToParam = params.get("adLaunchTo");
      if (adLaunchToParam) setAdLaunchTo(adLaunchToParam);
      const stillRunningParam = params.get("stillRunning");
      if (stillRunningParam === "false") setStillRunningOnly(false);
      else if (stillRunningParam === "true") setStillRunningOnly(true);

      // Check for deep-linked product ID (?id=... or ?productId=...)
      const idParam = params.get("id") || params.get("productId");
      if (idParam) {
        fetch(`/api/products?id=${encodeURIComponent(idParam)}`)
          .then((res) => res.json())
          .then((data) => {
            if (data.success && data.products && data.products.length > 0) {
              setSelectedProduct(data.products[0]);
              setIsModalOpen(true);
            }
          })
          .catch((err) => console.error("[Products Page] Deep-link product fetch error:", err));
      }
    }
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

  // Listen to browser Back / Forward history events to keep URL bar & modal state in sync
  useEffect(() => {
    const handlePopState = () => {
      if (typeof window === "undefined") return;
      const params = new URLSearchParams(window.location.search);
      const idParam = params.get("id") || params.get("productId");
      if (idParam) {
        const found = products.find((p) => p.id === idParam);
        if (found) {
          setSelectedProduct(found);
          setIsModalOpen(true);
        } else {
          fetch(`/api/products?id=${encodeURIComponent(idParam)}`)
            .then((res) => res.json())
            .then((data) => {
              if (data.success && data.products && data.products.length > 0) {
                setSelectedProduct(data.products[0]);
                setIsModalOpen(true);
              }
            })
            .catch((err) => console.error("[Products Page] Popstate product fetch error:", err));
        }
      } else {
        setIsModalOpen(false);
        setSelectedProduct(null);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [products]);

  // Continuous sync between active modal state and URL address bar
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (isModalOpen && selectedProduct?.id) {
      if (url.searchParams.get("id") !== selectedProduct.id) {
        url.searchParams.set("id", selectedProduct.id);
        window.history.replaceState(null, "", url.toString());
      }
    } else if (!isModalOpen) {
      if (url.searchParams.has("id") || url.searchParams.has("productId")) {
        url.searchParams.delete("id");
        url.searchParams.delete("productId");
        window.history.replaceState(null, "", url.toString());
      }
    }
  }, [isModalOpen, selectedProduct]);

  // Continuous sync between active filters and URL search params
  const isFilterHydratedRef = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isFilterHydratedRef.current) {
      isFilterHydratedRef.current = true;
      return;
    }

    const url = new URL(window.location.href);
    const currentId = url.searchParams.get("id") || url.searchParams.get("productId");
    const newParams = new URLSearchParams();

    if (currentId) newParams.set("id", currentId);
    if (debouncedSearch.trim()) newParams.set("search", debouncedSearch.trim());
    if (debouncedBrand.trim()) newParams.set("brand", debouncedBrand.trim());
    if (smartPreset !== "all") newParams.set("preset", smartPreset);
    if (platform !== "all") newParams.set("platform", platform);
    if (selectedNiches.length > 0) {
      newParams.set("niche", selectedNiches.join(","));
    } else if (categoryFilter !== "all") {
      newParams.set("category", categoryFilter);
    }
    if (selectedSubNiches.length > 0) {
      newParams.set("subNiche", selectedSubNiches.join(","));
    }
    if (statusFilter !== "all") newParams.set("status", statusFilter);
    if (sortBy !== "latest") newParams.set("sortBy", sortBy);
    if (hideInactive) newParams.set("hideInactive", "true");
    if (discoveryFilter !== "all") newParams.set("discovery", discoveryFilter);
    if (discoveryFilter === "custom") {
      if (discoveryFrom) newParams.set("discoveryFrom", discoveryFrom);
      if (discoveryTo) newParams.set("discoveryTo", discoveryTo);
    }
    if (adLaunchFilter !== "all") newParams.set("adLaunch", adLaunchFilter);
    if (adLaunchFilter === "custom") {
      if (adLaunchFrom) newParams.set("adLaunchFrom", adLaunchFrom);
      if (adLaunchTo) newParams.set("adLaunchTo", adLaunchTo);
    }
    if (!stillRunningOnly) newParams.set("stillRunning", "false");

    const nextSearch = newParams.toString();
    const nextUrl = nextSearch ? `${url.pathname}?${nextSearch}` : url.pathname;
    window.history.replaceState(null, "", nextUrl);
  }, [
    debouncedSearch,
    debouncedBrand,
    smartPreset,
    platform,
    categoryFilter,
    selectedNiches,
    selectedSubNiches,
    statusFilter,
    sortBy,
    hideInactive,
    discoveryFilter,
    discoveryFrom,
    discoveryTo,
    adLaunchFilter,
    adLaunchFrom,
    adLaunchTo,
    stillRunningOnly,
  ]);

  const fetchProducts = useCallback(
    async (targetPage = 1, append = false, forceRefresh = false) => {
      // Abort any in-flight requests to eliminate connection-pool pileups
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const currentController = new AbortController();
      abortControllerRef.current = currentController;

      if (append) {
        setIsFetchingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const query = new URLSearchParams({
          page: targetPage.toString(),
          limit: "24",
          sortBy,
          smartPreset,
        });

        // Only bust cache if the user explicitly clicked manual refresh
        if (forceRefresh) {
          query.set("_t", Date.now().toString());
        }

        if (debouncedSearch.trim()) query.set("search", debouncedSearch.trim());
        if (debouncedBrand.trim()) query.set("brand", debouncedBrand.trim());
        if (platform !== "all") query.set("platform", platform);
        if (selectedNiches.length > 0) {
          query.set("niche", selectedNiches.join(","));
        } else if (categoryFilter !== "all") {
          query.set("category", categoryFilter);
        }
        if (selectedSubNiches.length > 0) {
          query.set("subNiche", selectedSubNiches.join(","));
        }
        if (statusFilter !== "all") query.set("status", statusFilter);
        if (hideInactive) query.set("hideInactive", "true");
        if (discoveryFilter !== "all") query.set("discovery", discoveryFilter);
        if (discoveryFilter === "custom") {
          if (discoveryFrom) query.set("discoveryFrom", discoveryFrom);
          if (discoveryTo) query.set("discoveryTo", discoveryTo);
        }
        if (adLaunchFilter !== "all") query.set("adLaunch", adLaunchFilter);
        if (adLaunchFilter === "custom") {
          if (adLaunchFrom) query.set("adLaunchFrom", adLaunchFrom);
          if (adLaunchTo) query.set("adLaunchTo", adLaunchTo);
        }
        if (!stillRunningOnly) query.set("stillRunning", "false");

        const res = await fetch(`/api/products?${query.toString()}`, {
          signal: currentController.signal,
          cache: forceRefresh ? "no-store" : "default",
        });
        if (!res.ok) {
          throw new Error(`Failed to load products (${res.status})`);
        }

        const data = await res.json();
        if (data.success) {
          const newItems: ScrapedProduct[] = data.products || [];
          if (append) {
            setProducts((prev) => {
              const existingIds = new Set(prev.map((p) => p.id));
              const filtered = newItems.filter((p) => !existingIds.has(p.id));
              return [...prev, ...filtered];
            });
          } else {
            setProducts(newItems);
          }
          if (data.pagination) setPagination(data.pagination);
        } else {
          throw new Error(data.error || "Unknown error");
        }
      } catch (err: any) {
        if (err.name === "AbortError" || err.message?.toLowerCase().includes("abort")) {
          return; // Intentional abort, ignore silently
        }
        console.error("[Products Page] Fetch error:", err);
        setError(err.message || "Failed to load products");
        setLoading(false);
        setIsFetchingMore(false);
      } finally {
        if (abortControllerRef.current === currentController) {
          setLoading(false);
          setIsFetchingMore(false);
        }
      }
    },
    [
      sortBy,
      smartPreset,
      debouncedSearch,
      debouncedBrand,
      platform,
      categoryFilter,
      selectedNiches,
      selectedSubNiches,
      statusFilter,
      hideInactive,
      discoveryFilter,
      discoveryFrom,
      discoveryTo,
      adLaunchFilter,
      adLaunchFrom,
      adLaunchTo,
      stillRunningOnly,
    ]
  );

  // Trigger fetch on filter/sort change
  useEffect(() => {
    setPage(1);
    setAutoLoadCount(0);
    fetchProducts(1, false);
  }, [fetchProducts]);

  // Re-fetch products when workspace switches
  useEffect(() => {
    if (activeWorkspace?.id) {
      setPage(1);
      setAutoLoadCount(0);
      fetchProducts(1, false);
      fetchStats();
    }
  }, [activeWorkspace?.id]);

  // Load next page function
  const loadNextPage = useCallback(() => {
    if (loading || isFetchingMore || page >= pagination.totalPages) return;
    const nextPage = page + 1;
    setPage(nextPage);
    setAutoLoadCount((prev) => prev + 1);
    fetchProducts(nextPage, true);
  }, [loading, isFetchingMore, page, pagination.totalPages, fetchProducts]);

  // Manual Load More button handler
  const handleManualLoadMore = () => {
    if (loading || isFetchingMore || page >= pagination.totalPages) return;
    const nextPage = page + 1;
    setPage(nextPage);
    setAutoLoadCount(0); // Reset the 3-batch pause
    fetchProducts(nextPage, true);
  };

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
        page < pagination.totalPages &&
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
  }, [loading, isFetchingMore, page, pagination.totalPages, autoLoadCount, loadNextPage]);

  // IntersectionObserver for sentinel element
  useEffect(() => {
    if (loading || isFetchingMore || page >= pagination.totalPages || autoLoadCount >= 3) {
      return;
    }

    const scrollContainer = contentScrollRef.current || document.querySelector("main");

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && !loading && !isFetchingMore && page < pagination.totalPages) {
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
  }, [loading, isFetchingMore, page, pagination.totalPages, autoLoadCount, loadNextPage]);

  const scrollToTop = () => {
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
  };

  const handleToggleFavorite = useCallback(async (productId: string, nextFavorite: boolean) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, isFavorite: nextFavorite } : p))
    );
    setStats((prev) => ({
      ...prev,
      favoritesCount: Math.max(0, prev.favoritesCount + (nextFavorite ? 1 : -1)),
    }));

    try {
      const res = await fetch("/api/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: productId, isFavorite: nextFavorite }),
      });

      if (!res.ok) throw new Error("Failed to update favorite status");

      showToast({
        type: "success",
        title: nextFavorite ? "⭐ Added to Favorites" : "Removed from Favorites",
        message: nextFavorite
          ? "Product saved to your starred favorites catalog."
          : "Product removed from favorites.",
      });
    } catch (err: any) {
      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, isFavorite: !nextFavorite } : p))
      );
      setStats((prev) => ({
        ...prev,
        favoritesCount: Math.max(0, prev.favoritesCount + (nextFavorite ? -1 : 1)),
      }));
      showToast({
        type: "error",
        title: "Favorite Error",
        message: err.message || "Could not update favorite status.",
      });
    }
  }, [showToast]);

  const handleRefresh = useCallback(async (productId: string, productOverride?: ScrapedProduct) => {
    const prod = resolveProductForRefresh(productId, products, productOverride || selectedProduct);
    if (!prod || !prod.url) {
      showToast({
        type: "error",
        title: "Refresh Unavailable",
        message: "This product has no usable landing-page URL to re-extract.",
      });
      return;
    }

    try {
      const res = await fetch("/api/products/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: prod.id,
          url: prod.url,
          pageId: prod.pageId,
          forceRefresh: true,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success && data.product) {
        setProducts((prev) =>
          prev.map((p) => (p.id === productId ? { ...p, ...data.product } : p))
        );
        setSelectedProduct((prev) => (prev?.id === productId ? { ...prev, ...data.product } : prev));
        showToast({
          type: "success",
          title: "Product Re-extracted",
          message: `Updated pricing and details for "${data.product.title || "product"}".`,
        });
      } else {
        showToast({
          type: "error",
          title: "Refresh Failed",
          message: data.error || "Could not re-extract landing page.",
        });
      }
    } catch (err: any) {
      showToast({
        type: "error",
        title: "Network Error",
        message: err.message || "Failed to refresh product.",
      });
    }
  }, [products, selectedProduct, showToast]);

  const handleProductUpdate = useCallback((updatedProduct: ScrapedProduct) => {
    setSelectedProduct(updatedProduct);
    setProducts((prev) =>
      prev.map((p) => (p.id === updatedProduct.id ? updatedProduct : p))
    );
  }, []);

  const handleCloseDetailsModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedProduct(null);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.has("id") || url.searchParams.has("productId")) {
        url.searchParams.delete("id");
        url.searchParams.delete("productId");
        window.history.pushState({}, "", url.toString());
      }
    }
  }, []);

  const handleDelete = useCallback(async (productId: string) => {
    const targetProduct = products.find((p) => p.id === productId);
    const targetIndex = products.findIndex((p) => p.id === productId);
    if (!targetProduct) return;

    setProducts((prev) => prev.filter((p) => p.id !== productId));
    setSelectedProduct((prev) => (prev?.id === productId ? null : prev));
    setIsModalOpen((prev) => (selectedProduct?.id === productId ? false : prev));

    fetch(`/api/products?id=${productId}`, { method: "DELETE" }).catch((err) =>
      console.error("[Delete API Error]:", err)
    );

    showToast({
      type: "info",
      title: "Product Deleted",
      message: `"${targetProduct.title || "Product"}" removed.`,
      duration: 6000,
      action: {
        label: "↩ Undo",
        onClick: async () => {
          setProducts((prev) => {
            if (prev.some((p) => p.id === productId)) return prev;
            const next = [...prev];
            if (targetIndex >= 0 && targetIndex <= next.length) {
              next.splice(targetIndex, 0, targetProduct);
            } else {
              next.unshift(targetProduct);
            }
            return next;
          });

          try {
            const res = await fetch("/api/products/restore", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: productId }),
            });
            if (res.ok) {
              showToast({
                type: "success",
                title: "Product Restored",
                message: `"${targetProduct.title || "Product"}" restored to catalog.`,
              });
            } else {
              throw new Error("Failed to restore on server");
            }
          } catch (err) {
            console.error("[Restore Error]:", err);
            setProducts((prev) => prev.filter((p) => p.id !== productId));
            showToast({
              type: "error",
              title: "Restore Failed",
              message: "Could not restore product to server.",
            });
          }
        },
      },
    });
  }, [products, selectedProduct?.id, showToast]);

  const handleViewDetails = useCallback(async (product: ScrapedProduct) => {
    const requestId = ++detailRequestIdRef.current;
    setSelectedProduct(product);
    setIsModalOpen(true);

    setRecentlyViewedIds((prev) => {
      const updated = [product.id, ...prev.filter((id) => id !== product.id)].slice(0, 40);
      try {
        sessionStorage.setItem("recently_viewed_products", JSON.stringify(updated));
      } catch {}
      return updated;
    });

    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("id", product.id);
      window.history.replaceState(null, "", url.toString());
    }
    try {
      const res = await fetch(`/api/products?id=${encodeURIComponent(product.id)}&details=true`);
      const json = await res.json();
      const detailedProduct = json.products?.[0];
      if (requestId === detailRequestIdRef.current && res.ok && detailedProduct) {
        setSelectedProduct(detailedProduct);
      }
    } catch {
      // Keep the lean product card available if detail loading fails.
    }
  }, []);

  // Modal sequential navigation
  const currentProductIndex = selectedProduct
    ? products.findIndex((p) => p.id === selectedProduct.id)
    : -1;

  const handleNavigatePrev = useCallback(() => {
    if (currentProductIndex > 0) {
      handleViewDetails(products[currentProductIndex - 1]);
    }
  }, [currentProductIndex, products, handleViewDetails]);

  const handleNavigateNext = useCallback(() => {
    if (currentProductIndex >= 0 && currentProductIndex < products.length - 1) {
      handleViewDetails(products[currentProductIndex + 1]);
    }
  }, [currentProductIndex, products, handleViewDetails]);

  const handleViewCreatives = useCallback((product: ScrapedProduct) => {
    const isUuid = (s?: string | null) => Boolean(s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s));
    const brandTarget = (product.brandPageId && !isUuid(product.brandPageId) && product.brandPageId !== "0")
      ? product.brandPageId
      : (product.domain || (product.brandName && !isUuid(product.brandName) ? product.brandName : null));

    if (brandTarget) {
      router.push(`/spy/brand/${encodeURIComponent(brandTarget)}?tab=creatives`);
    } else {
      router.push(`/spy?productId=${encodeURIComponent(product.id)}`);
    }
  }, [router]);

  const handleFilterBrand = useCallback((brandName: string) => {
    setBrandInput(brandName);
    setDebouncedBrand(brandName);
    setPage(1);
  }, []);

  const handleResetFilters = useCallback(() => {
    setSearchInput("");
    setDebouncedSearch("");
    setBrandInput("");
    setDebouncedBrand("");
    setPlatform("all");
    setSelectedNiches([]);
    setSelectedSubNiches([]);
    setCategoryFilter("all");
    setStatusFilter("all");
    setSmartPreset("all");
    setDiscoveryFilter("all");
    setDiscoveryFrom("");
    setDiscoveryTo("");
    setAdLaunchFilter("all");
    setAdLaunchFrom("");
    setAdLaunchTo("");
    setStillRunningOnly(true);
    setSortBy("latest");
    setHideInactive(false);
    setPage(1);
    setAutoLoadCount(0);
  }, []);

  // KPI bar preset handler — also updates sortBy when a default is provided
  const handleSelectPreset = useCallback((preset: SmartPreset, defaultSort?: string) => {
    setSmartPreset(preset);
    if (defaultSort) setSortBy(defaultSort);
    setPage(1);
  }, []);

  const progressPercent =
    pagination.total > 0 ? Math.min(100, Math.round((products.length / pagination.total) * 100)) : 0;
  const remainingCount = Math.max(0, pagination.total - products.length);
  const hasMore = page < pagination.totalPages;

  // Active secondary filters count
  const activeFilterCount =
    (debouncedBrand.trim() ? 1 : 0) +
    (selectedNiches.length > 0 ? selectedNiches.length : 0) +
    (selectedSubNiches.length > 0 ? selectedSubNiches.length : 0) +
    (categoryFilter !== "all" && selectedNiches.length === 0 ? 1 : 0) +
    (platform !== "all" ? 1 : 0) +
    (statusFilter !== "all" ? 1 : 0) +
    (discoveryFilter !== "all" ? 1 : 0) +
    (adLaunchFilter !== "all" ? 1 : 0) +
    (hideInactive ? 1 : 0) +
    (!stillRunningOnly ? 1 : 0);

  const discoveryLabels: Record<string, string> = {
    today: "Today",
    yesterday: "Yesterday",
    last_3d: "Last 3 Days",
    last_7d: "Last 7 Days",
    last_14d: "Last 14 Days",
    last_30d: "Last 30 Days",
    this_month: "This Month",
    custom: discoveryFrom && discoveryTo ? `${discoveryFrom} to ${discoveryTo}` : "Custom Date",
  };

  const adLaunchLabels: Record<string, string> = {
    "7d": "7+ Days Running",
    "15d": "15+ Days Running",
    "21d": "21+ Days Running",
    "30d": "1 Month+ (Evergreen)",
    custom:
      adLaunchFrom && adLaunchTo
        ? `${adLaunchFrom} to ${adLaunchTo}`
        : adLaunchFrom
        ? `From ${adLaunchFrom}`
        : adLaunchTo
        ? `Up to ${adLaunchTo}`
        : "Custom Launch Range",
  };

  return (
    <div className="flex-1 h-full w-full flex flex-row overflow-hidden bg-background">
      {/* Desktop Docked Second Sidebar */}
      <div className="hidden lg:flex flex-col h-full shrink-0">
        <ProductsSidebarFilters
          selectedNiches={selectedNiches}
          onChangeNiches={(niches) => {
            setSelectedNiches(niches);
            setPage(1);
          }}
          selectedSubNiches={selectedSubNiches}
          onChangeSubNiches={(subs) => {
            setSelectedSubNiches(subs);
            setPage(1);
          }}
          nicheCounts={stats.nicheCounts}
          hideInactive={hideInactive}
          onToggleHideInactive={() => {
            setHideInactive((prev) => !prev);
            setPage(1);
          }}
          smartPreset={smartPreset}
          onSelectPreset={handleSelectPreset}
          adLaunchFilter={adLaunchFilter}
          onChangeAdLaunchFilter={(v) => {
            setAdLaunchFilter(v);
            setPage(1);
          }}
          adLaunchFrom={adLaunchFrom}
          onChangeAdLaunchFrom={(v) => {
            setAdLaunchFrom(v);
            setPage(1);
          }}
          adLaunchTo={adLaunchTo}
          onChangeAdLaunchTo={(v) => {
            setAdLaunchTo(v);
            setPage(1);
          }}
          stillRunningOnly={stillRunningOnly}
          onToggleStillRunningOnly={() => {
            setStillRunningOnly((prev) => !prev);
            setPage(1);
          }}
          adLaunchLabels={adLaunchLabels}
          discoveryFilter={discoveryFilter}
          onChangeDiscoveryFilter={(v) => {
            setDiscoveryFilter(v);
            setPage(1);
          }}
          discoveryFrom={discoveryFrom}
          onChangeDiscoveryFrom={(v) => {
            setDiscoveryFrom(v);
            setPage(1);
          }}
          discoveryTo={discoveryTo}
          onChangeDiscoveryTo={(v) => {
            setDiscoveryTo(v);
            setPage(1);
          }}
          discoveryLabels={discoveryLabels}
          platform={platform}
          onChangePlatform={(v) => {
            setPlatform(v);
            setPage(1);
          }}
          platformCounts={stats.platforms}
          brandInput={brandInput}
          onChangeBrand={(v) => {
            setBrandInput(v);
            setPage(1);
          }}
          onClearBrand={() => {
            setBrandInput("");
            setDebouncedBrand("");
            setPage(1);
          }}
          activeFilterCount={activeFilterCount}
          onResetFilters={handleResetFilters}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={handleToggleSecondSidebar}
        />
      </div>

      {/* Main Content Area (Independent Scrollable Canvas) */}
      <div
        ref={contentScrollRef}
        className="flex-1 min-w-0 h-full overflow-y-auto p-4 md:px-6 md:py-5 flex flex-col space-y-4"
      >
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-border">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-600/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <ShoppingBag className="w-4 h-4" />
              </div>
              <h1 className="text-lg font-black text-foreground tracking-tight">
                Product Intelligence &amp; Catalog Hub
              </h1>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Discover winning products, star favorites, track active brand campaigns, and benchmark competitor pricing.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setIsAddProductModalOpen(true)}
              className="flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white shadow-sm shadow-indigo-600/30 transition-all cursor-pointer"
              title="Add product page link or store website"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Add Product Link</span>
            </button>

            <Link
              href="/spy"
              className="flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground border border-border shadow-xs transition-all cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Ad Spy Feed</span>
            </Link>

            <button
              onClick={() => {
                fetchProducts(1, false, true);
                fetchStats(true);
              }}
              disabled={loading && statsLoading}
              title="Refresh product intelligence catalog"
              className="flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-card hover:bg-accent text-foreground border border-border transition-all cursor-pointer shadow-xs"
            >
              <RotateCw className={`w-3.5 h-3.5 ${(loading || statsLoading) ? "animate-spin text-indigo-500" : ""}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* 1. KPI Bar */}
        <ProductsKpiBar
          stats={stats}
          statsLoading={statsLoading}
          smartPreset={smartPreset}
          onSelectPreset={handleSelectPreset}
        />

        {/* Top Bar (Search, Presets, Active filters, View Mode) */}
        <ProductsTopBar
          searchInput={searchInput}
          onChangeSearch={(v) => {
            setSearchInput(v);
            setPage(1);
          }}
          onClearSearch={() => {
            setSearchInput("");
            setDebouncedSearch("");
            setPage(1);
          }}
          smartPreset={smartPreset}
          onSelectPreset={handleSelectPreset}
          sortBy={sortBy}
          onChangeSortBy={(v) => {
            setSortBy(v);
            setPage(1);
          }}
          viewMode={viewMode}
          onChangeViewMode={setViewMode}
          onOpenMobileDrawer={() => setIsMobileDrawerOpen(true)}
          activeFilterCount={activeFilterCount}
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebar={handleToggleSecondSidebar}
          onOpenAddProduct={() => setIsAddProductModalOpen(true)}
          selectedNiches={selectedNiches}
          onRemoveNiche={(niche) => {
            setSelectedNiches((prev) => prev.filter((x) => x !== niche));
            setPage(1);
          }}
          selectedSubNiches={selectedSubNiches}
          onRemoveSubNiche={(sub) => {
            setSelectedSubNiches((prev) => prev.filter((x) => x !== sub));
            setPage(1);
          }}
          brandInput={debouncedBrand}
          onClearBrand={() => {
            setBrandInput("");
            setDebouncedBrand("");
            setPage(1);
          }}
          platform={platform}
          onChangePlatform={(v) => {
            setPlatform(v);
            setPage(1);
          }}
          hideInactive={hideInactive}
          onToggleHideInactive={() => {
            setHideInactive((prev) => !prev);
            setPage(1);
          }}
          discoveryFilter={discoveryFilter}
          onChangeDiscoveryFilter={(v) => {
            setDiscoveryFilter(v);
            setPage(1);
          }}
          discoveryLabels={discoveryLabels}
          adLaunchFilter={adLaunchFilter}
          onChangeAdLaunchFilter={(v) => {
            setAdLaunchFilter(v);
            setPage(1);
          }}
          adLaunchLabels={adLaunchLabels}
          stillRunningOnly={stillRunningOnly}
          onResetFilters={handleResetFilters}
        />

      {/* 3. Products Display Area */}
      {loading && products.length === 0 ? (
        viewMode === "grid" ? (
          <div
            className={`grid ${
              isSidebarCollapsed
                ? "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
                : "grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            } gap-4`}
          >
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className="aspect-[3/4] bg-card rounded-xl border border-border animate-pulse p-4 flex flex-col justify-between"
              >
                <div className="aspect-square bg-muted rounded-lg" />
                <div className="space-y-2 mt-4">
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-4 p-3.5 bg-card rounded-xl border border-border animate-pulse"
              >
                <div className="w-16 h-16 bg-muted rounded-lg shrink-0" />
                <div className="flex-1 space-y-2 min-w-0">
                  <div className="h-4 bg-muted rounded w-2/3" />
                  <div className="h-3 bg-muted rounded w-1/3" />
                </div>
                <div className="hidden sm:flex items-center gap-3 shrink-0">
                  <div className="h-5 w-16 bg-muted rounded" />
                  <div className="h-8 w-24 bg-muted rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        )
      ) : error ? (
        <div className="py-16 text-center bg-card rounded-xl border border-red-500/20 p-6">
          <p className="text-sm font-semibold text-red-500 mb-3">{error}</p>
          <button
            onClick={() => fetchProducts(1, false)}
            className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 rounded-lg cursor-pointer"
          >
            Retry
          </button>
        </div>
      ) : products.length === 0 ? (
        <ProductsEmptyState
          smartPreset={smartPreset}
          debouncedSearch={debouncedSearch}
          debouncedBrand={debouncedBrand}
          platform={platform}
          categoryFilter={selectedNiches.join(", ") || categoryFilter}
          statusFilter={statusFilter}
          hideInactive={hideInactive}
          discoveryFilter={discoveryFilter}
          onClearSearch={() => { setSearchInput(""); setDebouncedSearch(""); setPage(1); }}
          onClearBrand={() => { setBrandInput(""); setDebouncedBrand(""); setPage(1); }}
          onClearPlatform={() => { setPlatform("all"); setPage(1); }}
          onClearCategory={() => { setSelectedNiches([]); setSelectedSubNiches([]); setCategoryFilter("all"); setPage(1); }}
          onClearStatus={() => { setStatusFilter("all"); setPage(1); }}
          onClearDiscovery={() => { setDiscoveryFilter("all"); setDiscoveryFrom(""); setDiscoveryTo(""); setPage(1); }}
          onClearHideInactive={() => { setHideInactive(false); setPage(1); }}
          onClearPreset={() => { setSmartPreset("all"); setPage(1); }}
          onResetAll={handleResetFilters}
        />
      ) : (
        <>
          {viewMode === "grid" ? (
            <div
              className={`grid ${
                isSidebarCollapsed
                  ? "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
                  : "grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
              } gap-4`}
            >
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onRefresh={handleRefresh}
                  onDelete={handleDelete}
                  onToggleFavorite={handleToggleFavorite}
                  onViewDetails={handleViewDetails}
                  onViewCreatives={handleViewCreatives}
                  onFilterBrand={handleFilterBrand}
                  isRecentlyViewed={recentlyViewedIds.includes(product.id)}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {products.map((product) => (
                <ProductRow
                  key={product.id}
                  product={product}
                  onRefresh={handleRefresh}
                  onDelete={handleDelete}
                  onToggleFavorite={handleToggleFavorite}
                  onViewDetails={handleViewDetails}
                  onViewCreatives={handleViewCreatives}
                  onFilterBrand={handleFilterBrand}
                  isRecentlyViewed={recentlyViewedIds.includes(product.id)}
                />
              ))}
            </div>
          )}

          {/* Sentinel element for infinite scroll auto-trigger */}
          <div ref={sentinelRef} className="h-6 w-full" />

          {/* Skeletons while fetching more items */}
          {isFetchingMore && (
            viewMode === "grid" ? (
              <div
                className={`grid ${
                  isSidebarCollapsed
                    ? "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
                    : "grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                } gap-4 pt-2`}
              >
                {[...Array(4)].map((_, i) => (
                  <div
                    key={`skeleton-${i}`}
                    className="aspect-[3/4] bg-white dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-800 animate-pulse p-4 flex flex-col justify-between"
                  >
                    <div className="aspect-square bg-slate-200 dark:bg-slate-800 rounded-lg" />
                    <div className="space-y-2 mt-4">
                      <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-3/4" />
                      <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-2.5 pt-2">
                {[...Array(3)].map((_, i) => (
                  <div
                    key={`skeleton-${i}`}
                    className="flex items-center gap-4 p-3.5 bg-white dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-800 animate-pulse"
                  >
                    <div className="w-16 h-16 bg-slate-200 dark:bg-slate-800 rounded-lg shrink-0" />
                    <div className="flex-1 space-y-2 min-w-0">
                      <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-2/3" />
                      <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-1/3" />
                    </div>
                    <div className="hidden sm:flex items-center gap-3 shrink-0">
                      <div className="h-5 w-16 bg-slate-200 dark:bg-slate-800 rounded" />
                      <div className="h-8 w-24 bg-slate-200 dark:bg-slate-800 rounded-lg" />
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* Bottom Discovery Bar with Visual Progress & Hybrid Load More */}
          <div className="flex flex-col items-center justify-center pt-8 pb-8 space-y-3">
            <div className="w-full max-w-xs flex flex-col items-center space-y-1.5">
              <div className="flex items-center justify-between w-full text-xs font-semibold text-slate-500 dark:text-slate-400">
                <span>
                  Showing{" "}
                  <strong className="text-slate-900 dark:text-white font-bold">{products.length}</strong>{" "}
                  of{" "}
                  <strong className="text-slate-900 dark:text-white font-bold">{pagination.total}</strong>{" "}
                  products
                </span>
                <span className="font-bold text-indigo-600 dark:text-indigo-400">{progressPercent}%</span>
              </div>
              <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {hasMore ? (
              <button
                onClick={handleManualLoadMore}
                disabled={isFetchingMore}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800 font-bold text-xs shadow-sm hover:shadow-md transition-all cursor-pointer disabled:opacity-50"
              >
                {isFetchingMore ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                    <span>Loading next products...</span>
                  </>
                ) : (
                  <>
                    <span>Load More Products ({Math.min(24, remainingCount)} more)</span>
                    <span className="text-[10px] text-slate-400 font-normal">({remainingCount} remaining)</span>
                  </>
                )}
              </button>
            ) : products.length > 0 ? (
              <div className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span>You&apos;ve viewed all {pagination.total} products</span>
              </div>
            ) : null}
          </div>
        </>
      )}
      </div>

      {/* Mobile Slide-Over Filter Drawer */}
      <MobileFilterDrawer
        isOpen={isMobileDrawerOpen}
        onClose={() => setIsMobileDrawerOpen(false)}
        selectedNiches={selectedNiches}
        onChangeNiches={(niches) => {
          setSelectedNiches(niches);
          setPage(1);
        }}
        selectedSubNiches={selectedSubNiches}
        onChangeSubNiches={(subs) => {
          setSelectedSubNiches(subs);
          setPage(1);
        }}
        nicheCounts={stats.nicheCounts}
        hideInactive={hideInactive}
        onToggleHideInactive={() => {
          setHideInactive((prev) => !prev);
          setPage(1);
        }}
        smartPreset={smartPreset}
        onSelectPreset={handleSelectPreset}
        adLaunchFilter={adLaunchFilter}
        onChangeAdLaunchFilter={(v) => {
          setAdLaunchFilter(v);
          setPage(1);
        }}
        adLaunchFrom={adLaunchFrom}
        onChangeAdLaunchFrom={(v) => {
          setAdLaunchFrom(v);
          setPage(1);
        }}
        adLaunchTo={adLaunchTo}
        onChangeAdLaunchTo={(v) => {
          setAdLaunchTo(v);
          setPage(1);
        }}
        stillRunningOnly={stillRunningOnly}
        onToggleStillRunningOnly={() => {
          setStillRunningOnly((prev) => !prev);
          setPage(1);
        }}
        adLaunchLabels={adLaunchLabels}
        discoveryFilter={discoveryFilter}
        onChangeDiscoveryFilter={(v) => {
          setDiscoveryFilter(v);
          setPage(1);
        }}
        discoveryFrom={discoveryFrom}
        onChangeDiscoveryFrom={(v) => {
          setDiscoveryFrom(v);
          setPage(1);
        }}
        discoveryTo={discoveryTo}
        onChangeDiscoveryTo={(v) => {
          setDiscoveryTo(v);
          setPage(1);
        }}
        discoveryLabels={discoveryLabels}
        platform={platform}
        onChangePlatform={(v) => {
          setPlatform(v);
          setPage(1);
        }}
        platformCounts={stats.platforms}
        brandInput={brandInput}
        onChangeBrand={(v) => {
          setBrandInput(v);
          setPage(1);
        }}
        onClearBrand={() => {
          setBrandInput("");
          setDebouncedBrand("");
          setPage(1);
        }}
        activeFilterCount={activeFilterCount}
        onResetFilters={handleResetFilters}
      />

      {/* Floating Back to Top Button */}
      {showBackToTop && (
        <button
          onClick={scrollToTop}
          aria-label="Scroll Back to Top"
          className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))] right-6 z-40 p-3 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg hover:shadow-indigo-500/30 transition-all duration-200 animate-in fade-in zoom-in cursor-pointer"
          title="Scroll Back to Top"
        >
          <ArrowUp className="w-4 h-4" />
        </button>
      )}

      {/* Details & Competitor Benchmark Modal */}
      <ProductDetailsModal
        isOpen={isModalOpen}
        onClose={handleCloseDetailsModal}
        product={selectedProduct}
        onRefresh={handleRefresh}
        onDelete={handleDelete}
        onProductUpdate={handleProductUpdate}
        currentIndex={currentProductIndex}
        totalCount={products.length}
        hasPrev={currentProductIndex > 0}
        hasNext={currentProductIndex >= 0 && currentProductIndex < products.length - 1}
        onNavigatePrev={handleNavigatePrev}
        onNavigateNext={handleNavigateNext}
      />

      {/* Direct Add Product Link Modal */}
      <AddProductModal
        isOpen={isAddProductModalOpen}
        onClose={() => setIsAddProductModalOpen(false)}
        onSuccess={() => {
          fetchProducts(1, false);
          fetchStats(true);
        }}
      />
    </div>
  );
}
