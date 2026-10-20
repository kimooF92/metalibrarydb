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
        dbValues: ["Skincare & Anti-Aging", "Skincare & Body", "Personal Care & Beauty", "Skincare", "Skincare & Face", "Skin Care"],
      },
      {
        id: "hair-care-styling",
        label: "Hair Care & Styling",
        dbValues: ["Hair Care & Styling", "Women's Beauty & Hair", "Hair Care"],
      },
      {
        id: "makeup-cosmetics",
        label: "Makeup & Cosmetics",
        dbValues: ["Makeup & Cosmetics", "Cosmetics", "Dental & Oral Care", "Eye Care"],
      },
      {
        id: "mens-grooming",
        label: "Men's Grooming & Beard",
        dbValues: ["Men's Grooming & Beard", "Men's Grooming"],
      },
      {
        id: "fragrances-perfumes",
        label: "Fragrances & Perfumes",
        dbValues: ["Fragrance & Perfumes", "Fragrances & Perfumes", "Perfumes", "Health & Wellness"],
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
        dbValues: ["Smartwatches & Wearables", "Wearables", "Smartwatches"],
      },
      {
        id: "audio-earbuds",
        label: "Audio & Earbuds",
        dbValues: ["Audio & Earbuds", "Audio", "Headphones", "Audio Devices"],
      },
      {
        id: "phone-desk-accessories",
        label: "Phone & Desk Accessories",
        dbValues: ["Phone & Desk Accessories", "Gadgets & Accessories", "Chargers & Power"],
      },
      {
        id: "cameras-security",
        label: "Cameras & Security",
        dbValues: ["Cameras & Security", "Security Cameras", "Action Cameras"],
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
        dbValues: [
          "Kitchen Gadgets & Blenders",
          "Kitchen & Home Appliances",
          "Kitchen & Home Living",
          "Kitchenware",
          "Kitchen & Cookware",
          "Juicer",
        ],
      },
      {
        id: "cleaning-organization",
        label: "Cleaning & Organization",
        dbValues: ["Cleaning & Organization", "Cleaning", "Cleaning & Maintenance", "Cleaning Tools", "Storage & Organization"],
      },
      {
        id: "home-decor-lamps",
        label: "Home Decor & Lamps",
        dbValues: ["Home Decor & Lamps", "Home Decor", "Home Decor & Lighting", "Lighting", "Lighting & Lamps"],
      },
      {
        id: "bedroom-comfort",
        label: "Bedroom & Comfort",
        dbValues: ["Bedroom & Comfort", "Bedding & Comfort", "Home Repair & Improvement", "Furniture"],
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
        dbValues: ["Men's Apparel", "Men's Clothing", "Apparel & Fashion"],
      },
      {
        id: "womens-apparel",
        label: "Women's Apparel & Dresses",
        dbValues: ["Women's Apparel & Dresses", "Women's Apparel", "Apparel & Accessories"],
      },
      {
        id: "shoes-footwear",
        label: "Shoes & Footwear",
        dbValues: ["Shoes & Footwear", "Footwear", "Footwear & Shoes"],
      },
      {
        id: "jewelry-luxury",
        label: "Jewelry, Watches & Luxury",
        dbValues: [
          "Jewelry, Watches & Luxury",
          "Jewelry & Watches",
          "Jewelry & Accessories",
          "Men's Watches",
          "Eyewear",
          "Sunglasses",
        ],
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
        dbValues: ["Fitness & Gym Equipment", "Fitness & Training", "Gym Equipment", "Sports & Training", "Fitness & Workout", "Home Gym"],
      },
      {
        id: "posture-body-support",
        label: "Posture & Body Support",
        dbValues: ["Posture & Body Support", "Orthopedic & Support", "Supports & Braces", "Knee Supports"],
      },
      {
        id: "pain-relief-massagers",
        label: "Pain Relief & Massagers",
        dbValues: ["Pain Relief & Massagers", "Massagers & Therapy", "Massage Roller"],
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
        dbValues: ["Car Interior & Accessories", "Car Accessories & Tools", "Car Accessories", "Automotive & Tools", "Car Electronics"],
      },
      {
        id: "car-care-repair",
        label: "Car Care & Repair",
        dbValues: ["Car Care & Repair", "Automotive Care", "Car Care & Maintenance"],
      },
      {
        id: "diy-tools-hardware",
        label: "DIY Tools & Hardware",
        dbValues: ["DIY Tools & Hardware", "Tools & Hardware", "Tools & Automotive", "Car Tools"],
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
        dbValues: ["Educational & Montessori", "Educational Toys", "Books & Learning Toys"],
      },
      {
        id: "baby-care-safety",
        label: "Baby Care & Safety",
        dbValues: ["Baby Care & Safety", "Baby Essentials", "Baby & Children"],
      },
      {
        id: "interactive-toys",
        label: "Interactive Toys & Games",
        dbValues: ["Interactive Toys & Games", "Baby & Children Toys", "Toys & Kids", "Toys & Games"],
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
  const normalized = dbCategory.trim().toLowerCase();
  return NICHE_TAXONOMY.find(
    (n) =>
      n.dbCategory.toLowerCase() === normalized ||
      n.id.toLowerCase() === normalized ||
      n.label.toLowerCase() === normalized
  );
}

export function getNicheDisplayLabel(dbCategory?: string | null): string {
  if (!dbCategory) return "Uncategorized";
  const niche = getNicheByDbCategory(dbCategory);
  return niche ? niche.label : dbCategory;
}

