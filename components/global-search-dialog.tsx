"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Search,
  Building2,
  ShoppingBag,
  Eye,
  Flame,
  LayoutDashboard,
  ExternalLink,
  Loader2,
  Calendar,
  Sparkles,
  ArrowUpDown,
  CornerDownLeft,
  ArrowRight,
  Command as CommandKey,
} from "lucide-react";
import type { GlobalSearchResult } from "@/app/api/search/global/route";

interface GlobalSearchContextType {
  isOpen: boolean;
  openSearch: () => void;
  closeSearch: () => void;
  toggleSearch: () => void;
}

const GlobalSearchContext = createContext<GlobalSearchContextType>({
  isOpen: false,
  openSearch: () => {},
  closeSearch: () => {},
  toggleSearch: () => {},
});

export function useGlobalSearch() {
  return useContext(GlobalSearchContext);
}

export function GlobalSearchProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const openSearch = useCallback(() => setIsOpen(true), []);
  const closeSearch = useCallback(() => setIsOpen(false), []);
  const toggleSearch = useCallback(() => setIsOpen((prev) => !prev), []);

  // Global keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggleSearch();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSearch]);

  return (
    <GlobalSearchContext.Provider
      value={{ isOpen, openSearch, closeSearch, toggleSearch }}
    >
      {children}
      <GlobalSearchDialog open={isOpen} onOpenChange={setIsOpen} />
    </GlobalSearchContext.Provider>
  );
}

