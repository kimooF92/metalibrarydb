import { ScrapedProduct } from "@/types";

export type SmartPreset =
  | "all"
  | "breakout"
  | "most_scaled"
  | "new_discovered"
  | "top_lasting"
  | "with_offers"
  | "favorites";

export interface ProductsStats {
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
}

export interface ProductsPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

