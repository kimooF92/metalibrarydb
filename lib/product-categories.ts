export const PRODUCT_CATEGORIES = [
  "Electronics & Tech",
  "Beauty, Health & Care",
  "Home, Kitchen & Living",
  "Fashion & Jewelry",
  "Sports, Fitness & Outdoor",
  "Kids, Baby & Toys",
  "Automotive & Tools",
  "General & Other",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export interface ProductClassificationResult {
  category: ProductCategory;
  subCategory: string;
  targetAudience: "unisex" | "men" | "women" | "kids";
  modelUsed: string;
  confidence?: number;
}
