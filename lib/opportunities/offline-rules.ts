import {
  MarketOpportunityTelemetry,
  TunisianSeasonalityContext,
  Stage1NicheAnalysis,
  Stage2SeasonalityAnalysis,
  Stage3ProductBlueprints,
  NicheOpportunityScorecard,
} from "./types";

export function buildDeterministicStage1(
  telemetry: MarketOpportunityTelemetry
): Stage1NicheAnalysis {
  const categories = telemetry.categoryBreakdown.length > 0
    ? telemetry.categoryBreakdown.slice(0, 6)
    : [
        {
          category: "General & Other",
          productCount: 1,
          storeCount: 1,
          avgPriceTND: 49,
          minPriceTND: 29,
          maxPriceTND: 89,
          activeAdsCount: 1,
          newAds7dCount: 1,
        },
      ];

  const seenNiches = new Set<string>();
  const rankedNiches: NicheOpportunityScorecard[] = [];

  for (let idx = 0; idx < categories.length; idx++) {
    const c = categories[idx];
    const nicheName = c.category.trim();
    if (seenNiches.has(nicheName.toLowerCase())) continue;
    seenNiches.add(nicheName.toLowerCase());

    const storeRatio = c.storeCount > 0 ? c.productCount / c.storeCount : 1;
    const isHighScale = c.newAds7dCount > 5;
    const saturationIndex = Math.min(95, Math.max(15, Math.round(storeRatio * 18)));
    const opportunityScore = Math.min(
      96,
      Math.max(40, Math.round(85 - idx * 7 + (isHighScale ? 10 : 0) - (saturationIndex > 60 ? 15 : 0)))
    );

    const minPrice = c.minPriceTND !== null ? Math.round(c.minPriceTND) : 29;
    const avgPrice = c.avgPriceTND !== null ? Math.round(c.avgPriceTND) : 59;

    rankedNiches.push({
      niche: nicheName,
      opportunityScore,
      competitionLevel:
        saturationIndex < 40
          ? "Blue Ocean (Low)"
          : saturationIndex < 70
          ? "Moderate Growth"
          : "Red Ocean (Saturated)",
      scalabilityPotential:
        opportunityScore > 75 ? "High" : opportunityScore > 55 ? "Moderate" : "Selective",
      saturationIndex,
      sweetSpotPriceTND: `${minPrice} - ${avgPrice} TND`,
      velocitySignal: `${c.productCount} active products across ${c.storeCount} stores with ${c.newAds7dCount} new launches in 7 days.`,
      whyNowRationale: `Consistent buyer impulse in Tunisia with category reference pricing around ${avgPrice} TND.`,
    });
  }

  const redFlagNiches = [
    {
      niche: "Over-Cloned Generic Gadgets",
      riskReason: "High clone saturation across multiple stores selling identical creatives with diminishing ROAS.",
      descalingRateNote: "Frequent price undercutting down to 25 TND eroding net margins after COD delivery fees.",
    },
  ];

  const scalingSum = telemetry.scalingBrandsCount + telemetry.descalingBrandsCount;
  const scalingRatio = scalingSum > 0 ? telemetry.scalingBrandsCount / scalingSum : 0.5;
  const overallScore = Math.min(95, Math.max(45, Math.round(60 + scalingRatio * 35)));

  return {
    marketOpportunityIndex: overallScore,
    rankedNiches,
    redFlagNiches,
  };
}

export function buildDeterministicStage2(
  ctx: TunisianSeasonalityContext
): Stage2SeasonalityAnalysis {
  const seenRegions = new Set<string>();
  const regionalDemandStrategy = ctx.regionalDemographics
    .filter((r) => {
      if (seenRegions.has(r.regionName.toLowerCase())) return false;
      seenRegions.add(r.regionName.toLowerCase());
      return true;
    })
    .map((r) => ({
      region: r.regionName,
      targetGovernorates: r.governorates.join(", ").slice(0, 240),
      hotCategories: r.preferredCategories.slice(0, 5),
      actionableDirective: `${r.consumerAngleNote} (Delivery: ${r.deliverySpeed}).`.slice(0, 390),
    }));

  return {
    currentSeasonalPhase: ctx.activeSeasonalWindow.slice(0, 140),
    seasonalUrgency: "Immediate (Peak Wave)",
    seasonalRoadmap: {
      activeWaveThisWeek: `Capitalize on ${ctx.activeSeasonalWindow}: launch high-velocity video hooks targeting impulse buyers.`.slice(0, 340),
      next30DaysWave: ctx.upcomingKeyEvents[0]
        ? `Ramp up testing for ${ctx.upcomingKeyEvents[0].eventName} (in ${ctx.upcomingKeyEvents[0].daysRemaining} days).`.slice(0, 340)
        : "Prepare autumn and winter transition catalogs with bundled offers.",
      next60DaysWave: ctx.upcomingKeyEvents[1]
        ? `Early sourcing and creative preparation for ${ctx.upcomingKeyEvents[1].eventName}.`.slice(0, 340)
        : "Prepare Black Friday (Vendredi Blanc) and End of Year scale campaigns.",
    },
    regionalDemandStrategy,
  };
}

