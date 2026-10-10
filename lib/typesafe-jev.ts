/**
 * TypeSafe / Jev Decision Engine Client (via OpenRouter Decisions API)
 *
 * Model: typesafe/jev-1.13
 * Endpoint: https://openrouter.ai/api/alpha/decisions
 *
 * Jev is a non-autoregressive "System One" decision model specifically designed
 * to return typed choices, confidence probabilities, and binary (noul) classifications
 * in a single parallel pass without token-by-token generation.
 */

import { PRODUCT_CATEGORIES, ProductCategory, ProductClassificationResult } from "./product-classifier";

export interface JevChoiceQuestion {
  type: "choice";
  instructions: string;
  criteria: Record<string, string> | string[];
}

export interface JevNoulQuestion {
  type: "noul";
  instructions: string;
}

export interface JevScoreQuestion {
  type: "score";
  instructions: string;
  rubric?: Record<string, string> | string[];
}

export type JevQuestion = JevChoiceQuestion | JevNoulQuestion | JevScoreQuestion;

export interface JevChoiceAnswer {
  type: "choice";
  choice: string;
  probabilities?: Record<string, number>;
  confidence?: number;
}

export interface JevNoulAnswer {
  type: "noul";
  noul: number; // 0.0 to 1.0 probability
}

export interface JevScoreAnswer {
  type: "score";
  position: number;
  confidence?: number;
  distribution?: Record<string, number>;
}

export type JevAnswer = JevChoiceAnswer | JevNoulAnswer | JevScoreAnswer;

export interface JevDecisionsResponse {
  model?: string;
  answers: Record<string, JevAnswer>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cost?: number;
  };
  id?: string;
  provider?: string;
}

export interface JevProductResult extends ProductClassificationResult {
  confidence?: number;
  isPhysicalProduct?: boolean;
}

const DEFAULT_JEV_MODEL = "typesafe/jev-1.13";
const DECISIONS_ENDPOINT = "https://openrouter.ai/api/alpha/decisions";

/**
 * Low-level caller for OpenRouter /api/alpha/decisions
 */
