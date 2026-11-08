import type { TrackedPage, BrandAnalyticsCalculations } from "@/types";

export type MainAnalyticsTab = "pages" | "ads" | "products";
export type BrandSubTab = "scaling" | "descaling" | "top" | "watchlist" | "attention";
export type DateRange = "today" | "7d" | "15d" | "30d";

export interface AnalyticsFilters {
  tab: MainAnalyticsTab;
  dateRange: DateRange;
  subTab?: BrandSubTab;
}

export type AnalyticsSortField = "name" | "searchType" | "current" | "previous" | "growth";
export type AnalyticsSortOrder = "asc" | "desc";

export interface BrandAnalyticsTabProps {
  pages: TrackedPage[];
  analytics: BrandAnalyticsCalculations;
  isLoading: boolean;
  onToggleWatchlist: (pageId: string, currentStatus?: boolean) => Promise<void>;
  updatingWatchlistId: string | null;
  subTab?: BrandSubTab;
  onSubTabChange?: (sub: BrandSubTab) => void;
}

