/**
 * Canonical Niches & Sub-Niches Taxonomy
 *
 * Provides display labels, icons, and 1:1 mapping to existing DB values
 * (scrapedProducts.category and scrapedProducts.sub_category).
 * Zero DB migration required.
 */

export interface SubNicheDefinition {
  id: string; // URL/state friendly identifier, e.g. 'skincare-anti-aging'
  label: string; // UI display label, e.g. 'Skincare & Anti-Aging'
  dbValues: string[]; // Corresponding strings found in scrapedProducts.sub_category
}

export interface NicheDefinition {
  id: string; // slug / key, e.g. 'beauty-personal-care'
  dbCategory: string; // Exact value in scrapedProducts.category
  label: string; // Human-friendly display label
  icon: string; // Lucide icon identifier
  subNiches: SubNicheDefinition[];
}

export const NICHE_TAXONOMY: NicheDefinition[] = [
  {
    id: "beauty-personal-care",
    dbCategory: "Beauty, Health & Care",
    label: "Beauty & Personal Care",
    icon: "Sparkles",
    subNiches: [
      {
        id: "skincare-anti-aging",
        label: "Skincare & Anti-Aging",
        dbValues: ["Skincare & Anti-Aging", "Skincare & Body", "Personal Care & Beauty", "Skincare"],
      },
      {
        id: "hair-care-styling",
        label: "Hair Care & Styling",
        dbValues: ["Hair Care & Styling", "Women's Beauty & Hair", "Hair Care"],
      },
      {
        id: "makeup-cosmetics",
        label: "Makeup & Cosmetics",
        dbValues: ["Makeup & Cosmetics", "Cosmetics"],
      },
      {
        id: "mens-grooming",
        label: "Men's Grooming & Beard",
        dbValues: ["Men's Grooming & Beard", "Men's Grooming"],
      },
      {
        id: "fragrances-perfumes",
        label: "Fragrances & Perfumes",
        dbValues: ["Fragrance & Perfumes", "Fragrances & Perfumes", "Perfumes"],
      },
    ],
  },
  {
    id: "electronics-tech",
    dbCategory: "Electronics & Tech",
    label: "Electronics & Tech",
    icon: "Cpu",
    subNiches: [
      {
        id: "smartwatches-wearables",
        label: "Smartwatches & Wearables",
        dbValues: ["Smartwatches & Wearables", "Wearables"],
      },
      {
        id: "audio-earbuds",
        label: "Audio & Earbuds",
        dbValues: ["Audio & Earbuds", "Audio", "Headphones"],
      },
      {
        id: "phone-desk-accessories",
        label: "Phone & Desk Accessories",
        dbValues: ["Phone & Desk Accessories", "Gadgets & Accessories"],
      },
      {
        id: "cameras-security",
        label: "Cameras & Security",
        dbValues: ["Cameras & Security", "Security Cameras"],
      },
      {
        id: "tablets-computers",
        label: "Tablets & Computers",
        dbValues: ["Tablets & Computers", "Laptops & Computers"],
      },
      {
        id: "led-lighting",
        label: "LED & Smart Lighting",
        dbValues: ["LED & Lighting", "Smart Lighting"],
      },
    ],
  },
  {
    id: "home-kitchen-living",
    dbCategory: "Home, Kitchen & Living",
    label: "Home, Kitchen & Living",
    icon: "Home",
    subNiches: [
      {
        id: "kitchen-appliances",
        label: "Kitchen Gadgets & Blenders",
        dbValues: ["Kitchen Gadgets & Blenders", "Kitchen & Home Appliances", "Kitchenware"],
      },
      {
        id: "cleaning-organization",
        label: "Cleaning & Organization",
        dbValues: ["Cleaning & Organization", "Cleaning"],
      },
      {
        id: "home-decor-lamps",
        label: "Home Decor & Lamps",
        dbValues: ["Home Decor & Lamps", "Home Decor"],
      },
      {
        id: "bedroom-comfort",
        label: "Bedroom & Comfort",
        dbValues: ["Bedroom & Comfort", "Bedding & Comfort"],
      },
    ],
  },
  {
    id: "fashion-apparel",
    dbCategory: "Fashion & Jewelry",
    label: "Fashion & Apparel",
    icon: "Shirt",
    subNiches: [
      {
        id: "mens-apparel",
        label: "Men's Apparel",
        dbValues: ["Men's Apparel", "Men's Clothing"],
      },
      {
        id: "womens-apparel",
        label: "Women's Apparel & Dresses",
        dbValues: ["Women's Apparel & Dresses", "Women's Apparel"],
      },
      {
        id: "shoes-footwear",
        label: "Shoes & Footwear",
        dbValues: ["Shoes & Footwear", "Footwear"],
      },
      {
        id: "jewelry-luxury",
        label: "Jewelry, Watches & Luxury",
        dbValues: ["Jewelry, Watches & Luxury", "Jewelry & Watches"],
      },
      {
        id: "bags-accessories",
        label: "Bags, Wallets & Belts",
        dbValues: ["Bags, Wallets & Belts", "Apparel & Accessories", "Bags & Wallets"],
      },
    ],
  },
  {
    id: "health-wellness-fitness",
    dbCategory: "Sports, Fitness & Outdoor",
    label: "Health, Wellness & Fitness",
    icon: "Dumbbell",
    subNiches: [
      {
        id: "fitness-equipment",
        label: "Fitness & Gym Equipment",
        dbValues: ["Fitness & Gym Equipment", "Fitness & Training", "Gym Equipment"],
      },
      {
        id: "posture-body-support",
        label: "Posture & Body Support",
        dbValues: ["Posture & Body Support", "Orthopedic & Support"],
      },
      {
        id: "pain-relief-massagers",
        label: "Pain Relief & Massagers",
        dbValues: ["Pain Relief & Massagers", "Massagers & Therapy"],
      },
      {
        id: "weight-loss-sauna",
        label: "Weight Loss & Sauna",
        dbValues: ["Weight Loss & Sauna", "Slimming"],
      },
    ],
  },
  {
    id: "automotive-tools",
    dbCategory: "Automotive & Tools",
    label: "Automotive & Tools",
    icon: "Wrench",
    subNiches: [
      {
        id: "car-interior-accessories",
        label: "Car Interior & Accessories",
        dbValues: ["Car Interior & Accessories", "Car Accessories & Tools", "Car Accessories"],
      },
      {
        id: "car-care-repair",
        label: "Car Care & Repair",
        dbValues: ["Car Care & Repair", "Automotive Care"],
      },
      {
        id: "diy-tools-hardware",
        label: "DIY Tools & Hardware",
        dbValues: ["DIY Tools & Hardware", "Tools & Hardware"],
      },
    ],
  },
  {
    id: "kids-baby-toys",
    dbCategory: "Kids, Baby & Toys",
    label: "Kids, Baby & Toys",
    icon: "Baby",
    subNiches: [
      {
        id: "educational-montessori",
        label: "Educational & Montessori",
        dbValues: ["Educational & Montessori", "Educational Toys"],
      },
      {
        id: "baby-care-safety",
        label: "Baby Care & Safety",
        dbValues: ["Baby Care & Safety", "Baby Essentials"],
      },
      {
        id: "interactive-toys",
        label: "Interactive Toys & Games",
        dbValues: ["Interactive Toys & Games", "Baby & Children Toys", "Toys & Kids"],
      },
    ],
  },
  {
    id: "general-seasonal",
    dbCategory: "General & Other",
    label: "General & Seasonal",
    icon: "Package",
    subNiches: [
      {
        id: "gifts-novelty",
        label: "Gifts & Novelty Gadgets",
        dbValues: ["Gifts & Novelty Gadgets", "Novelty Gifts"],
      },
      {
        id: "seasonal-holiday",
        label: "Seasonal & Holiday",
        dbValues: ["Seasonal & Holiday", "Seasonal Items"],
      },
      {
        id: "general-merchandise",
        label: "General Merchandise",
        dbValues: ["General Merchandise", "General"],
      },
    ],
  },
];

