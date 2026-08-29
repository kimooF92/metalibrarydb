import { db } from "@/db";
import { trackedPages, scanHistory, scrapedProducts, ads, adObservations } from "@/db/schema";
import { eq, desc, or } from "drizzle-orm";
import { getCleanDomain } from "./utils";

export type DossierPersona = "strategic" | "media_buyer" | "product_scout" | "counter_intel";

export interface DossierMetadata {
  pageId: string;
  trackedPageUuid: string;
  displayName: string;
  url: string;
  country: string;
  currentResults: number;
  totalScans: number;
  totalProducts: number;
  totalAdsObserved: number;
  persona: DossierPersona;
  generatedAt: string;
}

export interface DossierExportResult {
  markdownPrompt: string;
  meta: DossierMetadata;
}

const PERSONA_CONFIG: Record<
  DossierPersona,
  {
    title: string;
    roleDescription: string;
    analysisDirectives: string[];
  }
> = {
  strategic: {
    title: "Strategic E-Commerce & Market Analyst",
    roleDescription:
      "You are a Senior Strategic E-Commerce & Market Growth Analyst specializing in direct-to-consumer (D2C) brand trajectories, scaling momentum, and competitive market positioning.",
    analysisDirectives: [
      "1. **Market Health & Growth Phase Assessment**: Determine whether this brand is in Aggressive Scaling, Steady Growth, Mature Plateau, or Churn/Decline. Assign a Market Health Score from 0 to 100 with clear reasoning.",
      "2. **Ad Scaling Velocity & Budget Trend**: Evaluate the historical ad count velocity. Does the scaling curve indicate reliable customer acquisition economics or volatile budget bursts?",
      "3. **Product Catalog & Niche Strategy**: Analyze their product portfolio. Are they a focused single-niche specialist or a broad catalog tester? Which categories receive the highest investment?",
      "4. **Offer Economics & Value Proposition**: Assess pricing tier, discount depth, and offer positioning relative to competitive market benchmarks.",
      "5. **Strategic Recommendations**: What are the top 3 high-impact strategic moves this brand should make next to sustain or accelerate growth?",
    ],
  },
  media_buyer: {
    title: "Senior Meta Media Buyer & Creative Strategist",
    roleDescription:
      "You are an elite Meta Media Buyer and Creative Director with deep expertise in ad fatigue diagnosis, creative testing frameworks, media spend efficiency, and creative iteration cycles.",
    analysisDirectives: [
      "1. **Creative Fatigue & Churn Diagnostic**: Evaluate the creative lifespan and churn rate. Are ads burning out quickly (under 10 days) or sustaining evergreen longevity (30+ days)?",
      "2. **Media Mix & Format Allocation**: Analyze the ratio of Video vs. Image vs. Carousel. What does this reveal about their video production capacity and hook testing framework?",
      "3. **Call-To-Action & Conversion Funnel Dynamics**: Assess CTA choices (e.g. 'Shop Now' vs 'WhatsApp / Direct Message' vs 'Order Now') and conversion friction for their target market.",
      "4. **Creative Angle & Hook Recommendations**: Based on top products and niches, identify 3 high-converting creative angles, hooks, or visual formats they should test next.",
      "5. **Budget Scaling Directives**: How should a media buyer scale budgets across top winning products without triggering rapid creative fatigue?",
    ],
  },
  product_scout: {
    title: "E-Commerce Product Hunter & Dropshipping Scout",
    roleDescription:
      "You are an expert E-Commerce Product Hunter and Dropshipping Sourcing Specialist skilled at detecting breakout winner products, niche demand surges, and margin viability.",
    analysisDirectives: [
      "1. **Breakout Product Identification**: Identify the highest-potential 'winner' products in this catalog based on launch timing, ad count velocity, and offer mechanics.",
      "2. **Niche & Sub-Category Momentum**: Which specific niches or sub-categories show the strongest commercial signals and consumer demand?",
      "3. **Price Elasticity & Margin Evaluation**: Analyze the price distribution, original vs. current pricing, and estimated gross margin sustainability for D2C/e-commerce.",
      "4. **Sourcing & Supplier Feasibility**: Assess potential supply chain angles, product bundling opportunities, or white-labeling differentiators for the winning items.",
      "5. **Testing Roadmap**: If launching a competing store today, which 2-3 products from this portfolio should be prioritized for immediate testing?",
    ],
  },
  counter_intel: {
    title: "Competitive Intelligence & Counter-Strategy Specialist",
    roleDescription:
      "You are a Tactical Competitive Intelligence Specialist focused on identifying competitor vulnerabilities, market blind spots, and counter-positioning strategies to win market share.",
    analysisDirectives: [
      "1. **Competitor Vulnerability Audit**: Identify key weaknesses in their current catalog, pricing, creative execution, or delivery positioning.",
      "2. **Market Blind Spots**: What related product angles, sub-niches, or customer segments is this brand currently neglecting?",
      "3. **Counter-Positioning Attack Angles**: If launching a direct competitor campaign, how can an agile brand out-convert this competitor on Meta ads?",
      "4. **Offer Supremacy**: How can you construct a superior offer (better bundle, warranty, faster delivery, or risk-reversal) to steal their existing buyer traffic?",
      "5. **Defensive Prediction**: What counter-moves or seasonal pivots will this brand likely attempt over the next 30 to 60 days?",
    ],
  },
};

