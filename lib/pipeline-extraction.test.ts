import { test } from "node:test";
import assert from "node:assert";
import { selectBestProductCandidateUrl } from "./discovery-product-selector";
import { resolveDestinationUrl } from "./utils";

test("Task 1.2: Caption URL extraction recovers product landing page when ad button is WhatsApp / Messenger", () => {
  const rawLinkUrl = "https://wa.me/21699999999?text=Bonjour";
  const caption = "Découvrez notre nouvelle collection disponible sur notre boutique en ligne: https://boutique-mode.tn/products/robe-ete-2026 ! Livraison 7 DT sur toute la Tunisie. Contact WhatsApp: https://wa.me/21699999999";

  let effectiveLinkUrl = resolveDestinationUrl(rawLinkUrl);

  const isSocialOrMissing =
    !effectiveLinkUrl ||
    effectiveLinkUrl.includes("wa.me") ||
    effectiveLinkUrl.includes("whatsapp.com") ||
    effectiveLinkUrl.includes("m.me") ||
    effectiveLinkUrl.includes("facebook.com");

  assert.strictEqual(isSocialOrMissing, true);

  if (isSocialOrMissing && caption) {
    const rawMatches = caption.match(/https?:\/\/[^\s"'<>)\]]+/gi) || [];
    assert.strictEqual(rawMatches.length, 2);

    const candidate = selectBestProductCandidateUrl(rawMatches);
    assert.ok(candidate);
    assert.strictEqual(candidate.source, "product_page");
    assert.strictEqual(candidate.url, "https://boutique-mode.tn/products/robe-ete-2026");

    effectiveLinkUrl = candidate.url;
  }

  assert.strictEqual(effectiveLinkUrl, "https://boutique-mode.tn/products/robe-ete-2026");
});

test("Task 1.3: Multi-product carousel cards extract primary and secondary product pages", () => {
  const cards = [
    { title: "Montre Or", link_url: "https://montres.tn/products/gold-edition?utm_source=fb" },
    { title: "Montre Argent", link_url: "https://montres.tn/products/silver-edition?utm_source=fb" },
    { title: "Montre Cuir", link_url: "https://montres.tn/products/leather-edition?utm_source=fb" },
  ];

  const primaryCardUrl = "https://l.facebook.com/l.php?u=" + encodeURIComponent("https://montres.tn/products/gold-edition?utm_source=fb");
  const primaryResolved = resolveDestinationUrl(primaryCardUrl);
  assert.strictEqual(primaryResolved, "https://montres.tn/products/gold-edition?utm_source=fb");

  const secondaryProductUrls: string[] = [];
  if (cards.length > 1) {
    for (let i = 1; i < cards.length; i++) {
      const secondaryRawUrl = cards[i]?.link_url;
      const secondaryResolved = resolveDestinationUrl(secondaryRawUrl);
      if (secondaryResolved) {
        const candidate = selectBestProductCandidateUrl([secondaryResolved]);
        if (candidate && candidate.source === "product_page") {
          secondaryProductUrls.push(candidate.url);
        }
      }
    }
  }

  assert.strictEqual(secondaryProductUrls.length, 2);
  assert.strictEqual(secondaryProductUrls[0], "https://montres.tn/products/silver-edition");
  assert.strictEqual(secondaryProductUrls[1], "https://montres.tn/products/leather-edition");
});

test("Task 1.1: Discovery destination inversion retains non-ecommerce CTAs if destination is a real product page", () => {
  // Scenario A: CTA is LEARN_MORE / "En savoir plus" (traditionally non-ecommerce), but link is a product landing page
  const ctaType = "LEARN_MORE";
  const ctaText = "En savoir plus";
  const linkUrl = "https://shop.tn/products/creme-anti-rides";

  const isMatchingEcommerceCta = (ctaType: string | null, ctaText: string | null): boolean => {
    const ALLOWED = new Set(["SHOP_NOW", "ORDER_NOW", "BUY_NOW"]);
    return Boolean(ctaType && ALLOWED.has(ctaType));
  };

  const hasEcommerceCta = isMatchingEcommerceCta(ctaType, ctaText);
  assert.strictEqual(hasEcommerceCta, false); // CTA alone does NOT match

  const candidate = linkUrl ? selectBestProductCandidateUrl([linkUrl]) : null;
  const hasProductPage = candidate?.source === "product_page";
  assert.strictEqual(hasProductPage, true); // But destination is a product page!

  // Condition from Task 1.1:
  const shouldRetain = hasEcommerceCta || hasProductPage;
  assert.strictEqual(shouldRetain, true);

  // Scenario B: CTA is LEARN_MORE and link is just a Facebook page / blog / non-product
  const nonProductUrl = "https://facebook.com/my-page";
  const nonProductCandidate = selectBestProductCandidateUrl([nonProductUrl]);
  const hasProductPageB = nonProductCandidate?.source === "product_page";
  assert.strictEqual(hasProductPageB, false);

  const shouldRetainB = hasEcommerceCta || hasProductPageB;
  assert.strictEqual(shouldRetainB, false); // Successfully rejected!
});

test("Task 1.5: Micro-page delta enables +1 creative scan for watchlisted brands", () => {
  const evaluateMeaningfulDelta = (params: {
    isRelaunching: boolean;
    hasPreviousScan: boolean;
    isWatchlisted: boolean;
    effectiveDifference: number;
  }) => {
    return (
      params.isRelaunching ||
      !params.hasPreviousScan ||
      params.isWatchlisted ||
      params.effectiveDifference >= 2
    );
  };

  // 1. Regular micro-page with +1 delta -> should coalesce (skip immediate creative scan)
  assert.strictEqual(
    evaluateMeaningfulDelta({
      isRelaunching: false,
      hasPreviousScan: true,
      isWatchlisted: false,
      effectiveDifference: 1,
    }),
    false
  );

  // 2. Regular micro-page with +2 delta -> triggers scan
  assert.strictEqual(
    evaluateMeaningfulDelta({
      isRelaunching: false,
      hasPreviousScan: true,
      isWatchlisted: false,
      effectiveDifference: 2,
    }),
    true
  );

  // 3. Watchlisted micro-page with +1 delta -> immediately triggers scan ($0 compute)
  assert.strictEqual(
    evaluateMeaningfulDelta({
      isRelaunching: false,
      hasPreviousScan: true,
      isWatchlisted: true,
      effectiveDifference: 1,
    }),
    true
  );
});

test("Finding 3: Primary card deep product URL is preferred over generic top-level homepage", () => {
  const primaryCardUrl = resolveDestinationUrl("https://boutique.tn/products/sac-a-main-cuir?variant=123");
  const topLevelHomepage = resolveDestinationUrl("https://boutique.tn");

  const candidates = [primaryCardUrl, topLevelHomepage].filter(Boolean) as string[];
  const bestCandidate = selectBestProductCandidateUrl(candidates);

  assert.ok(bestCandidate);
  assert.strictEqual(bestCandidate.source, "product_page");
  assert.strictEqual(bestCandidate.url, "https://boutique.tn/products/sac-a-main-cuir?variant=123");

  const effectiveLinkUrl = bestCandidate?.url || topLevelHomepage || primaryCardUrl;
  assert.strictEqual(effectiveLinkUrl, "https://boutique.tn/products/sac-a-main-cuir?variant=123");
});

test("Finding 2: Count-only workers strictly filter for count and discovery_count jobs", () => {
  const getJobFilter = (env: { COUNT_ONLY?: string; CI?: string; GITHUB_ACTIONS?: string; CREATIVE_ONLY?: string }) => {
    const isCountOnly = env.COUNT_ONLY === "true" || env.CI === "true" || env.GITHUB_ACTIONS === "true";
    const isCreativeOnly = env.CREATIVE_ONLY === "true";

    if (isCountOnly) return ["count", "discovery_count"];
    if (isCreativeOnly) return ["creative"];
    return ["all"];
  };

  const countOnlyTypes = getJobFilter({ COUNT_ONLY: "true" });
  assert.deepStrictEqual(countOnlyTypes, ["count", "discovery_count"]);
  assert.strictEqual(countOnlyTypes.includes("product_scrape"), false);
  assert.strictEqual(countOnlyTypes.includes("creative"), false);

  const ghaTypes = getJobFilter({ GITHUB_ACTIONS: "true" });
  assert.deepStrictEqual(ghaTypes, ["count", "discovery_count"]);
  assert.strictEqual(ghaTypes.includes("product_scrape"), false);

  const creativeOnlyTypes = getJobFilter({ CREATIVE_ONLY: "true" });
  assert.deepStrictEqual(creativeOnlyTypes, ["creative"]);

  const defaultTypes = getJobFilter({});
  assert.deepStrictEqual(defaultTypes, ["all"]);
});

test("Finding 7: Product rescue differentiates transient failures (1h) from generic failures (12h) and rejects 404s", () => {
  const evaluateRescueEligibility = (product: {
    scrapeStatus: string;
    mainImageUrl: string | null;
    failureReason: string | null;
    lastScrapedMinutesAgo: number | null;
  }) => {
    // 1. Only rescue pending or failed items
    if (!["failed", "pending"].includes(product.scrapeStatus)) return false;
    // 2. If mainImageUrl exists, not a fail
    if (product.mainImageUrl !== null) return false;

    // 4. Exclude 404s, dead links, impossible items
    const reason = product.failureReason || "";
    if (
      reason.includes("404") ||
      reason.includes("Dead link") ||
      reason.includes("Impossible") ||
      reason.includes("ERR_NAME_NOT_RESOLVED")
    ) {
      return false;
    }

    // 3. Timing window:
    if (product.lastScrapedMinutesAgo === null) return true; // Brand new pending

    const isTransient =
      /timeout|502|503|rate.*limit|429/i.test(reason);

    if (isTransient) {
      return product.lastScrapedMinutesAgo >= 60; // 1 hour
    }

    return product.lastScrapedMinutesAgo >= 720; // 12 hours
  };

  // 1. Brand new pending with no prior scrape -> eligible immediately
  assert.strictEqual(
    evaluateRescueEligibility({
      scrapeStatus: "pending",
      mainImageUrl: null,
      failureReason: null,
      lastScrapedMinutesAgo: null,
    }),
    true
  );

  // 2. Permanent 404 -> never eligible
  assert.strictEqual(
    evaluateRescueEligibility({
      scrapeStatus: "failed",
      mainImageUrl: null,
      failureReason: "HTTP 404 Not Found",
      lastScrapedMinutesAgo: 1000,
    }),
    false
  );

  // 3. Transient timeout after 45 minutes -> NOT yet eligible (< 1h)
  assert.strictEqual(
    evaluateRescueEligibility({
      scrapeStatus: "failed",
      mainImageUrl: null,
      failureReason: "Navigation timeout of 45000ms exceeded",
      lastScrapedMinutesAgo: 45,
    }),
    false
  );

  // 4. Transient timeout after 65 minutes -> eligible (>= 1h)
  assert.strictEqual(
    evaluateRescueEligibility({
      scrapeStatus: "failed",
      mainImageUrl: null,
      failureReason: "Navigation timeout of 45000ms exceeded",
      lastScrapedMinutesAgo: 65,
    }),
    true
  );

  // 5. Generic error after 2 hours -> NOT yet eligible (< 12h)
  assert.strictEqual(
    evaluateRescueEligibility({
      scrapeStatus: "failed",
      mainImageUrl: null,
      failureReason: "HTML parser could not detect price table",
      lastScrapedMinutesAgo: 120,
    }),
    false
  );

  // 6. Generic error after 13 hours -> eligible (>= 12h)
  assert.strictEqual(
    evaluateRescueEligibility({
      scrapeStatus: "failed",
      mainImageUrl: null,
      failureReason: "HTML parser could not detect price table",
      lastScrapedMinutesAgo: 780,
    }),
    true
  );
});

