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
}

// In-memory cache for categorized titles (avoids redundant API requests)
const categoryCache = new Map<string, ProductClassificationResult>();

// 3 Best Free Models on OpenRouter (in cascade priority order)
const AI_MODELS = [
  "nvidia/nemotron-3.5-lightning:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "minimax/minimax-m2.7:free",
];

/**
 * Deterministic offline rule-based fallback (French, Arabic, English e-commerce keywords).
 * Runs instantly if OpenRouter is unreachable, rate-limited, or API key is not configured.
 */
export function classifyProductOffline(title: string): ProductClassificationResult {
  const text = (title || "").toLowerCase();

  // 1. Electronics & Tech
  if (
    /(tablette|phone|ecouteur|écouteur|casque|montre connect|smartwatch|airpod|bluetooth|chargeur|cable|powerbank|camera|caméra|souris|clavier|laptop|pc|projecteur|speaker|baffle|tv|ring light|support telephone|micro|usb|wifi|led rgb|smart watch|rechargeable|haut-parleur|سماعات|ساعة ذكية|هاتف|شاحن|كاميرا|طابليت)/i.test(
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
    /(creme|crème|serum|sérum|visage|cheveux|shampoing|masque|parfum|savon|huile|epilateur|épilateur|brosse lissante|sechoir|sèche-cheveux|tondeuse|dent|massage|minceur|peau|anti-rides|rouge a levres|maquillage|soin|barbe|cire|anti-chute|acné|glow|collagene|vitamine|عناية|شعر|بشرة|كريم|عطر|ماكياج|مساج|تجميل)/i.test(
      text
    )
  ) {
    let sub = "Skincare & Body";
    let audience: "unisex" | "men" | "women" = "unisex";
    if (/barbe|homme|tondeuse barbe/i.test(text)) {
      sub = "Men's Grooming";
      audience = "men";
    } else if (/maquillage|rouge a levres|anti-rides|lissante|epilateur/i.test(text)) {
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
    /(robe|chemise|pantalon|t-shirt|pull|veste|manteau|chaussure|sneaker|basket|sac|sacoche|portefeuille|bague|collier|bracelet|bijoux|lunette|ceinture|montre classique|talons|lingerie|pyjama|sandale|hoodie|jean|ملابس|حذاء|حقيبة|فستان|مجوهرات|سروال|قميص)/i.test(
      text
    )
  ) {
    let audience: "unisex" | "men" | "women" = "unisex";
    if (/robe|lingerie|talons|femme|sac a main/i.test(text)) audience = "women";
    else if (/homme|costume|chemise homme/i.test(text)) audience = "men";

    return {
      category: "Fashion & Jewelry",
      subCategory: "Apparel & Accessories",
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
    /(bebe|bébé|enfant|jouet|jeu|peluche|poussette|biberon|doudou|trottinette|scooter enfant|educatif|éducatif|dessin|magic board|puzzle|montessori|أطفال|ألعاب|رضيع)/i.test(
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
 * Parses and validates LLM JSON or reasoning output to standard taxonomy
 */
function parseAiResponse(rawContent: string | null | undefined, modelUsed: string): ProductClassificationResult | null {
  if (!rawContent) return null;
  
  // 1. Try extracting structured JSON
  try {
    let jsonStr = rawContent
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    // If not clean JSON, extract the JSON object with regex
    if (!jsonStr.startsWith("{") || !jsonStr.endsWith("}")) {
      const match = jsonStr.match(/\{[\s\S]*?"category"[\s\S]*?\}/);
      if (match) {
        jsonStr = match[0];
      }
    }

    if (jsonStr.startsWith("{") && jsonStr.endsWith("}")) {
      const parsed = JSON.parse(jsonStr);

      let matchedCategory: ProductCategory = "General & Other";
      if (parsed.category) {
        const found = PRODUCT_CATEGORIES.find(
          (c) => c.toLowerCase() === parsed.category.toLowerCase()
        );
        if (found) {
          matchedCategory = found;
        } else {
          matchedCategory = mapStringToCategory(parsed.category);
        }
      }

      const validAudiences = ["unisex", "men", "women", "kids"] as const;
      const audience = validAudiences.includes(parsed.targetAudience?.toLowerCase())
        ? (parsed.targetAudience.toLowerCase() as "unisex" | "men" | "women" | "kids")
        : "unisex";

      return {
        category: matchedCategory,
        subCategory: parsed.subCategory || "General",
        targetAudience: audience,
        modelUsed,
      };
    }
  } catch (err) {
    // Continue to reasoning extraction
  }

  // 2. Extract classification from reasoning text if JSON parsing failed
  const lower = rawContent.toLowerCase();
  let matchedCat: ProductCategory = "General & Other";
  let matchedSub = "General";
  let audience: "unisex" | "men" | "women" | "kids" = "unisex";

  if (lower.includes("beauty, health & care") || lower.includes("beauty") || lower.includes("hair styling") || lower.includes("straighten") || lower.includes("skincare")) {
    matchedCat = "Beauty, Health & Care";
    matchedSub = "Personal Care & Beauty";
    if (lower.includes("women") || lower.includes("female")) audience = "women";
  } else if (lower.includes("kids, baby & toys") || lower.includes("toy") || lower.includes("children") || lower.includes("building blocks")) {
    matchedCat = "Kids, Baby & Toys";
    matchedSub = "Toys & Kids";
    audience = "kids";
  } else if (lower.includes("automotive & tools") || lower.includes("angle grinder") || lower.includes("power tool") || lower.includes("car charger") || lower.includes("automotive")) {
    matchedCat = "Automotive & Tools";
    matchedSub = "Tools & Automotive";
  } else if (lower.includes("fashion & jewelry") || lower.includes("waist trainer") || lower.includes("corset") || lower.includes("shapewear") || lower.includes("apparel") || lower.includes("clothing")) {
    matchedCat = "Fashion & Jewelry";
    matchedSub = "Shapewear & Apparel";
    if (lower.includes("women") || lower.includes("female")) audience = "women";
  } else if (lower.includes("electronics & tech") || lower.includes("electronic") || lower.includes("gadget") || lower.includes("audio")) {
    matchedCat = "Electronics & Tech";
    matchedSub = "Gadgets & Tech";
  } else if (lower.includes("sports, fitness & outdoor") || lower.includes("fitness") || lower.includes("workout")) {
    matchedCat = "Sports, Fitness & Outdoor";
    matchedSub = "Fitness & Exercise";
  } else if (lower.includes("home, kitchen & living") || lower.includes("kitchen") || lower.includes("home appliance")) {
    matchedCat = "Home, Kitchen & Living";
    matchedSub = "Home & Kitchen";
  } else {
    return null;
  }

  return {
    category: matchedCat,
    subCategory: matchedSub,
    targetAudience: audience,
    modelUsed,
  };
}

function mapStringToCategory(text: string): ProductCategory {
  const lower = (text || "").toLowerCase();
  if (lower.includes("electr") || lower.includes("tech") || lower.includes("gadget") || lower.includes("phone")) {
    return "Electronics & Tech";
  } else if (lower.includes("beaut") || lower.includes("health") || lower.includes("care") || lower.includes("soin") || lower.includes("cosmetic")) {
    return "Beauty, Health & Care";
  } else if (lower.includes("home") || lower.includes("kitchen") || lower.includes("living") || lower.includes("maison") || lower.includes("cuisine")) {
    return "Home, Kitchen & Living";
  } else if (lower.includes("fashion") || lower.includes("cloth") || lower.includes("jewelry") || lower.includes("apparel") || lower.includes("mode") || lower.includes("vetement") || lower.includes("shapewear")) {
    return "Fashion & Jewelry";
  } else if (lower.includes("sport") || lower.includes("fit") || lower.includes("outdoor")) {
    return "Sports, Fitness & Outdoor";
  } else if (lower.includes("kid") || lower.includes("baby") || lower.includes("toy") || lower.includes("enfant")) {
    return "Kids, Baby & Toys";
  } else if (lower.includes("auto") || lower.includes("car") || lower.includes("tool") || lower.includes("voiture") || lower.includes("outil")) {
    return "Automotive & Tools";
  }
  return "General & Other";
}

/**
 * Classifies a product using OpenRouter's 3 best free models with automatic failover.
 */
export async function classifyProductWithAI(
  productTitle: string,
  extraContext?: { domain?: string | null; brandName?: string | null; adText?: string | null }
): Promise<ProductClassificationResult> {
  const cleanTitle = (productTitle || "").trim();
  if (!cleanTitle || cleanTitle.length < 2) {
    return {
      category: "General & Other",
      subCategory: "General Merchandise",
      targetAudience: "unisex",
      modelUsed: "empty_title",
    };
  }

  // Check cache
  const cacheKey = cleanTitle.toLowerCase();
  if (categoryCache.has(cacheKey)) {
    return categoryCache.get(cacheKey)!;
  }

  const openRouterKey = process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  const openAiKey = process.env.OPENAI_API_KEY;

  const systemPrompt = `You are a high-speed e-commerce product catalog classifier.
Classify the product into EXACTLY ONE valid category from this list:
["Electronics & Tech", "Beauty, Health & Care", "Home, Kitchen & Living", "Fashion & Jewelry", "Sports, Fitness & Outdoor", "Kids, Baby & Toys", "Automotive & Tools", "General & Other"].

You must respond ONLY with raw, valid JSON in this exact structure:
{
  "category": "One of the allowed categories above",
  "subCategory": "Concise 2-3 word subcategory (e.g. Smartwatches, Hair Care, Car Accessories)",
  "targetAudience": "unisex" | "men" | "women" | "kids"
}`;

  const userContent = `Title: "${cleanTitle}"${
    extraContext?.domain ? ` | Store: ${extraContext.domain}` : ""
  }${extraContext?.adText ? ` | Ad Context: ${extraContext.adText.slice(0, 150)}` : ""}`;

  // 1. If OpenRouter Key is provided (Dual-Layer Fallback across 3 free models)
  if (openRouterKey && openRouterKey.trim() !== "") {
    for (const currentModel of AI_MODELS) {
      try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openRouterKey.trim()}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://ad-library-tracker.local",
            "X-Title": "Meta Ad Tracker Product Categorizer",
          },
          body: JSON.stringify({
            model: currentModel,
            models: AI_MODELS, // OpenRouter native instant server-side cascade
            reasoning: { max_tokens: 0 },
            temperature: 0.1,
            max_tokens: 150,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userContent },
            ],
            response_format: { type: "json_object" },
          }),
          signal: AbortSignal.timeout(6000),
        });

        if (response.ok) {
          const data = await response.json();
          const rawContent = data.choices?.[0]?.message?.content || data.choices?.[0]?.message?.reasoning;
          const modelUsed = data.model || currentModel;
          const res = parseAiResponse(rawContent, modelUsed);
          if (res) {
            categoryCache.set(cacheKey, res);
            return res;
          }
        }
      } catch (e: any) {
        // Continue to next model in cascade
      }
    }
  }

  // 2. If Direct Google Gemini Key is provided
  if (geminiKey && geminiKey.trim() !== "") {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey.trim()}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: `${systemPrompt}\n\n${userContent}` }],
              },
            ],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.1,
              maxOutputTokens: 120,
            },
          }),
          signal: AbortSignal.timeout(8000),
        }
      );

      if (response.ok) {
        const data = await response.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        const res = parseAiResponse(rawText, "google/gemini-2.0-flash");
        if (res) {
          categoryCache.set(cacheKey, res);
          return res;
        }
      }
    } catch (e: any) {
      console.warn(`[Gemini AI Notice] ${e?.message || "timeout"}`);
    }
  }

  // 3. If Groq Key is provided
  if (groqKey && groqKey.trim() !== "") {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqKey.trim()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          temperature: 0.1,
          max_tokens: 120,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (response.ok) {
        const data = await response.json();
        const rawContent = data.choices?.[0]?.message?.content;
        const res = parseAiResponse(rawContent, "groq/llama-3.3-70b");
        if (res) {
          categoryCache.set(cacheKey, res);
          return res;
        }
      }
    } catch (e: any) {
      console.warn(`[Groq AI Notice] ${e?.message || "timeout"}`);
    }
  }

  // 4. If OpenAI Key is provided
  if (openAiKey && openAiKey.trim() !== "") {
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openAiKey.trim()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.1,
          max_tokens: 120,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (response.ok) {
        const data = await response.json();
        const rawContent = data.choices?.[0]?.message?.content;
        const res = parseAiResponse(rawContent, "openai/gpt-4o-mini");
        if (res) {
          categoryCache.set(cacheKey, res);
          return res;
        }
      }
    } catch (e: any) {
      console.warn(`[OpenAI Notice] ${e?.message || "timeout"}`);
    }
  }

  // Graceful offline fallback
  const fallbackResult = classifyProductOffline(cleanTitle);
  categoryCache.set(cacheKey, fallbackResult);
  return fallbackResult;
}