export function GlobalSearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<GlobalSearchResult>({
    brands: [],
    products: [],
    ads: [],
  });

  // Debounced query fetching
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults({ brands: [], products: [], ads: [] });
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/global?q=${encodeURIComponent(trimmed)}`);
        if (res.ok) {
          const data: GlobalSearchResult = await res.json();
          setResults(data);
        }
      } catch (err) {
        console.error("[Global Search] Fetch error:", err);
      } finally {
        setLoading(false);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [query]);

  // Reset state on close
  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults({ brands: [], products: [], ads: [] });
      setLoading(false);
    }
  }, [open]);

  const handleNavigate = useCallback(
    (url: string) => {
      onOpenChange(false);
      router.push(url);
    },
    [router, onOpenChange]
  );

  const hasResults =
    results.brands.length > 0 ||
    results.products.length > 0 ||
    results.ads.length > 0;

  const isQueryTooShort = query.trim().length < 2;

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Global Search"
      description="Search brands, products, and ads..."
      className="max-w-2xl bg-white dark:bg-[#0b0f17] border border-slate-200 dark:border-slate-800/80 rounded-2xl shadow-2xl overflow-hidden p-0"
    >
      <Command
        shouldFilter={false}
        className="bg-transparent text-slate-900 dark:text-slate-100"
      >
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3 border-b border-slate-200 dark:border-slate-800/80 gap-3">
          {loading ? (
            <Loader2 className="w-5 h-5 text-indigo-500 animate-spin shrink-0" />
          ) : (
            <Search className="w-5 h-5 text-slate-400 dark:text-slate-500 shrink-0" />
          )}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search brands, products, ad archive IDs..."
            className="flex-1 bg-transparent text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 outline-none border-none focus:outline-none focus:ring-0"
            autoFocus
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 cursor-pointer"
            >
              Clear
            </button>
          )}
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700/60 select-none">
            ESC
          </span>
        </div>

        {/* Results Container */}
        <CommandList className="max-h-[60vh] overflow-y-auto p-2 no-scrollbar">
          {/* Quick Shortcuts when search box is empty or < 2 characters */}
          {isQueryTooShort && (
            <CommandGroup heading="Quick Navigation">
              <CommandItem
                onSelect={() => handleNavigate("/")}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium cursor-pointer text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
              >
                <div className="w-7 h-7 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                  <LayoutDashboard className="w-3.5 h-3.5" />
                </div>
                <span className="flex-1">Dashboard</span>
                <span className="text-[10px] text-slate-400 font-mono">Overview</span>
              </CommandItem>

              <CommandItem
                onSelect={() => handleNavigate("/products")}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium cursor-pointer text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
              >
                <div className="w-7 h-7 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <ShoppingBag className="w-3.5 h-3.5" />
                </div>
                <span className="flex-1">Products Catalog</span>
                <span className="text-[10px] text-slate-400 font-mono">Catalog</span>
              </CommandItem>

              <CommandItem
                onSelect={() => handleNavigate("/spy")}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium cursor-pointer text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
              >
                <div className="w-7 h-7 rounded-md bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                  <Eye className="w-3.5 h-3.5" />
                </div>
                <span className="flex-1">Ad Feed</span>
                <span className="text-[10px] text-slate-400 font-mono">Live Intel</span>
              </CommandItem>

              <CommandItem
                onSelect={() => handleNavigate("/fresh-winners")}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium cursor-pointer text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
              >
                <div className="w-7 h-7 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <Flame className="w-3.5 h-3.5" />
                </div>
                <span className="flex-1">Fresh Winners</span>
                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-mono font-semibold">HOT</span>
              </CommandItem>

              <CommandItem
                onSelect={() => handleNavigate("/brands")}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium cursor-pointer text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
              >
                <div className="w-7 h-7 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                  <Building2 className="w-3.5 h-3.5" />
                </div>
                <span className="flex-1">Tracked Brands</span>
                <span className="text-[10px] text-slate-400 font-mono">Brands</span>
              </CommandItem>
            </CommandGroup>
          )}

          {/* Empty state when query produces no results */}
          {!loading && !isQueryTooShort && !hasResults && (
            <div className="py-12 text-center text-xs text-slate-400 dark:text-slate-500">
              No matching brands, products, or ads found for &quot;<span className="text-slate-700 dark:text-slate-300 font-semibold">{query}</span>&quot;
            </div>
          )}

          {/* Category 1: BRANDS */}
          {!isQueryTooShort && results.brands.length > 0 && (
            <CommandGroup
              heading={
                <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-2 py-1">
                  <span>Brands</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">
                    {results.brands.length}
                  </span>
                </div>
              }
            >
              {results.brands.map((brand) => {
                const target = brand.pageId || brand.id;
                return (
                  <CommandItem
                    key={brand.id}
                    onSelect={() => handleNavigate(`/spy/brand/${encodeURIComponent(target)}`)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs cursor-pointer hover:bg-indigo-50/70 dark:hover:bg-indigo-500/10 group transition-colors"
                  >
                    {/* Brand Avatar */}
                    <div className="w-8 h-8 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 flex items-center justify-center shrink-0">
                      {brand.profilePicUrl ? (
                        <img
                          src={brand.profilePicUrl}
                          alt={brand.displayName || "Brand"}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <Building2 className="w-4 h-4 text-slate-400" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 dark:text-slate-100 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {brand.displayName || "Unnamed Brand"}
                        </span>
                        {brand.status && (
                          <span className="text-[9px] font-mono px-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                            {brand.status}
                          </span>
                        )}
                      </div>
                      {brand.canonicalDomain && (
                        <span className="text-[11px] text-slate-400 dark:text-slate-500 truncate block">
                          {brand.canonicalDomain}
                        </span>
                      )}
                    </div>

                    {/* Active Ads Pill */}
                    <div className="shrink-0 text-right">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                        {brand.currentResults ?? 0} ads
                      </span>
                    </div>
                  </CommandItem>
                );
              })}

              {/* View all Brands link */}
              <CommandItem
                onSelect={() => handleNavigate(`/brands?search=${encodeURIComponent(query.trim())}`)}
                className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50/70 dark:hover:bg-indigo-500/10 cursor-pointer transition-colors border-t border-slate-100 dark:border-slate-800/60 mt-1"
              >
                <span>View all brand results for &quot;{query}&quot;</span>
                <ArrowRight className="w-3.5 h-3.5 shrink-0" />
              </CommandItem>
            </CommandGroup>
          )}

          {/* Category 2: PRODUCTS */}
          {!isQueryTooShort && results.products.length > 0 && (
            <>
              <CommandSeparator className="my-1 border-slate-200 dark:border-slate-800/60" />
              <CommandGroup
                heading={
                  <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-2 py-1">
                    <span>Products</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">
                      {results.products.length}
                    </span>
                  </div>
                }
              >
                {results.products.map((product) => {
                  return (
                    <CommandItem
                      key={product.id}
                      onSelect={() => handleNavigate(`/products?productId=${encodeURIComponent(product.id)}`)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs cursor-pointer hover:bg-emerald-50/70 dark:hover:bg-emerald-500/10 group transition-colors"
                    >
                      {/* Product Thumbnail */}
                      <div className="w-8 h-8 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 flex items-center justify-center shrink-0">
                        {product.mainImageUrl ? (
                          <img
                            src={product.mainImageUrl}
                            alt={product.title || "Product"}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <ShoppingBag className="w-4 h-4 text-slate-400" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <span className="font-semibold text-slate-900 dark:text-slate-100 truncate block group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                          {product.title || "Untitled Product"}
                        </span>
                        {product.domain && (
                          <span className="text-[11px] text-slate-400 dark:text-slate-500 truncate block">
                            {product.domain}
                          </span>
                        )}
                      </div>

                      {/* Price Pill */}
                      {product.currentPrice && (
                        <div className="shrink-0 text-right">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            {product.currentPrice} {product.currency || "DT"}
                          </span>
                        </div>
                      )}
                    </CommandItem>
                  );
                })}

                {/* View all Products link */}
                <CommandItem
                  onSelect={() => handleNavigate(`/products?search=${encodeURIComponent(query.trim())}`)}
                  className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50/70 dark:hover:bg-emerald-500/10 cursor-pointer transition-colors border-t border-slate-100 dark:border-slate-800/60 mt-1"
                >
                  <span>View all product results for &quot;{query}&quot;</span>
                  <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                </CommandItem>
              </CommandGroup>
            </>
          )}

          {/* Category 3: ADS */}
          {!isQueryTooShort && results.ads.length > 0 && (
            <>
              <CommandSeparator className="my-1 border-slate-200 dark:border-slate-800/60" />
              <CommandGroup
                heading={
                  <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-2 py-1">
                    <span>Meta Ads</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">
                      {results.ads.length}
                    </span>
                  </div>
                }
              >
                {results.ads.map((ad) => {
                  return (
                    <CommandItem
                      key={ad.id}
                      onSelect={() => handleNavigate(`/spy?search=${encodeURIComponent(ad.adArchiveId)}`)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs cursor-pointer hover:bg-sky-50/70 dark:hover:bg-sky-500/10 group transition-colors"
                    >
                      {/* Ad Thumbnail */}
                      <div className="w-8 h-8 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 flex items-center justify-center shrink-0">
                        {ad.thumbnailUrl ? (
                          <img
                            src={ad.thumbnailUrl}
                            alt="Ad Creative"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <Eye className="w-4 h-4 text-slate-400" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900 dark:text-slate-100 truncate group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                            {ad.pageName || "Ad"}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                            #{ad.adArchiveId}
                          </span>
                        </div>
                        {ad.captionSnippet ? (
                          <span className="text-[11px] text-slate-400 dark:text-slate-500 truncate block">
                            {ad.captionSnippet}
                          </span>
                        ) : null}
                      </div>

                      {/* Started Running Date */}
                      {ad.startedRunningOn && (
                        <div className="shrink-0 text-right hidden sm:block">
                          <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 flex items-center gap-1">
                            <Calendar className="w-3 h-3 inline" />
                            {new Date(ad.startedRunningOn).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                            })}
                          </span>
                        </div>
                      )}
                    </CommandItem>
                  );
                })}

                {/* View all Ads link */}
                <CommandItem
                  onSelect={() => handleNavigate(`/spy?search=${encodeURIComponent(query.trim())}`)}
                  className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-sky-600 dark:text-sky-400 hover:bg-sky-50/70 dark:hover:bg-sky-500/10 cursor-pointer transition-colors border-t border-slate-100 dark:border-slate-800/60 mt-1"
                >
                  <span>View all ad results for &quot;{query}&quot;</span>
                  <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                </CommandItem>
              </CommandGroup>
            </>
          )}
        </CommandList>

        {/* Footer Navigation Hints */}
        <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-800/80 bg-slate-50/50 dark:bg-[#080c13] flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <kbd className="inline-flex items-center justify-center p-1 rounded bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                <ArrowUpDown className="w-2.5 h-2.5" />
              </kbd>
              <span>navigate</span>
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="inline-flex items-center justify-center p-1 rounded bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                <CornerDownLeft className="w-2.5 h-2.5" />
              </kbd>
              <span>select</span>
            </span>
          </div>
          <span className="text-[10px] font-mono">Global Search</span>
        </div>
      </Command>
    </CommandDialog>
  );
}

