"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { SmartPreset } from "../types";
import { parseNicheParam, parseSubNicheParam } from "@/lib/niches-taxonomy";

export function useProductFilters(onFilterChange?: () => void) {
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
  const [stillRunningOnly, setStillRunningOnly] = useState(false);
  const [groupCarousels, setGroupCarousels] = useState(true);
  const [sortBy, setSortBy] = useState<string>("latest");
  const [smartPreset, setSmartPreset] = useState<SmartPreset>("all");

  // Debounce search input (350ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Debounce brand input (350ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedBrand(brandInput);
    }, 350);
    return () => clearTimeout(timer);
  }, [brandInput]);

  // Read URL query params on mount
  useEffect(() => {
    if (typeof window === "undefined") return;

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
    if (
      presetParam &&
      ["all", "breakout", "most_scaled", "new_discovered", "top_lasting", "with_offers", "favorites"].includes(
        presetParam
      )
    ) {
      setSmartPreset(presetParam as SmartPreset);
    }
    const platformParam = params.get("platform");
    if (platformParam) setPlatform(platformParam);
    const categoryParam = params.get("category");
    if (categoryParam) setCategoryFilter(categoryParam);
    const nicheParam = params.get("niche") || categoryParam;
    if (nicheParam && nicheParam !== "all") {
      setSelectedNiches(parseNicheParam(nicheParam));
    }
    const subNicheParam = params.get("subNiche") || params.get("subCategory");
    if (subNicheParam && subNicheParam !== "all") {
      setSelectedSubNiches(parseSubNicheParam(subNicheParam));
    }
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
    else if (adLaunchParam && adLaunchParam !== "all") setStillRunningOnly(true);
    const groupCarouselsParam = params.get("groupCarousels");
    if (groupCarouselsParam !== null) setGroupCarousels(groupCarouselsParam === "true");
  }, []);

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
    if (stillRunningOnly) {
      newParams.set("stillRunning", "true");
    }
    if (!groupCarousels) {
      newParams.set("groupCarousels", "false");
    }

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
    groupCarousels,
  ]);

  const handleFilterBrand = useCallback(
    (brandName: string) => {
      setBrandInput(brandName);
      setDebouncedBrand(brandName);
      onFilterChange?.();
    },
    [onFilterChange]
  );

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
    setStillRunningOnly(false);
    setHideInactive(false);
    onFilterChange?.();
  }, [onFilterChange]);

  const handleSelectPreset = useCallback(
    (preset: SmartPreset) => {
      setSmartPreset(preset);
      onFilterChange?.();
    },
    [onFilterChange]
  );

  const activeFilterCount = useMemo(() => {
    return (
      (debouncedBrand.trim() ? 1 : 0) +
      (selectedNiches.length > 0 ? selectedNiches.length : 0) +
      (selectedSubNiches.length > 0 ? selectedSubNiches.length : 0) +
      (categoryFilter !== "all" && selectedNiches.length === 0 ? 1 : 0) +
      (platform !== "all" ? 1 : 0) +
      (statusFilter !== "all" ? 1 : 0) +
      (discoveryFilter !== "all" ? 1 : 0) +
      (adLaunchFilter !== "all" ? 1 : 0) +
      (hideInactive ? 1 : 0) +
      (stillRunningOnly ? 1 : 0)
    );
  }, [
    debouncedBrand,
    selectedNiches,
    selectedSubNiches,
    categoryFilter,
    platform,
    statusFilter,
    discoveryFilter,
    adLaunchFilter,
    hideInactive,
    stillRunningOnly,
  ]);

  const discoveryLabels: Record<string, string> = useMemo(
    () => ({
      today: "Today",
      yesterday: "Yesterday",
      last_3d: "Last 3 Days",
      last_7d: "Last 7 Days",
      last_14d: "Last 14 Days",
      last_30d: "Last 30 Days",
      this_month: "This Month",
      custom: discoveryFrom && discoveryTo ? `${discoveryFrom} to ${discoveryTo}` : "Custom Date",
    }),
    [discoveryFrom, discoveryTo]
  );

  const adLaunchLabels: Record<string, string> = useMemo(
    () => ({
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
    }),
    [adLaunchFrom, adLaunchTo]
  );

  return useMemo(
    () => ({
      searchInput,
      setSearchInput,
      debouncedSearch,
      setDebouncedSearch,
      brandInput,
      setBrandInput,
      debouncedBrand,
      setDebouncedBrand,
      platform,
      setPlatform,
      categoryFilter,
      setCategoryFilter,
      selectedNiches,
      setSelectedNiches,
      selectedSubNiches,
      setSelectedSubNiches,
      statusFilter,
      setStatusFilter,
      hideInactive,
      setHideInactive,
      discoveryFilter,
      setDiscoveryFilter,
      discoveryFrom,
      setDiscoveryFrom,
      discoveryTo,
      setDiscoveryTo,
      adLaunchFilter,
      setAdLaunchFilter,
      adLaunchFrom,
      setAdLaunchFrom,
      adLaunchTo,
      setAdLaunchTo,
      stillRunningOnly,
      setStillRunningOnly,
      groupCarousels,
      setGroupCarousels,
      sortBy,
      setSortBy,
      smartPreset,
      setSmartPreset,
      activeFilterCount,
      discoveryLabels,
      adLaunchLabels,
      handleFilterBrand,
      handleResetFilters,
      handleSelectPreset,
    }),
    [
      searchInput,
      debouncedSearch,
      brandInput,
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
      groupCarousels,
      sortBy,
      smartPreset,
      activeFilterCount,
      discoveryLabels,
      adLaunchLabels,
      handleFilterBrand,
      handleResetFilters,
      handleSelectPreset,
    ]
  );
}

