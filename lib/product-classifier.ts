/**
 * E-Commerce Product AI Classifier Engine
 * 
 * Uses the 3 Best Free Models on OpenRouter with Cascade Fallback:
 * 1. nvidia/llama-3.1-nemotron-70b-instruct:free (Primary - Top reasoning & edge-case disambiguation)
 * 2. google/gemini-2.0-flash-exp:free (Fallback 1 - Ultra-fast, best French & Arabic multilingual comprehension)
 * 3. meta-llama/llama-3.3-70b-instruct:free (Fallback 2 - Heavyweight 70B parameter taxonomy classification)
 * 
 * Includes an Offline Deterministic Rule-Based Fallback Engine ($0 cost, 0 network failure).
 */

import { classifyProductWithJev } from "./typesafe-jev";

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

// In-memory cache for categorized titles (avoids redundant API requests)
const categoryCache = new Map<string, ProductClassificationResult>();

/**
 * Deterministic offline rule-based fallback (French, Arabic, English e-commerce keywords).
 * Runs instantly if OpenRouter is unreachable, rate-limited, or API key is not configured.
 */
export function classifyProductOffline(title: string): ProductClassificationResult {
  const text = (title || "").toLowerCase();

  // 1. Electronics & Tech
  if (
    /(tablette|phone|ecouteur|écouteur|casque|montre connect|smartwatch|airpod|bluetooth|chargeur|cable|powerbank|camera|caméra|souris|clavier|laptop|pc|projecteur|speaker|baffle|tv|ring light|support telephone|micro|usb|wifi|led rgb|smart watch|rechargeable|haut-parleur|سماعات|ساعة ذكية|هاتف|شاحن|كاميرا|طابليت|لوحة مضيئة|لوح ذكي)/i.test(
      text
    )
  ) {
    let sub = "Gadgets & Accessories";
    if (/tablette|tablet|ipad/i.test(text)) sub = "Tablets & Computers";
    else if (/montre|smartwatch|watch/i.test(text)) sub = "Smartwatches & Wearables";
    else if (/ecouteur|casque|airpod|earbud/i.test(text)) sub = "Audio & Earbuds";
    else if (/camera|caméra/i.test(text)) sub = "Cameras & Security";

    return {
      category: "Electronics & Tech",
      subCategory: sub,
      targetAudience: "unisex",
      modelUsed: "offline_rules",
    };
  }

  // 2. Beauty, Health & Care
  if (
    /(creme|crème|serum|sérum|visage|cheveux|shampoing|masque|parfum|savon|huile|epilateur|épilateur|brosse lissante|sechoir|sèche-cheveux|tondeuse|dent|massage|minceur|peau|anti-rides|rouge a levres|maquillage|soin|barbe|cire|anti-chute|acné|glow|collagene|vitamine|عناية|شعر|بشرة|كريم|عطر|ماكياج|مكياج|مساج|تجميل)/i.test(
      text
    )
  ) {
    let sub = "Skincare & Body";
    let audience: "unisex" | "men" | "women" = "unisex";
    if (/barbe|homme|tondeuse barbe/i.test(text)) {
      sub = "Men's Grooming";
      audience = "men";
    } else if (/maquillage|مكياج|ماكياج|rouge a levres|anti-rides|lissante|epilateur/i.test(text)) {
      sub = "Women's Beauty & Hair";
      audience = "women";
    } else if (/parfum|fragrance/i.test(text)) {
      sub = "Fragrances & Perfumes";
    }

    return {
      category: "Beauty, Health & Care",
      subCategory: sub,
      targetAudience: audience,
      modelUsed: "offline_rules",
    };
  }

  // 3. Fashion & Jewelry
  if (
    /(robe|chemise|pantalon|t-shirt|pull|veste|manteau|chaussure|sneaker|basket|sac|sacoche|portefeuille|trousse|trousses|bague|collier|bracelet|bijoux|lunette|ceinture|montre classique|talons|lingerie|pyjama|sandale|hoodie|jean|ملابس|حذاء|حقيبة|تروس|فستان|مجوهرات|سروال|قميص)/i.test(
      text
    )
  ) {
    let sub = "Apparel & Accessories";
    if (/sac|sacoche|portefeuille|trousse|trousses|حقيبة|تروس/i.test(text)) sub = "Bags & Wallets";
    let audience: "unisex" | "men" | "women" = "unisex";
    if (/robe|lingerie|talons|femme|sac a main/i.test(text)) audience = "women";
    else if (/homme|costume|chemise homme/i.test(text)) audience = "men";

    return {
      category: "Fashion & Jewelry",
      subCategory: sub,
      targetAudience: audience,
      modelUsed: "offline_rules",
    };
  }

  // 4. Home, Kitchen & Living
  if (
    /(cuisine|poele|poêle|marmite|couteau|mixeur|blender|friteuse|air fryer|hachoir|nettoyeur|balai|rangement|organiseur|lampe|coussin|tapis|drap|lit|aspirateur|mop|gadget cuisine|repassage|brosse magique|humidificateur|diffuseur|tapisserie|مطبخ|منزل|تنظيف|أواني|مفرمة|خلاط)/i.test(
      text
    )
  ) {
    return {
      category: "Home, Kitchen & Living",
      subCategory: "Kitchen & Home Appliances",
      targetAudience: "unisex",
      modelUsed: "offline_rules",
    };
  }

  // 5. Automotive & Tools
  if (
    /(voiture|auto|moto|pneu|pare-brise|reparation|réparation|cle|clé|tournevis|perceuse|outils|lavage auto|support voiture|transmetteur fm|dashcam|gonfleur|polisseuse|سيارة|أدوات|تصليح|معدات)/i.test(
      text
    )
  ) {
    return {
      category: "Automotive & Tools",
      subCategory: "Car Accessories & Tools",
      targetAudience: "men",
      modelUsed: "offline_rules",
    };
  }

  // 6. Kids, Baby & Toys
  if (
    /(bebe|bébé|enfant|jouet|jeu|peluche|poussette|biberon|doudou|trottinette|scooter enfant|educatif|éducatif|dessin|magic board|puzzle|montessori|أطفال|ألعاب|رضيع|لوحة كتابة|لوحة رسم|لوحة تعليمية)/i.test(
      text
    )
  ) {
    return {
      category: "Kids, Baby & Toys",
      subCategory: "Baby & Children Toys",
      targetAudience: "kids",
      modelUsed: "offline_rules",
    };
  }

  // 7. Sports, Fitness & Outdoor
  if (
    /(fitness|gym|musculation|sport|yoga|gaine|haltere|haltère|velo|vélo|corde|tapis course|camping|randonnee|randonnée|gourde|ceinture amincissante|رياضة|لياقة|تخييم)/i.test(
      text
    )
  ) {
    return {
      category: "Sports, Fitness & Outdoor",
      subCategory: "Fitness & Training",
      targetAudience: "unisex",
      modelUsed: "offline_rules",
    };
  }

  // Default fallback
  return {
    category: "General & Other",
    subCategory: "General Merchandise",
    targetAudience: "unisex",
    modelUsed: "offline_rules",
  };
}