export async function callJevDecisions(
  state: Record<string, any> | string,
  questions: Record<string, JevQuestion>,
  options?: {
    model?: string;
    timeoutMs?: number;
    apiKey?: string;
  }
): Promise<JevDecisionsResponse | null> {
  const apiKey =
    options?.apiKey ||
    process.env.OPENROUTER_API_KEY ||
    process.env.OPEN_ROUTER_API_KEY;

  if (!apiKey || apiKey.trim() === "") {
    return null;
  }

  const model = options?.model || DEFAULT_JEV_MODEL;
  const timeoutMs = options?.timeoutMs || 5000;

  try {
    const response = await fetch(DECISIONS_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://ad-library-tracker.local",
        "X-Title": "Meta Ad Tracker Decisions",
      },
      body: JSON.stringify({
        model,
        state,
        questions,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[Jev Decision Notice] HTTP ${response.status}: ${errText.slice(0, 200)}`);
      return null;
    }

    const data = (await response.json()) as JevDecisionsResponse;
    return data;
  } catch (err: any) {
    console.warn(`[Jev Decision Notice] Failed to query ${model}:`, err?.message || err);
    return null;
  }
}

/**
 * Derives a clean, readable subcategory based on the main category and title hints.
 */
function deriveSubCategory(title: string, category: ProductCategory): string {
  const text = (title || "").toLowerCase();

  switch (category) {
    case "Electronics & Tech":
      if (/montre|smartwatch|watch|ساعة/i.test(text)) return "Smartwatches & Wearables";
      if (/ecouteur|écouteur|casque|airpod|earbud|audio|سماعات/i.test(text)) return "Audio & Earbuds";
      if (/chargeur|cable|câble|powerbank|شاحن/i.test(text)) return "Chargers & Power";
      if (/tablette|tablet|ipad|laptop|pc|طابليت/i.test(text)) return "Tablets & Computers";
      if (/camera|caméra|كاميرا|dashcam/i.test(text)) return "Cameras & Security";
      return "Gadgets & Accessories";

    case "Beauty, Health & Care":
      if (/barbe|homme|tondeuse|لحية/i.test(text)) return "Men's Grooming";
      if (/parfum|fragrance|عطر/i.test(text)) return "Fragrances & Perfumes";
      if (/cheveux|shampoing|lissante|sechoir|sèche-cheveux|شعر/i.test(text)) return "Hair Care & Styling";
      if (/creme|crème|serum|sérum|visage|peau|anti-rides|glow|بشرة|كريم/i.test(text)) return "Skincare & Face";
      if (/massage|dent|minceur|santé|مساج/i.test(text)) return "Health & Wellness";
      return "Personal Care & Beauty";

    case "Home, Kitchen & Living":
      if (/air fryer|friteuse|mixeur|blender|hachoir|poele|poêle|marmite|مطبخ|خلاط/i.test(text))
        return "Kitchen & Cookware";
      if (/nettoyeur|aspirateur|balai|mop|تنظيف/i.test(text)) return "Cleaning & Maintenance";
      if (/lampe|led|coussin|tapis|drap|lit|déco|منزل/i.test(text)) return "Home Decor & Lighting";
      return "Kitchen & Home Living";

    case "Fashion & Jewelry":
      if (/bague|collier|bracelet|bijoux|مجوهرات/i.test(text)) return "Jewelry & Accessories";
      if (/chaussure|sneaker|basket|sandale|talons|حذاء/i.test(text)) return "Footwear & Shoes";
      if (/sac|sacoche|portefeuille|حقيبة/i.test(text)) return "Bags & Wallets";
      if (/gaine|waist trainer|corset|lingerie/i.test(text)) return "Shapewear & Underwear";
      return "Apparel & Fashion";

    case "Sports, Fitness & Outdoor":
      if (/fitness|gym|musculation|haltere|haltère|رياضة/i.test(text)) return "Fitness & Workout";
      if (/camping|randonnee|randonnée|outdoor|تخييم/i.test(text)) return "Outdoor & Camping";
      return "Sports & Training";

    case "Kids, Baby & Toys":
      if (/jouet|jeu|peluche|puzzle|ألعاب/i.test(text)) return "Toys & Games";
      if (/bebe|bébé|poussette|biberon|رضيع|أطفال/i.test(text)) return "Baby Essentials";
      return "Baby & Children";

    case "Automotive & Tools":
      if (/voiture|auto|moto|pneu|dashcam|سيارة/i.test(text)) return "Car Accessories";
      if (/outils|cle|clé|tournevis|perceuse|أدوات/i.test(text)) return "Tools & Hardware";
      return "Automotive & Tools";

    default:
      return "General Merchandise";
  }
}

/**
 * Classifies an e-commerce product title and context using typesafe/jev-1.13.
 * Uses ultra-compact input tokens to minimize billing credits on OpenRouter.
 */
export async function classifyProductWithJev(
  productTitle: string,
  extraContext?: { domain?: string | null; brandName?: string | null; adText?: string | null }
): Promise<JevProductResult | null> {
  const cleanTitle = (productTitle || "").trim();
  if (!cleanTitle || cleanTitle.length < 2) {
    return null;
  }

  // 1. Credit-saving: Truncate title to 90 chars and compact state payload
  const statePayload: Record<string, string> = {
    title: cleanTitle.slice(0, 90),
  };
  if (extraContext?.domain) {
    statePayload.domain = extraContext.domain.slice(0, 30);
  }

  // 2. Fast offline audience inference to save input tokens if unambiguous
  let resolvedAudience: "unisex" | "men" | "women" | "kids" | null = null;
  const lower = cleanTitle.toLowerCase();
  if (/(?:homme|men|beard|barbe|rasoir)/i.test(lower)) resolvedAudience = "men";
  else if (/(?:femme|women|robe|jupe|dentelle|maquillage|lingerie)/i.test(lower)) resolvedAudience = "women";
  else if (/(?:bebe|bébé|enfant|enfants|kids|baby|jouet)/i.test(lower)) resolvedAudience = "kids";

  // 3. Compact criteria definitions to minimize input token billing
  const questions: Record<string, JevQuestion> = {
    category: {
      type: "choice",
      instructions: "Product category",
      criteria: {
        "Electronics & Tech": "Gadgets, audio, phones, tech",
        "Beauty, Health & Care": "Cosmetics, skincare, hair, care",
        "Home, Kitchen & Living": "Kitchen, appliances, decor",
        "Fashion & Jewelry": "Clothing, shoes, bags, jewelry",
        "Sports, Fitness & Outdoor": "Fitness, gym, outdoor",
        "Kids, Baby & Toys": "Toys, baby items",
        "Automotive & Tools": "Car gear, tools, hardware",
        "General & Other": "General merchandise",
      },
    },
  };

  // Only query audience if not obvious from title keywords
  if (!resolvedAudience) {
    questions.targetAudience = {
      type: "choice",
      instructions: "Audience",
      criteria: {
        unisex: "All",
        men: "Men",
        women: "Women",
        kids: "Kids",
      },
    };
  }

  const response = await callJevDecisions(statePayload, questions, {
    model: DEFAULT_JEV_MODEL,
    timeoutMs: 4000,
  });

  if (!response?.answers) {
    return null;
  }

  const categoryAnswer = response.answers.category as JevChoiceAnswer | undefined;
  const audienceAnswer = response.answers.targetAudience as JevChoiceAnswer | undefined;

  if (!categoryAnswer || categoryAnswer.type !== "choice" || !categoryAnswer.choice) {
    return null;
  }

  // Validate category matches known taxonomy
  let matchedCategory: ProductCategory = "General & Other";
  if (PRODUCT_CATEGORIES.includes(categoryAnswer.choice as ProductCategory)) {
    matchedCategory = categoryAnswer.choice as ProductCategory;
  } else {
    const found = PRODUCT_CATEGORIES.find(
      (c) => c.toLowerCase() === categoryAnswer.choice.toLowerCase()
    );
    if (found) matchedCategory = found;
  }

  // Audience resolution
  const validAudiences = ["unisex", "men", "women", "kids"] as const;
  const targetAudience =
    resolvedAudience ||
    (validAudiences.includes(audienceAnswer?.choice?.toLowerCase() as any)
      ? (audienceAnswer!.choice.toLowerCase() as "unisex" | "men" | "women" | "kids")
      : "unisex");

  const subCategory = deriveSubCategory(cleanTitle, matchedCategory);

  return {
    category: matchedCategory,
    subCategory,
    targetAudience,
    modelUsed: response.model || DEFAULT_JEV_MODEL,
    confidence: categoryAnswer.confidence ?? 1.0,
  };
}

/**
 * Fast noise gatekeeper: evaluates whether an extracted scraped title is a real
 * physical e-commerce product or non-product scrap junk (e.g. Terms of Service, Cart, Support).
 * Ultra-lean prompt for minimal input billing tokens.
 */
export async function filterJunkWithJev(
  title: string
): Promise<{ isProduct: boolean; probability: number; modelUsed: string } | null> {
  const cleanTitle = (title || "").trim();
  if (!cleanTitle) return { isProduct: false, probability: 0, modelUsed: "empty_check" };

  const response = await callJevDecisions(
    {
      title: cleanTitle.slice(0, 80),
    },
    {
      is_product: {
        type: "noul",
        instructions: "Is this a physical retail product? (False for policy, cart, FAQ, terms)",
      },
    },
    { timeoutMs: 3000 }
  );

  const answer = response?.answers?.is_product as JevNoulAnswer | undefined;
  if (!answer || typeof answer.noul !== "number") {
    return null;
  }

  return {
    isProduct: answer.noul >= 0.5,
    probability: answer.noul,
    modelUsed: response?.model || DEFAULT_JEV_MODEL,
  };
}

/**
 * Hybrid 0-Credit Noise Gatekeeper:
 * Evaluates whether an extracted scraped page is a genuine e-commerce product or non-product junk.
 * - Layer 1 ($0): Deterministic regex on title and URL for obvious junk (policies, FAQ, cart, account).
 * - Layer 2 ($0): Deterministic regex for obvious products (has price > 0, product URL slug, title > 12 chars).
 * - Layer 3 (Ultra-lean tokens): Jev Noul gatekeeper only for ambiguous edge cases.
 */
export async function validateProductWithGatekeeper(
  title?: string | null,
  url?: string | null,
  currentPrice?: string | null
): Promise<{ isProduct: boolean; reason?: string; probability?: number }> {
  const cleanTitle = (title || "").trim();
  if (!cleanTitle || cleanTitle.length < 2) {
    return { isProduct: false, reason: "Title is missing or empty" };
  }

  const titleLower = cleanTitle.toLowerCase();
  const urlLower = (url || "").toLowerCase();

  // Layer 1 ($0 cost): Deterministic junk patterns
  const isObviousJunk =
    /(?:politique|mentions l[eé]gales|conditions g[eé]n[eé]rales|cgv|cgu|confidentialit[eé]|privacy policy|terms of (?:service|use)|termes et conditions|faq|support client|contactez-nous|contact us|panier d'achat|mon panier|checkout|cart|mon compte|my account|connexion|login|shipping policy|livraison et retours|politique de retour|avis clients|qui sommes-nous|about us)/i.test(
      titleLower
    ) ||
    /\/(?:policies|pages\/(?:contact|faq|terms|privacy|cgv|about|shipping|retours)|cart|checkout|account)\b/i.test(
      urlLower
    );

  if (isObviousJunk) {
    return {
      isProduct: false,
      reason: "Matched non-product legal/navigation pattern (deterministic regex)",
    };
  }

  // Layer 2 ($0 cost): Clear product indicators
  const hasValidPrice = Boolean(currentPrice && /[1-9]/.test(currentPrice));
  const hasProductSlug = /\/(?:products?|items?|item|p|dp)\//i.test(urlLower);

  if (hasValidPrice && hasProductSlug && cleanTitle.length >= 10) {
    return {
      isProduct: true,
      reason: "Confirmed product from price and product URL slug",
    };
  }

  // Layer 3 (Micro-tokens): Ambiguous edge-case (e.g. root domain, 0 price, or short title) -> Call Jev Noul
  const jevCheck = await filterJunkWithJev(cleanTitle);
  if (!jevCheck) {
    // If Jev is offline or OpenRouter key missing, fallback safely
    return {
      isProduct: true,
      reason: "Gatekeeper fallback pass (AI check unavailable)",
    };
  }

  if (!jevCheck.isProduct || jevCheck.probability < 0.35) {
    return {
      isProduct: false,
      reason: `AI gatekeeper identified non-product (${Math.round((1 - jevCheck.probability) * 100)}% confidence)`,
      probability: jevCheck.probability,
    };
  }

  return {
    isProduct: true,
    reason: "Passed AI gatekeeper check",
    probability: jevCheck.probability,
  };
}