/** Lookup helpers */
export function getNicheByDbCategory(dbCategory?: string | null): NicheDefinition | undefined {
  if (!dbCategory) return undefined;
  return NICHE_TAXONOMY.find(
    (n) => n.dbCategory.toLowerCase() === dbCategory.toLowerCase() || n.id === dbCategory.toLowerCase()
  );
}

export function getNicheDisplayLabel(dbCategory?: string | null): string {
  if (!dbCategory) return "Uncategorized";
  const niche = getNicheByDbCategory(dbCategory);
  return niche ? niche.label : dbCategory;
}

export function getSubNicheDisplayLabel(subCategory?: string | null): string {
  if (!subCategory) return "General";
  for (const niche of NICHE_TAXONOMY) {
    for (const sub of niche.subNiches) {
      if (
        sub.label.toLowerCase() === subCategory.toLowerCase() ||
        sub.dbValues.some((v) => v.toLowerCase() === subCategory.toLowerCase())
      ) {
        return sub.label;
      }
    }
  }
  return subCategory;
}

/** Resolves any given sub-niche string or label to all DB matching strings */
export function resolveSubNicheDbValues(subNicheOrLabel: string): string[] {
  const normalized = subNicheOrLabel.trim().toLowerCase();
  for (const niche of NICHE_TAXONOMY) {
    for (const sub of niche.subNiches) {
      if (
        sub.id.toLowerCase() === normalized ||
        sub.label.toLowerCase() === normalized ||
        sub.dbValues.some((v) => v.toLowerCase() === normalized)
      ) {
        return Array.from(new Set([sub.label, ...sub.dbValues]));
      }
    }
  }
  return [subNicheOrLabel];
}