/**
 * Classifies an e-commerce product using Decision AI models only:
 * Primary: Span model (respan/span-02)
 * Backup: Jev model (typesafe/jev-1.13)
 * Strict rule: No other LLMs (Gemini, Groq, OpenAI, or generic chat models) are used.
 */
export async function classifyProductWithAI(
  productTitle: string,
  extraContext?: {
    domain?: string | null;
    brandName?: string | null;
    adText?: string | null;
    url?: string | null;
  }
): Promise<ProductClassificationResult> {
  const cleanTitle = (productTitle || "").trim();
  if (!cleanTitle || cleanTitle.length < 2) {
    return {
      category: "Home, Kitchen & Living",
      subCategory: "Kitchen & Home Living",
      targetAudience: "unisex",
      modelUsed: "empty_title",
    };
  }

  // Check cache
  const cacheKey = cleanTitle.toLowerCase();
  if (categoryCache.has(cacheKey)) {
    return categoryCache.get(cacheKey)!;
  }

  // Strict Policy: Uses ONLY span (respan/span-02), and if it fails, jev (typesafe/jev-1.13) as backup.
  // Never uses any other LLM.
  try {
    const decisionResult = await classifyProductWithJev(cleanTitle, {
      domain: extraContext?.domain,
      brandName: extraContext?.brandName,
      adText: extraContext?.adText,
      url: extraContext?.url,
      allowGeneral: false, // Never classify into General Merchandise
    });

    if (decisionResult && decisionResult.category && decisionResult.category !== "General & Other") {
      categoryCache.set(cacheKey, decisionResult);
      return decisionResult;
    }
  } catch (err: any) {
    console.warn(`[Decision Engine] Error in span/jev classification for "${cleanTitle}":`, err?.message || err);
  }

  // Deterministic offline fallback if Decision AI models are completely unreachable
  const fallbackResult = classifyProductOffline(cleanTitle);
  categoryCache.set(cacheKey, fallbackResult);
  return fallbackResult;
}
