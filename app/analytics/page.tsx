"use client";

import { useAnalyticsFilters, useAnalyticsData } from "@/features/analytics";
import {
  AnalyticsHeader,
  AnalyticsTabsNav,
  AnalyticsErrorBanner,
  BrandAnalyticsTab,
} from "@/features/analytics";
import { PulseBanner } from "@/components/analytics/pulse-banner";
import { MarketForecastCard } from "@/components/analytics/market-forecast-card";
import { ProductAnalyticsTab } from "@/components/analytics/product-analytics-tab";
import { AdAnalyticsTab } from "@/components/analytics/ad-analytics-tab";

export default function AnalyticsPage() {
  const {
    activeTab,
    dateRange,
    pageSubTab,
    handleTabChange,
    handleDateRangeChange,
    handlePageSubTabChange,
  } = useAnalyticsFilters();

  const {
    productsData,
    adsData,
    pages,
    loadingProducts,
    loadingAds,
    loadingPages,
    isCurrentTabLoading,
    currentTabError,
    lastRefreshed,
    isStale,
    updatingWatchlistId,
    pageAnalytics,
    pulseMetrics,
    handleRefresh,
    toggleWatchlist,
    fetchProductsAnalytics,
    fetchAdsAnalytics,
  } = useAnalyticsData({ activeTab, dateRange });

  return (
    <div className="h-full overflow-y-auto space-y-5 pb-12 pr-1 text-slate-900 dark:text-slate-100">
      <AnalyticsHeader
        counts={{
          totalProducts: productsData?.summary?.totalProducts || 0,
          totalAds: adsData?.summary?.totalAds || 0,
          totalPages: pages.length,
        }}
        lastRefreshed={lastRefreshed}
        dateRange={dateRange}
        onDateRangeChange={handleDateRangeChange}
        isLoading={isCurrentTabLoading}
        isStale={isStale}
        onRefresh={() => handleRefresh(false)}
      />

      <PulseBanner
        breakoutCount={pulseMetrics.breakoutCount}
        topNiche={pulseMetrics.topNiche}
        topNichePrice={pulseMetrics.topNichePrice}
        dominantCTA={pulseMetrics.dominantCTA}
        dominantCTAPct={pulseMetrics.dominantCTAPct}
        catalogHealthPct={pulseMetrics.catalogHealthPct}
        dateRange={dateRange}
        isLoading={isCurrentTabLoading && !productsData && !adsData}
      />

      <MarketForecastCard />

      <AnalyticsTabsNav
        activeTab={activeTab}
        onTabChange={handleTabChange}
        counts={{
          products: loadingProducts && !productsData ? "—" : productsData?.summary?.totalProducts || 0,
          ads: loadingAds && !adsData ? "—" : adsData?.summary?.totalAds || 0,
          pages: loadingPages && pages.length === 0 ? "—" : pages.length,
        }}
      />

      <AnalyticsErrorBanner
        error={currentTabError}
        onRetry={() => handleRefresh(false)}
      />

      <div className={activeTab === "products" ? "block" : "hidden"}>
        <ProductAnalyticsTab
          data={productsData}
          isLoading={loadingProducts}
          onRefresh={() => fetchProductsAnalytics(true)}
          dateRange={dateRange}
        />
      </div>

      <div className={activeTab === "ads" ? "block" : "hidden"}>
        <AdAnalyticsTab
          data={adsData}
          isLoading={loadingAds}
          onRefresh={() => fetchAdsAnalytics(true)}
          dateRange={dateRange}
        />
      </div>

      <div className={activeTab === "pages" ? "block" : "hidden"}>
        <BrandAnalyticsTab
          pages={pages}
          analytics={pageAnalytics}
          isLoading={loadingPages}
          onToggleWatchlist={toggleWatchlist}
          updatingWatchlistId={updatingWatchlistId}
          subTab={pageSubTab}
          onSubTabChange={handlePageSubTabChange}
        />
      </div>
    </div>
  );
}