export function buildDeterministicStage3(
  ctx: TunisianSeasonalityContext,
  stage1: Stage1NicheAnalysis
): Stage3ProductBlueprints {
  const topNiche = stage1.rankedNiches[0]?.niche || "Kids, Baby & Toys";
  const secondNiche = stage1.rankedNiches[1]?.niche || "Beauty, Health & Care";

  return {
    highConvictionProducts: [
      {
        id: "prod_1",
        productName: "Ergonomic Back-to-School Posture Corrector & Study Companion",
        niche: topNiche,
        targetAudience: "Parents & Students (Grand Tunis, Sahel, Cap Bon)",
        targetRegions: "National All Governorates",
        recommendedPriceTND: 49,
        estimatedMarginTND: 26,
        whyItWinsNow: "Aligns with peak seasonal urgency and high parental willingness to invest in kids comfort.",
        timingRationale: "Peak annual search intent and high conversion rate in late August & September.",
        saturationStatus: "Rising Trend",
        creativeBlueprint: {
          format: "Video (Hook-First)",
          hookDarijaFrench: "وليدك يقرا برشا وظهروا ديما يوجع فيه؟ الحل النهائي لوضعيّة صحيحة وصحة ممتازة! 🎒✨",
          visualHook3s: "Split screen: Slouching child at desk vs instantly standing upright with confidence.",
          ctaAndOffer: "عرض خاص: إشري 1 والثاني بنصف السعر + توصيل مجاني وسريع لكامل تراب الجمهورية",
        },
        sourcingTip: "High availability locally in Moncef Bey / Sfax or rapid air shipment via AliExpress.",
      },
      {
        id: "prod_2",
        productName: "Pro Multi-Styler 5-in-1 Ceramic Hair Blowout Wand",
        niche: secondNiche,
        targetAudience: "Women 20-45 (Grand Tunis, Sousse, Monastir, Sfax)",
        targetRegions: "Grand Tunis & Sahel Metros",
        recommendedPriceTND: 79,
        estimatedMarginTND: 38,
        whyItWinsNow: "Evergreen high-margin cash cow with massive demand during Tunisian wedding season and event outings.",
        timingRationale: "High conversion volume and strong visual transformation power on TikTok & Instagram reels.",
        saturationStatus: "Unsaturated / Blue Ocean",
        creativeBlueprint: {
          format: "Video (Hook-First)",
          hookDarijaFrench: "بروشينغ صالون احترافي في 10 دقائق في دارك! بدون حرق الشعر وبنتيجة خيالية 😍🔥",
          visualHook3s: "Close-up 1-pass hair transformation from frizzy to silky smooth salon shine.",
          ctaAndOffer: "تخفيض 40% لفترة محدودة + الدفع عند الاستلام بعد المعاينة",
        },
        sourcingTip: "Source directly with EU 220V plug adapter from verified 1688/AliExpress suppliers.",
      },
      {
        id: "prod_3",
        productName: "Solar Waterproof Motion-Sensor Security Floodlight (120 LED)",
        niche: "Home, Kitchen & Living",
        targetAudience: "Homeowners & Drivers (Cap Bon, Sfax, South & Interior Governorates)",
        targetRegions: "Center, South & Interior Governorates",
        recommendedPriceTND: 59,
        estimatedMarginTND: 31,
        whyItWinsNow: "Solves electricity cost concerns with 0 TND electricity bill and easy wire-free installation.",
        timingRationale: "Highly sought after across villa owners, farms, and garage entries.",
        saturationStatus: "Moderate Competition",
        creativeBlueprint: {
          format: "Video (Hook-First)",
          hookDarijaFrench: "إضاءة قوية 100% بالطاقة الشمسية بدون فاتورة وبدون خيوط! ركب في دقيقة 💡☀️",
          visualHook3s: "Car pulling into pitch black driveway instantly illuminated by brilliant bright LED floodlight.",
          ctaAndOffer: "Pack 2 Pièces à 99 DT (Au lieu de 140 DT) + Livraison Gratuite",
        },
        sourcingTip: "Local wholesale readily available in Sfax hardware and Moncef Bey importers.",
      },
      {
        id: "prod_4",
        productName: "Universal Magnetic 360° Anti-Vibration Car Phone Mount",
        niche: "Automotive & Tools",
        targetAudience: "Drivers, Taxi & Delivery Couriers (Grand Tunis & National)",
        targetRegions: "National All Governorates",
        recommendedPriceTND: 39,
        estimatedMarginTND: 22,
        whyItWinsNow: "Sub-40 TND impulse price point with near-zero return rate and universal vehicle fit.",
        timingRationale: "Consistently low COD friction and fast confirmation rate (>88%).",
        saturationStatus: "Rising Trend",
        creativeBlueprint: {
          format: "Video (Hook-First)",
          hookDarijaFrench: "تلفونك ديما يطيح وأنت تسوق؟ الثبات المطلق مع الحامل المغناطيسي الأقوى في تونس 🚗📱",
          visualHook3s: "Violently shaking dashboard on bumpy road while phone stays rock solid.",
          ctaAndOffer: "Commandez Maintenant: Paiement à la livraison après vérification",
        },
        sourcingTip: "Low weight item (under 100g) ideal for bulk air sourcing at low shipping cost.",
      },
    ],
    winningAngleDirectives: [
      "Always include 'Paiement à la livraison après vérification' (COD confidence) to boost form completion by 25%.",
      "Leverage 'Pack 2 Pièces' bundle pricing (e.g. 1 for 49 DT, 2 for 79 DT) to maximize average order value (AOV) against flat delivery shipping fees.",
      "Video creatives with Darija voiceovers and high-energy first 3 seconds consistently outperform static image ads by 3.2x in scaling tests.",
    ],
  };
}