const isUuid = (str: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

/**
 * Builds a prompt-ready Brand Dossier Markdown document for a single tracked page.
 */
export async function generateBrandDossierPrompt(
  targetId: string,
  personaKey: DossierPersona = "strategic"
): Promise<DossierExportResult> {
  const persona: DossierPersona = PERSONA_CONFIG[personaKey] ? personaKey : "strategic";
  const personaConfig = PERSONA_CONFIG[persona];
  const decodedId = decodeURIComponent(targetId).trim();

  // 1. Fetch Tracked Page
  let trackedPage: any = null;
  if (isUuid(decodedId)) {
    trackedPage = await db.query.trackedPages.findFirst({
      where: eq(trackedPages.id, decodedId),
    });
  }

  if (!trackedPage) {
    trackedPage = await db.query.trackedPages.findFirst({
      where: eq(trackedPages.pageId, decodedId),
    });
  }

  if (!trackedPage) {
    throw new Error(`Tracked page '${decodedId}' not found`);
  }

  const pageId = trackedPage.pageId || decodedId;
  const displayName = trackedPage.displayName || `Brand ${pageId}`;
  const brandDomain = getCleanDomain(trackedPage.landingPage || trackedPage.url);

  // 2. Fetch Scan History (Ad velocity over time, up to 60 records)
  const historyEntries = await db
    .select({
      id: scanHistory.id,
      results: scanHistory.results,
      difference: scanHistory.difference,
      checkedAt: scanHistory.checkedAt,
      status: scanHistory.status,
      failureReason: scanHistory.failureReason,
    })
    .from(scanHistory)
    .where(eq(scanHistory.trackedPageId, trackedPage.id))
    .orderBy(desc(scanHistory.checkedAt))
    .limit(60);

  // 3. Fetch Scraped Products
  const productConditions = [];
  if (pageId) productConditions.push(eq(scrapedProducts.pageId, pageId));
  if (brandDomain) productConditions.push(eq(scrapedProducts.domain, brandDomain));

  let products: any[] = [];
  if (productConditions.length > 0) {
    products = await db
      .select({
        id: scrapedProducts.id,
        url: scrapedProducts.url,
        title: scrapedProducts.title,
        currentPrice: scrapedProducts.currentPrice,
        originalPrice: scrapedProducts.originalPrice,
        currency: scrapedProducts.currency,
        discountOrOffer: scrapedProducts.discountOrOffer,
        category: scrapedProducts.category,
        subCategory: scrapedProducts.subCategory,
        targetAudience: scrapedProducts.targetAudience,
        storePlatform: scrapedProducts.storePlatform,
        deliveryCost: scrapedProducts.deliveryCost,
        createdAt: scrapedProducts.createdAt,
      })
      .from(scrapedProducts)
      .where(or(...productConditions))
      .orderBy(desc(scrapedProducts.createdAt))
      .limit(40);
  }

  // 4. Fetch Ads & Creative Signals
  const adRows = await db
    .select({
      id: ads.id,
      mediaType: ads.mediaType,
      ctaText: ads.ctaText,
      startedRunningOn: ads.startedRunningOn,
      firstSeenAt: ads.firstSeenAt,
      lastSeenAt: ads.lastSeenAt,
      isArchived: ads.isArchived,
      duplicationCount: adObservations.duplicationCount,
      isActive: adObservations.isActive,
    })
    .from(ads)
    .innerJoin(adObservations, eq(ads.id, adObservations.adId))
    .where(
      or(
        eq(ads.pageId, pageId),
        eq(adObservations.trackedPageId, trackedPage.id)
      )
    )
    .orderBy(desc(ads.lastSeenAt))
    .limit(100);

  // De-duplicate ads by ad.id
  const uniqueAdsMap = new Map<string, (typeof adRows)[0]>();
  for (const row of adRows) {
    if (!uniqueAdsMap.has(row.id)) {
      uniqueAdsMap.set(row.id, row);
    }
  }
  const uniqueAds = Array.from(uniqueAdsMap.values());

  // ----------------------------------------------------
  // 5. PRE-COMPUTE NARRATIVE INTELLIGENCE SIGNALS
  // ----------------------------------------------------
  const currentAdCount = trackedPage.currentResults ?? (historyEntries[0]?.results ?? uniqueAds.length);

  // Velocity & Scaling Phase Detection
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const recentScans = historyEntries.filter(
    (h) => h.checkedAt && new Date(h.checkedAt) >= fourteenDaysAgo && h.results !== null
  );

  let phaseAssessment = "ACCUMULATING_BASELINE";
  let netDelta14d = 0;

  if (historyEntries.length >= 2) {
    const oldestRecent = recentScans[recentScans.length - 1];
    const latestRecent = recentScans[0];

    if (oldestRecent && latestRecent && oldestRecent.results !== null && latestRecent.results !== null) {
      netDelta14d = latestRecent.results - oldestRecent.results;
      const baseCount = Math.max(1, oldestRecent.results);
      const percentChange = (netDelta14d / baseCount) * 100;

      if (netDelta14d >= 5 || percentChange >= 25) {
        phaseAssessment = "AGGRESSIVE_SCALING 🚀 (Rapid Ad Count Surge)";
      } else if (netDelta14d > 0) {
        phaseAssessment = "INCREMENTAL_SCALING 🟢 (Steady Positive Trajectory)";
      } else if (netDelta14d === 0) {
        phaseAssessment = "STABLE ⚪ (Consistent Ad Volume)";
      } else if (netDelta14d <= -5 || percentChange <= -25) {
        phaseAssessment = "HEAVY_DESCALING 🔴 (Significant Ad Trimming / Fatigue)";
      } else {
        phaseAssessment = "MILD_DESCALING 🟡 (Slight Negative Delta)";
      }
    }
  } else if (historyEntries.length === 1) {
    phaseAssessment = "INITIAL_MONITORING ⏱️ (Baseline Scan Recorded)";
  }

  // Creative Mix Ratios
  let videoCount = 0;
  let imageCount = 0;
  let carouselCount = 0;
  let activeAdsCount = 0;
  const ctaFrequency: Record<string, number> = {};
  const lifespans: number[] = [];
  const nowTime = Date.now();

  for (const ad of uniqueAds) {
    if (ad.mediaType === "video") videoCount++;
    else if (ad.mediaType === "image") imageCount++;
    else if (ad.mediaType === "carousel") carouselCount++;

    if (ad.isActive !== false && !ad.isArchived) {
      activeAdsCount++;
    }

    if (ad.ctaText) {
      const ctaClean = ad.ctaText.trim();
      if (ctaClean) {
        ctaFrequency[ctaClean] = (ctaFrequency[ctaClean] || 0) + 1;
      }
    }

    const launchDate = ad.startedRunningOn || ad.firstSeenAt;
    if (launchDate) {
      const days = Math.max(0, Math.round((nowTime - new Date(launchDate).getTime()) / (1000 * 60 * 60 * 24)));
      lifespans.push(days);
    }
  }

  const totalFormatAds = Math.max(1, videoCount + imageCount + carouselCount);
  const videoPercent = Math.round((videoCount / totalFormatAds) * 100);
  const imagePercent = Math.round((imageCount / totalFormatAds) * 100);
  const carouselPercent = Math.round((carouselCount / totalFormatAds) * 100);

  const avgLifespanDays =
    lifespans.length > 0 ? Math.round(lifespans.reduce((a, b) => a + b, 0) / lifespans.length) : null;

  const topCtas = Object.entries(ctaFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([cta, cnt]) => `"${cta}" (${cnt})`);

  // Product Catalog Metrics
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const newProducts7d = products.filter((p) => p.createdAt && new Date(p.createdAt) >= sevenDaysAgo).length;
  const newProducts30d = products.filter((p) => p.createdAt && new Date(p.createdAt) >= thirtyDaysAgo).length;

  const productsWithOffers = products.filter(
    (p) => p.discountOrOffer && p.discountOrOffer.trim() !== ""
  ).length;
  const discountRate = products.length > 0 ? Math.round((productsWithOffers / products.length) * 100) : 0;

  // Niche breakdown
  const categoryCounts: Record<string, number> = {};
  const subCategoryCounts: Record<string, number> = {};

  for (const prod of products) {
    const cat = prod.category?.trim() || "Uncategorized";
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    if (prod.subCategory?.trim()) {
      const sub = prod.subCategory.trim();
      subCategoryCounts[sub] = (subCategoryCounts[sub] || 0) + 1;
    }
  }

  const sortedCategories = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]);
  const sortedSubCategories = Object.entries(subCategoryCounts).sort((a, b) => b[1] - a[1]);

  // Primary Platform & Delivery Cost
  const platforms = Array.from(
    new Set(products.map((p) => p.storePlatform).filter((x): x is string => Boolean(x)))
  );
  const primaryPlatform = platforms.length > 0 ? platforms.join(", ") : "Custom / Unspecified";

  // First & Last Observation Dates
  const trackingStart = trackedPage.createdAt
    ? new Date(trackedPage.createdAt).toISOString().split("T")[0]
    : "Unknown";
  const lastScanned = trackedPage.lastChecked
    ? new Date(trackedPage.lastChecked).toISOString().split("T")[0]
    : "Live";

  // ----------------------------------------------------
  // 6. ASSEMBLE MARKDOWN PROMPT
  // ----------------------------------------------------
  const promptLines: string[] = [];

  // Header / System Persona
  promptLines.push(`# SYSTEM DIRECTIVE: META AD & BRAND INTELLIGENCE AUDIT`);
  promptLines.push(``);
  promptLines.push(`**Analyst Persona**: ${personaConfig.title}`);
  promptLines.push(`${personaConfig.roleDescription}`);
  promptLines.push(``);
  promptLines.push(`You are provided with real, verified time-series data and ad surveillance telemetry for **${displayName}**.`);
  promptLines.push(`Analyze this data rigorously and generate an actionable intelligence report following the directives specified in Section 7.`);
  promptLines.push(``);
  promptLines.push(`---`);
  promptLines.push(``);

  // Section 1: Brand & Operational Overview
  promptLines.push(`## 1. BRAND & TRACKING PROFILE`);
  promptLines.push(`- **Brand Display Name**: ${displayName}`);
  promptLines.push(`- **Meta Page ID**: \`${pageId}\``);
  promptLines.push(`- **Ad Library URL**: ${trackedPage.url}`);
  if (trackedPage.landingPage) {
    promptLines.push(`- **Official Store / Landing Page**: ${trackedPage.landingPage}`);
  }
  promptLines.push(`- **Target Market / Country**: ${trackedPage.country || "TN (Tunisia / Regional)"}`);
  promptLines.push(`- **Tracking Window**: ${trackingStart} → ${lastScanned}`);
  promptLines.push(`- **Current Active Ad Count**: **${currentAdCount}** ads`);
  promptLines.push(`- **Total Scraped Products Detected**: **${products.length}** SKUs`);
  promptLines.push(`- **Store Platform / Tech Stack**: ${primaryPlatform}`);
  promptLines.push(``);
  promptLines.push(`---`);
  promptLines.push(``);

  // Section 2: Temporal Context & Pre-Computed Signals
  promptLines.push(`## 2. COMPUTED INTELLIGENCE SIGNALS`);
  promptLines.push(`- **Observed Scaling Phase**: ${phaseAssessment}`);
  promptLines.push(`- **14-Day Net Ad Count Delta**: ${netDelta14d >= 0 ? `+${netDelta14d}` : netDelta14d} ads`);
  promptLines.push(`- **Creative Churn & Longevity**: ${avgLifespanDays !== null ? `Average active creative age is ~${avgLifespanDays} days` : "Accumulating lifespan baseline"}${avgLifespanDays !== null && avgLifespanDays <= 10 ? " ⚠️ (High creative churn / rapid fatigue)" : ""}`);
  promptLines.push(`- **Product Testing Cadence**: **${newProducts7d}** new products in last 7 days | **${newProducts30d}** new products in last 30 days`);
  promptLines.push(`- **Discount & Offer Aggressiveness**: **${discountRate}%** of products carry explicit discounts, bundles, or promo offers`);
  promptLines.push(``);
  promptLines.push(`---`);
  promptLines.push(``);

  // Section 3: Ad Velocity Timeline Table
  promptLines.push(`## 3. CHRONOLOGICAL AD VELOCITY TIMELINE`);
  if (historyEntries.length === 0) {
    promptLines.push(`*No historical scan records logged yet. Tracking recently initialized.*`);
  } else {
    promptLines.push(`| Date (UTC) | Active Ad Count | Net Delta | Scan Status | Indicator |`);
    promptLines.push(`| :--- | :--- | :--- | :--- | :--- |`);
    for (const h of historyEntries) {
      const dateStr = h.checkedAt ? new Date(h.checkedAt).toISOString().replace("T", " ").slice(0, 16) : "—";
      const resultsStr = h.results !== null ? String(h.results) : "—";
      const diff = h.difference;
      let diffStr = "0";
      let indicator = "⚪ Stable";

      if (diff !== null && diff !== undefined && diff !== 0) {
        if (diff > 0) {
          diffStr = `+${diff}`;
          indicator = diff >= 5 ? "🚀 Major Scale" : "🟢 Scaling";
        } else {
          diffStr = `${diff}`;
          indicator = diff <= -5 ? "🔴 Heavy Descale" : "🟡 Descaling";
        }
      }
      const statusStr = h.status || "success";
      promptLines.push(`| ${dateStr} | ${resultsStr} | ${diffStr} | ${statusStr} | ${indicator} |`);
    }
  }
  promptLines.push(``);
  promptLines.push(`---`);
  promptLines.push(``);

  // Section 4: Product Catalog Timeline Table
  promptLines.push(`## 4. PRODUCT CATALOG & LAUNCH TIMELINE`);
  if (products.length === 0) {
    promptLines.push(`*No scraped product records detected for this brand yet. (Run an Ad Spy & Product Extraction scan to populate)*`);
  } else {
    promptLines.push(`| First Seen | Product Title | Niche / Category | Price | Offer / Promo | Platform |`);
    promptLines.push(`| :--- | :--- | :--- | :--- | :--- | :--- |`);
    for (const p of products.slice(0, 30)) {
      const seenDate = p.createdAt ? new Date(p.createdAt).toISOString().split("T")[0] : "—";
      const title = (p.title || "Untitled Product").replace(/\|/g, "-").slice(0, 45);
      const category = (p.subCategory || p.category || "General").replace(/\|/g, "-");
      const price = p.currentPrice ? `${p.currentPrice} ${p.currency || ""}`.trim() : "Unspecified";
      const offer = (p.discountOrOffer || "None").replace(/\|/g, "-").slice(0, 35);
      const platform = p.storePlatform || "—";
      promptLines.push(`| ${seenDate} | ${title} | ${category} | ${price} | ${offer} | ${platform} |`);
    }
    if (products.length > 30) {
      promptLines.push(`*... plus ${products.length - 30} additional products tracked in database.*`);
    }
  }
  promptLines.push(``);
  promptLines.push(`---`);
  promptLines.push(``);

  // Section 5: Niche & Sub-Niche Breakdown
  promptLines.push(`## 5. NICHE & SUB-CATEGORY COMPOSITION`);
  if (sortedCategories.length === 0) {
    promptLines.push(`*Niche classification will populate automatically as product URLs are extracted.*`);
  } else {
    promptLines.push(`### Main Categories:`);
    for (const [cat, cnt] of sortedCategories) {
      const pct = Math.round((cnt / products.length) * 100);
      promptLines.push(`- **${cat}**: ${cnt} products (${pct}%)`);
    }
    if (sortedSubCategories.length > 0) {
      promptLines.push(``);
      promptLines.push(`### Focused Sub-Niches:`);
      for (const [sub, cnt] of sortedSubCategories.slice(0, 6)) {
        promptLines.push(`- **${sub}**: ${cnt} items`);
      }
    }
  }
  promptLines.push(``);
  promptLines.push(`---`);
  promptLines.push(``);

  // Section 6: Creative Format & CTA Signals
  promptLines.push(`## 6. CREATIVE FORMAT & CTA INTELLIGENCE`);
  promptLines.push(`- **Format Allocation**: ${videoPercent}% Video | ${imagePercent}% Static Image | ${carouselPercent}% Carousel`);
  promptLines.push(`- **Active vs Total Ads Sample**: ${activeAdsCount} Active / ${uniqueAds.length} Unique Monitored Ads`);
  promptLines.push(`- **Dominant Calls to Action**: ${topCtas.length > 0 ? topCtas.join(", ") : "Standard 'Shop Now' / 'Order'"}`);
  promptLines.push(``);
  promptLines.push(`---`);
  promptLines.push(``);

  // Section 7: Required Analysis Directives
  promptLines.push(`## 7. REQUIRED ANALYSIS & REPORTING DIRECTIVES`);
  promptLines.push(`Please evaluate the telemetry provided above and formulate a professional, grounded report answering the following sections:`);
  promptLines.push(``);
  for (const directive of personaConfig.analysisDirectives) {
    promptLines.push(directive);
    promptLines.push(``);
  }
  promptLines.push(`Ensure all observations quote exact figures (e.g. ad counts, dates, prices, and deltas) from the provided tables without making ungrounded assumptions.`);

  const markdownPrompt = promptLines.join("\n");

  const meta: DossierMetadata = {
    pageId,
    trackedPageUuid: trackedPage.id,
    displayName,
    url: trackedPage.url,
    country: trackedPage.country || "TN",
    currentResults: currentAdCount,
    totalScans: historyEntries.length,
    totalProducts: products.length,
    totalAdsObserved: uniqueAds.length,
    persona,
    generatedAt: new Date().toISOString(),
  };

  return {
    markdownPrompt,
    meta,
  };
}
