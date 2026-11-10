"use client";

import { useCallback, Suspense } from "react";
import { useRouter } from "next/navigation";
import { ScrapedProduct } from "@/types";
import { ProductRow } from "@/components/products/product-row";
import { ProductDetailsModal } from "@/components/products/product-details-modal";
import { AddProductModal } from "@/components/products/add-product-modal";
import { ProductsSidebarFilters } from "@/components/products/products-sidebar-filters";
import { ProductsTopBar } from "@/components/products/products-top-bar";
import { MobileFilterDrawer } from "@/components/products/mobile-filter-drawer";
import { ProductsEmptyState } from "@/components/products/products-empty-state";
import { useAuth } from "@/components/auth-context";
import { getNicheByDbCategory, getNicheDisplayLabel } from "@/lib/niches-taxonomy";
import { ArrowUp } from "lucide-react";
import {
  useProductFilters,
  useProductsData,
  useProductDetailsModal,
  useProductsLayout,
  ProductCard,
  ProductsHeader,
  ProductsResultsBar,
  ProductsGridSkeleton,
  ProductsLoadMore,
} from "@/features/products";

function ProductsPageContent() {
  const router = useRouter();
  const { isStaff } = useAuth();

  const filters = useProductFilters();
  const data = useProductsData(filters);
  const modal = useProductDetailsModal({ products: data.products });
  const layout = useProductsLayout({
    loading: data.loading,
    isFetchingMore: data.isFetchingMore,
    page: data.page,
    totalPages: data.pagination.totalPages,
    autoLoadCount: data.autoLoadCount,
    loadNextPage: data.loadNextPage,
  });

  const handleViewCreatives = useCallback(
    (product: ScrapedProduct) => {
      const isUuid = (s?: string | null) =>
        Boolean(s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s));
      const brandTarget =
        product.brandPageId && !isUuid(product.brandPageId) && product.brandPageId !== "0"
          ? product.brandPageId
          : product.domain || (product.brandName && !isUuid(product.brandName) ? product.brandName : null);

      if (brandTarget) {
        router.push(`/spy/brand/${encodeURIComponent(brandTarget)}?tab=creatives`);
      } else {
        router.push(`/spy?productId=${encodeURIComponent(product.id)}`);
      }
    },
    [router]
  );

  return (
    <div className="flex-1 h-full w-full flex flex-row overflow-hidden bg-background">
      {/* Desktop Docked Second Sidebar */}
      <div className="hidden lg:flex flex-col h-full shrink-0">
        <ProductsSidebarFilters
          selectedNiches={filters.selectedNiches}
          onChangeNiches={(niches) => { filters.setSelectedNiches(niches); data.setPage(1); }}
          selectedSubNiches={filters.selectedSubNiches}
          onChangeSubNiches={(subs) => { filters.setSelectedSubNiches(subs); data.setPage(1); }}
          nicheCounts={data.stats.nicheCounts}
          hideInactive={filters.hideInactive}
          onToggleHideInactive={() => { filters.setHideInactive((prev) => !prev); data.setPage(1); }}
          smartPreset={filters.smartPreset}
          onSelectPreset={(preset) => { filters.handleSelectPreset(preset); data.setPage(1); }}
          adLaunchFilter={filters.adLaunchFilter}
          onChangeAdLaunchFilter={(v) => {
            filters.setAdLaunchFilter(v);
            if (v === "all") { filters.setAdLaunchFrom(""); filters.setAdLaunchTo(""); }
            else { filters.setStillRunningOnly(true); }
            data.setPage(1);
          }}
          adLaunchFrom={filters.adLaunchFrom}
          onChangeAdLaunchFrom={(v) => { filters.setAdLaunchFrom(v); data.setPage(1); }}
          adLaunchTo={filters.adLaunchTo}
          onChangeAdLaunchTo={(v) => { filters.setAdLaunchTo(v); data.setPage(1); }}
          stillRunningOnly={filters.stillRunningOnly}
          onToggleStillRunningOnly={() => { filters.setStillRunningOnly((prev) => !prev); data.setPage(1); }}
          adLaunchLabels={filters.adLaunchLabels}
          discoveryFilter={filters.discoveryFilter}
          onChangeDiscoveryFilter={(v) => {
            filters.setDiscoveryFilter(v);
            if (v === "all") { filters.setDiscoveryFrom(""); filters.setDiscoveryTo(""); }
            data.setPage(1);
          }}
          discoveryFrom={filters.discoveryFrom}
          onChangeDiscoveryFrom={(v) => { filters.setDiscoveryFrom(v); data.setPage(1); }}
          discoveryTo={filters.discoveryTo}
          onChangeDiscoveryTo={(v) => { filters.setDiscoveryTo(v); data.setPage(1); }}
          discoveryLabels={filters.discoveryLabels}
          platform={filters.platform}
          onChangePlatform={(v) => { filters.setPlatform(v); data.setPage(1); }}
          platformCounts={data.stats.platforms}
          brandInput={filters.brandInput}
          onChangeBrand={(v) => { filters.setBrandInput(v); data.setPage(1); }}
          onClearBrand={() => { filters.setBrandInput(""); filters.setDebouncedBrand(""); data.setPage(1); }}
          activeFilterCount={filters.activeFilterCount}
          onResetFilters={() => { filters.handleResetFilters(); data.setPage(1); data.setAutoLoadCount(0); }}
          isCollapsed={layout.isSidebarCollapsed}
          onToggleCollapse={layout.handleToggleSecondSidebar}
        />
      </div>

      {/* Main Content Area */}
      <div
        ref={layout.contentScrollRef}
        className="flex-1 min-w-0 h-full overflow-y-auto p-4 md:px-6 md:py-5 flex flex-col space-y-4"
      >
        <ProductsHeader
          loading={data.loading}
          statsLoading={data.statsLoading}
          isCatalogRefreshing={data.isCatalogRefreshing}
          onRefreshCatalog={data.handleRefreshCatalog}
          onOpenAddProductModal={() => layout.setIsAddProductModalOpen(true)}
        />

        <ProductsTopBar
          searchInput={filters.searchInput}
          onChangeSearch={(v) => { filters.setSearchInput(v); data.setPage(1); }}
          onClearSearch={() => { filters.setSearchInput(""); filters.setDebouncedSearch(""); data.setPage(1); }}
          smartPreset={filters.smartPreset}
          onSelectPreset={(preset) => { filters.handleSelectPreset(preset); data.setPage(1); }}
          presetCounts={{
            all: data.stats.totalProducts,
            favorites: data.stats.favoritesCount,
            new_discovered: data.stats.newThisWeekCount,
            top_lasting: data.stats.evergreenCount,
            with_offers: data.stats.withOffersCount,
          }}
          sortBy={filters.sortBy}
          onChangeSortBy={(v) => { filters.setSortBy(v); data.setPage(1); }}
          viewMode={layout.viewMode}
          onChangeViewMode={layout.setViewMode}
          groupCarousels={filters.groupCarousels}
          onToggleGroupCarousels={() => { filters.setGroupCarousels((prev) => !prev); data.setPage(1); }}
          groupedCarouselsCount={data.groupedCarouselsCount}
          onOpenMobileDrawer={() => layout.setIsMobileDrawerOpen(true)}
          activeFilterCount={filters.activeFilterCount}
          isSidebarCollapsed={layout.isSidebarCollapsed}
          onToggleSidebar={layout.handleToggleSecondSidebar}
          selectedNiches={filters.selectedNiches}
          onRemoveNiche={(niche) => {
            const def = getNicheByDbCategory(niche);
            filters.setSelectedNiches((prev) =>
              prev.filter((x) => x !== niche && (def ? x !== def.id && x !== def.dbCategory : true))
            );
            data.setPage(1);
          }}
          selectedSubNiches={filters.selectedSubNiches}
          onRemoveSubNiche={(sub) => {
            filters.setSelectedSubNiches((prev) => prev.filter((x) => x !== sub));
            data.setPage(1);
          }}
          brandInput={filters.debouncedBrand}
          onClearBrand={() => { filters.setBrandInput(""); filters.setDebouncedBrand(""); data.setPage(1); }}
          platform={filters.platform}
          onChangePlatform={(v) => { filters.setPlatform(v); data.setPage(1); }}
          hideInactive={filters.hideInactive}
          onToggleHideInactive={() => { filters.setHideInactive((prev) => !prev); data.setPage(1); }}
          discoveryFilter={filters.discoveryFilter}
          onChangeDiscoveryFilter={(v) => {
            filters.setDiscoveryFilter(v);
            if (v === "all") { filters.setDiscoveryFrom(""); filters.setDiscoveryTo(""); }
            data.setPage(1);
          }}
          discoveryLabels={filters.discoveryLabels}
          adLaunchFilter={filters.adLaunchFilter}
          onChangeAdLaunchFilter={(v) => {
            filters.setAdLaunchFilter(v);
            if (v === "all") { filters.setAdLaunchFrom(""); filters.setAdLaunchTo(""); }
            else { filters.setStillRunningOnly(true); }
            data.setPage(1);
          }}
          adLaunchLabels={filters.adLaunchLabels}
          stillRunningOnly={filters.stillRunningOnly}
          onResetFilters={() => { filters.handleResetFilters(); data.setPage(1); data.setAutoLoadCount(0); }}
        />

        <ProductsResultsBar
          loading={data.loading}
          productsCount={data.totalItemsRepresented}
          totalCount={data.pagination.total}
          isFetchingMore={data.isFetchingMore}
          sortBy={filters.sortBy}
        />

        {data.loading && data.products.length === 0 ? (
          <ProductsGridSkeleton viewMode={layout.viewMode} />
        ) : data.error ? (
          <div className="py-16 text-center bg-card rounded-xl border border-red-500/20 p-6">
            <p className="text-sm font-semibold text-red-500 mb-3">{data.error}</p>
            <button
              onClick={() => data.fetchProducts(1, false)}
              className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 rounded-lg cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : data.products.length === 0 ? (
          <ProductsEmptyState
            smartPreset={filters.smartPreset}
            debouncedSearch={filters.debouncedSearch}
            debouncedBrand={filters.debouncedBrand}
            platform={filters.platform}
            categoryFilter={filters.selectedNiches.map(getNicheDisplayLabel).join(", ") || filters.categoryFilter}
            statusFilter={filters.statusFilter}
            hideInactive={filters.hideInactive}
            discoveryFilter={filters.discoveryFilter}
            onClearSearch={() => { filters.setSearchInput(""); filters.setDebouncedSearch(""); data.setPage(1); }}
            onClearBrand={() => { filters.setBrandInput(""); filters.setDebouncedBrand(""); data.setPage(1); }}
            onClearPlatform={() => { filters.setPlatform("all"); data.setPage(1); }}
            onClearCategory={() => { filters.setSelectedNiches([]); filters.setSelectedSubNiches([]); filters.setCategoryFilter("all"); data.setPage(1); }}
            onClearStatus={() => { filters.setStatusFilter("all"); data.setPage(1); }}
            onClearDiscovery={() => { filters.setDiscoveryFilter("all"); filters.setDiscoveryFrom(""); filters.setDiscoveryTo(""); data.setPage(1); }}
            onClearHideInactive={() => { filters.setHideInactive(false); data.setPage(1); }}
            onClearPreset={() => { filters.setSmartPreset("all"); data.setPage(1); }}
            onResetAll={() => { filters.handleResetFilters(); data.setPage(1); data.setAutoLoadCount(0); }}
          />
        ) : (
          <>
            {layout.viewMode === "grid" ? (
              <div className="products-cards-grid">
                {data.products.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onRefresh={data.handleRefresh}
                    onDelete={data.handleDelete}
                    onToggleFavorite={data.handleToggleFavorite}
                    onViewDetails={modal.handleViewDetails}
                    onViewCreatives={handleViewCreatives}
                    onFilterBrand={(brand) => { filters.handleFilterBrand(brand); data.setPage(1); }}
                    isRecentlyViewed={modal.recentlyViewedIds.includes(product.id)}
                    isRefreshing={data.refreshingProductIds.has(product.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {data.products.map((product) => (
                  <ProductRow
                    key={product.id}
                    product={product}
                    onRefresh={data.handleRefresh}
                    onDelete={data.handleDelete}
                    onToggleFavorite={data.handleToggleFavorite}
                    onViewDetails={modal.handleViewDetails}
                    onViewCreatives={handleViewCreatives}
                    onFilterBrand={(brand) => { filters.handleFilterBrand(brand); data.setPage(1); }}
                    isRecentlyViewed={modal.recentlyViewedIds.includes(product.id)}
                  />
                ))}
              </div>
            )}

            <div ref={layout.sentinelRef} className="h-6 w-full" />

            {data.isFetchingMore && (
              <ProductsGridSkeleton
                viewMode={layout.viewMode}
                count={layout.viewMode === "grid" ? 4 : 3}
                className="pt-2"
              />
            )}

            <ProductsLoadMore
              productsCount={data.totalItemsRepresented}
              totalCount={data.pagination.total}
              hasMore={data.page < data.pagination.totalPages}
              isFetchingMore={data.isFetchingMore}
              onManualLoadMore={data.handleManualLoadMore}
            />
          </>
        )}
      </div>

      {/* Mobile Slide-Over Filter Drawer */}
      <MobileFilterDrawer
        isOpen={layout.isMobileDrawerOpen}
        onClose={() => layout.setIsMobileDrawerOpen(false)}
        selectedNiches={filters.selectedNiches}
        onChangeNiches={(niches) => { filters.setSelectedNiches(niches); data.setPage(1); }}
        selectedSubNiches={filters.selectedSubNiches}
        onChangeSubNiches={(subs) => { filters.setSelectedSubNiches(subs); data.setPage(1); }}
        nicheCounts={data.stats.nicheCounts}
        hideInactive={filters.hideInactive}
        onToggleHideInactive={() => { filters.setHideInactive((prev) => !prev); data.setPage(1); }}
        smartPreset={filters.smartPreset}
        onSelectPreset={(preset) => { filters.handleSelectPreset(preset); data.setPage(1); }}
        adLaunchFilter={filters.adLaunchFilter}
        onChangeAdLaunchFilter={(v) => {
          filters.setAdLaunchFilter(v);
          if (v === "all") { filters.setAdLaunchFrom(""); filters.setAdLaunchTo(""); }
          else { filters.setStillRunningOnly(true); }
          data.setPage(1);
        }}
        adLaunchFrom={filters.adLaunchFrom}
        onChangeAdLaunchFrom={(v) => { filters.setAdLaunchFrom(v); data.setPage(1); }}
        adLaunchTo={filters.adLaunchTo}
        onChangeAdLaunchTo={(v) => { filters.setAdLaunchTo(v); data.setPage(1); }}
        stillRunningOnly={filters.stillRunningOnly}
        onToggleStillRunningOnly={() => { filters.setStillRunningOnly((prev) => !prev); data.setPage(1); }}
        adLaunchLabels={filters.adLaunchLabels}
        discoveryFilter={filters.discoveryFilter}
        onChangeDiscoveryFilter={(v) => {
          filters.setDiscoveryFilter(v);
          if (v === "all") { filters.setDiscoveryFrom(""); filters.setDiscoveryTo(""); }
          data.setPage(1);
        }}
        discoveryFrom={filters.discoveryFrom}
        onChangeDiscoveryFrom={(v) => { filters.setDiscoveryFrom(v); data.setPage(1); }}
        discoveryTo={filters.discoveryTo}
        onChangeDiscoveryTo={(v) => { filters.setDiscoveryTo(v); data.setPage(1); }}
        discoveryLabels={filters.discoveryLabels}
        platform={filters.platform}
        onChangePlatform={(v) => { filters.setPlatform(v); data.setPage(1); }}
        platformCounts={data.stats.platforms}
        brandInput={filters.brandInput}
        onChangeBrand={(v) => { filters.setBrandInput(v); data.setPage(1); }}
        onClearBrand={() => { filters.setBrandInput(""); filters.setDebouncedBrand(""); data.setPage(1); }}
        activeFilterCount={filters.activeFilterCount}
        onResetFilters={() => { filters.handleResetFilters(); data.setPage(1); data.setAutoLoadCount(0); }}
      />

      {/* Floating Back to Top Button */}
      {layout.showBackToTop && (
        <button
          onClick={layout.scrollToTop}
          aria-label="Scroll Back to Top"
          className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))] right-6 z-40 p-3 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg hover:shadow-indigo-500/30 transition-all duration-200 animate-in fade-in zoom-in cursor-pointer"
          title="Scroll Back to Top"
        >
          <ArrowUp className="w-4 h-4" />
        </button>
      )}

      {/* Details & Competitor Benchmark Modal */}
      <ProductDetailsModal
        isOpen={modal.isModalOpen}
        onClose={modal.handleCloseDetailsModal}
        product={modal.selectedProduct}
        onRefresh={async (id, prod) => {
          await data.handleRefresh(id, prod || modal.selectedProduct || undefined, (refreshed) => {
            modal.setSelectedProduct((prev) => (prev?.id === id ? { ...prev, ...refreshed } : prev));
          });
        }}
        onDelete={isStaff ? undefined : data.handleDelete}
        onProductUpdate={(updated) => {
          modal.setSelectedProduct(updated);
          data.handleProductUpdate(updated);
        }}
        currentIndex={modal.currentProductIndex}
        totalCount={data.products.length}
        hasPrev={modal.currentProductIndex > 0}
        hasNext={modal.currentProductIndex >= 0 && modal.currentProductIndex < data.products.length - 1}
        onNavigatePrev={modal.handleNavigatePrev}
        onNavigateNext={modal.handleNavigateNext}
      />

      {/* Direct Add Product Link Modal */}
      <AddProductModal
        isOpen={layout.isAddProductModalOpen}
        onClose={() => layout.setIsAddProductModalOpen(false)}
        onSuccess={() => {
          data.fetchProducts(1, false);
          data.fetchStats(true);
        }}
      />
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 h-full w-full flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <ProductsPageContent />
    </Suspense>
  );
}