export function getSubNicheDisplayLabel(subCategory?: string | null): string {
  if (!subCategory) return "General";
  const normalized = subCategory.trim().toLowerCase();
  for (const niche of NICHE_TAXONOMY) {
    for (const sub of niche.subNiches) {
      if (
        sub.id.toLowerCase() === normalized ||
        sub.label.toLowerCase() === normalized ||
        sub.dbValues.some((v) => v.toLowerCase() === normalized)
      ) {
        return sub.label;
      }
    }
  }
  return subCategory;
}

/** Resolves any given niche string, slug, or label to all DB matching strings */
export function resolveNicheDbCategories(raw: string): string[] {
  const normalized = raw.trim().toLowerCase();
  const found = NICHE_TAXONOMY.find(
    (n) =>
      n.id.toLowerCase() === normalized ||
      n.dbCategory.toLowerCase() === normalized ||
      n.label.toLowerCase() === normalized
  );
  if (found) {
    return [found.dbCategory];
  }
  return [raw.trim()];
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
  return [subNicheOrLabel.trim()];
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Robust parser for category / niche query parameters.
 * Supports:
 * - URL slugs (e.g. 'beauty-personal-care,home-kitchen-living')
 * - Full DB categories containing commas (e.g. 'Beauty, Health & Care' or 'Beauty, Health & Care, Home, Kitchen & Living')
 * - UI display labels
 */
export function parseNicheParam(paramValue?: string | null): string[] {
  if (!paramValue || paramValue.trim() === "" || paramValue.trim() === "all") return [];

  const trimmed = paramValue.trim();

  // 1. Direct single match (prevents splitting categories that contain internal commas like "Beauty, Health & Care")
  const directMatch = NICHE_TAXONOMY.find(
    (n) =>
      n.id.toLowerCase() === trimmed.toLowerCase() ||
      n.dbCategory.toLowerCase() === trimmed.toLowerCase() ||
      n.label.toLowerCase() === trimmed.toLowerCase()
  );
  if (directMatch) {
    return [directMatch.id];
  }

  // 2. Multi-match: identify known niches within the string
  const results: string[] = [];
  let remaining = trimmed;

  for (const niche of NICHE_TAXONOMY) {
    const candidates = [niche.dbCategory, niche.label, niche.id];
    for (const candidate of candidates) {
      const regex = new RegExp(`(^|,\\s*)${escapeRegex(candidate)}(,\\s*|$)`, "i");
      if (regex.test(remaining)) {
        if (!results.includes(niche.id)) {
          results.push(niche.id);
        }
        remaining = remaining.replace(regex, "$1$2");
      }
    }
  }

  // Any remaining tokens split by comma
  const leftovers = remaining.split(",").map((s) => s.trim()).filter(Boolean);
  for (const leftover of leftovers) {
    const found = NICHE_TAXONOMY.find(
      (n) =>
        n.id.toLowerCase() === leftover.toLowerCase() ||
        n.dbCategory.toLowerCase() === leftover.toLowerCase() ||
        n.label.toLowerCase() === leftover.toLowerCase()
    );
    const id = found ? found.id : leftover;
    if (!results.includes(id)) {
      results.push(id);
    }
  }

  return results;
}

/**
 * Robust parser for subCategory / subNiche query parameters.
 * Supports:
 * - URL slugs (e.g. 'skincare-anti-aging,jewelry-luxury')
 * - Sub-niche labels containing commas (e.g. 'Jewelry, Watches & Luxury')
 */
export function parseSubNicheParam(paramValue?: string | null): string[] {
  if (!paramValue || paramValue.trim() === "" || paramValue.trim() === "all") return [];

  const trimmed = paramValue.trim();

  const allSubNiches: SubNicheDefinition[] = [];
  for (const niche of NICHE_TAXONOMY) {
    allSubNiches.push(...niche.subNiches);
  }

  // 1. Direct single match
  const direct = allSubNiches.find(
    (s) =>
      s.id.toLowerCase() === trimmed.toLowerCase() ||
      s.label.toLowerCase() === trimmed.toLowerCase() ||
      s.dbValues.some((v) => v.toLowerCase() === trimmed.toLowerCase())
  );
  if (direct) {
    return [direct.id];
  }

  // 2. Identify known sub-niches with commas before splitting remainder
  const results: string[] = [];
  let remaining = trimmed;

  const sortedSubs = [...allSubNiches].sort((a, b) => b.label.length - a.label.length);
  for (const sub of sortedSubs) {
    const candidates = [sub.label, sub.id, ...sub.dbValues];
    for (const candidate of candidates) {
      const regex = new RegExp(`(^|,\\s*)${escapeRegex(candidate)}(,\\s*|$)`, "i");
      if (regex.test(remaining)) {
        if (!results.includes(sub.id)) {
          results.push(sub.id);
        }
        remaining = remaining.replace(regex, "$1$2");
      }
    }
  }

  const leftovers = remaining.split(",").map((s) => s.trim()).filter(Boolean);
  for (const leftover of leftovers) {
    const found = allSubNiches.find(
      (s) =>
        s.id.toLowerCase() === leftover.toLowerCase() ||
        s.label.toLowerCase() === leftover.toLowerCase() ||
        s.dbValues.some((v) => v.toLowerCase() === leftover.toLowerCase())
    );
    const id = found ? found.id : leftover;
    if (!results.includes(id)) {
      results.push(id);
    }
  }

  return results;
}
