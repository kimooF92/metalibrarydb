import { TunisianSeasonalityContext } from "./types";

export function calculateTunisianSeasonalityContext(
  referenceDate: Date = new Date()
): TunisianSeasonalityContext {
  const month = referenceDate.getMonth(); // 0-indexed (0 = Jan, 7 = Aug)
  const day = referenceDate.getDate();
  const year = referenceDate.getFullYear();

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const currentMonthName = monthNames[month];

  // Dynamic Seasonal Window Calculation for Tunisia
  let activeSeasonalWindow = "Standard E-Commerce Trading";
  if (month === 7 && day >= 15) {
    activeSeasonalWindow = "Back-to-School (Rentrée Scolaire) Surge & Late Summer Clearance";
  } else if (month === 8) {
    activeSeasonalWindow = "Peak Back-to-School (Rentrée Scolaire) & Early Autumn Transition";
  } else if (month === 9) {
    activeSeasonalWindow = "Autumn Home & Wardrobe Transition";
  } else if (month === 10) {
    activeSeasonalWindow = "Black Friday / White Friday (Vendredi Blanc) & Cyber Month Preparation";
  } else if (month === 11) {
    activeSeasonalWindow = "Winter Warming & End of Year Gift Season";
  } else if (month === 0) {
    activeSeasonalWindow = "Winter Fitness, New Year Self-Improvement & Winter Sales (Soldes d'Hiver)";
  } else if (month >= 1 && month <= 3) {
    activeSeasonalWindow = "Spring Renewal & Ramadan Preparation Season";
  } else if (month >= 4 && month <= 6) {
    activeSeasonalWindow = "Summer Launch, Beach/Vacation & Wedding Season (Saison des Mariages)";
  } else if (month === 7 && day < 15) {
    activeSeasonalWindow = "Mid-Summer Peak & Outdoor Living";
  }

  // Key Tunisian Events Calendar
  const events = [
    {
      eventName: "Rentrée Scolaire (Back-to-School)",
      month: 8, // September
      day: 15,
      impactLevel: "Critical" as const,
      relevantCategories: ["Kids, Baby & Toys", "Electronics & Tech", "Fashion & Jewelry"],
      buyingBehaviorNote: "High impulse buying for backpacks, posture correctors, study lights, kids educational tablets, and stationery accessories.",
    },
    {
      eventName: "Vendredi Blanc / Black Friday Tunisia",
      month: 10, // November
      day: 27,
      impactLevel: "Critical" as const,
      relevantCategories: ["Electronics & Tech", "Beauty, Health & Care", "Home, Kitchen & Living", "Fashion & Jewelry"],
      buyingBehaviorNote: "Highest annual conversion volume. Bundles, 2+1 Free offers, and flash discount angles dominate.",
    },
    {
      eventName: "Winter Season & Cold Weather Shift",
      month: 11, // December
      day: 1,
      impactLevel: "High" as const,
      relevantCategories: ["Home, Kitchen & Living", "Fashion & Jewelry", "Automotive & Tools"],
      buyingBehaviorNote: "Space heaters, thermal clothing, dehumidifiers, hot beverage makers, and car windshield care.",
    },
    {
      eventName: "Soldes d'Hiver (Winter Official Sales)",
      month: 1, // February
      day: 1,
      impactLevel: "High" as const,
      relevantCategories: ["Fashion & Jewelry", "Beauty, Health & Care"],
      buyingBehaviorNote: "Discount-sensitive buyers actively seeking 30-70% off clearance hooks.",
    },
    {
      eventName: "Ramadan & Eid al-Fitr Season",
      month: 2, // March approx (varies by year)
      day: 1,
      impactLevel: "Critical" as const,
      relevantCategories: ["Home, Kitchen & Living", "Fashion & Jewelry", "Beauty, Health & Care", "Kids, Baby & Toys"],
      buyingBehaviorNote: "Massive spike in kitchen appliances (air fryers, choppers, chourba bowls), modest luxury fashion (Jebba/Abaya), perfumes, and Eid gifts for children.",
    },
    {
      eventName: "Saison des Mariages (Wedding Season & Wtayya)",
      month: 5, // June
      day: 15,
      impactLevel: "Critical" as const,
      relevantCategories: ["Beauty, Health & Care", "Fashion & Jewelry", "Home, Kitchen & Living"],
      buyingBehaviorNote: "High-ticket hair styling tools, skincare sets, gold-plated jewelry, evening dresses, and trousseau home appliances.",
    },
    {
      eventName: "Summer Beach & Outdoor Heatwave",
      month: 6, // July
      day: 1,
      impactLevel: "High" as const,
      relevantCategories: ["Sports, Fitness & Outdoor", "Beauty, Health & Care", "Electronics & Tech"],
      buyingBehaviorNote: "Portable mini fans, sunscreens/skincare, coolers, waterproof accessories, and camping gadgets.",
    },
  ];

  const upcomingKeyEvents = events
    .map((evt) => {
      const targetYear = year;
      let target = new Date(targetYear, evt.month, evt.day);
      if (target.getTime() < referenceDate.getTime()) {
        target = new Date(targetYear + 1, evt.month, evt.day);
      }
      const diffDays = Math.max(0, Math.ceil((target.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24)));

      return {
        eventName: evt.eventName,
        targetDate: target.toISOString().split("T")[0],
        daysRemaining: diffDays,
        impactLevel: evt.impactLevel,
        relevantCategories: evt.relevantCategories,
        buyingBehaviorNote: evt.buyingBehaviorNote,
      };
    })
    .sort((a, b) => a.daysRemaining - b.daysRemaining);

  const regionalDemographics = [
    {
      regionName: "Grand Tunis",
      governorates: ["Tunis", "Ariana", "Ben Arous", "Manouba"],
      purchasingPower: "High" as const,
      deliverySpeed: "Same-Day / 24h Express Available",
      preferredCategories: ["Electronics & Tech", "Beauty, Health & Care", "Trendy Fashion"],
      consumerAngleNote: "High average basket (60-150 TND). Responsive to trendy TikTok-style video hooks, premium aesthetics, and fast 24h delivery.",
    },
    {
      regionName: "Sahel Coastal Strip",
      governorates: ["Sousse", "Monastir", "Mahdia"],
      purchasingPower: "High" as const,
      deliverySpeed: "24-48h Delivery",
      preferredCategories: ["Fashion & Jewelry", "Beauty, Health & Care", "Home Appliances"],
      consumerAngleNote: "Strong fashion and beauty market. High responsiveness to wedding season, personal grooming, and lifestyle accessories.",
    },
    {
      regionName: "Cap Bon & North East",
      governorates: ["Nabeul", "Hammamet", "Bizerte", "Zaghouan"],
      purchasingPower: "Upper-Mid" as const,
      deliverySpeed: "24-48h Delivery",
      preferredCategories: ["Home & Kitchen", "Outdoor & Fitness", "Automotive"],
      consumerAngleNote: "Balanced family spending. Strong appetite for practical kitchen gadgets, home organization, and car accessories.",
    },
    {
      regionName: "Sfax & Center-South Hub",
      governorates: ["Sfax"],
      purchasingPower: "High" as const,
      deliverySpeed: "24-48h Delivery",
      preferredCategories: ["Tools & Hardware", "Electronics & Tech", "Home & Kitchen"],
      consumerAngleNote: "Pragmatic, value-driven consumers. High demand for durable tools, DIY hardware, and cost-effective multi-item bundles.",
    },
    {
      regionName: "Interior & South Governorates",
      governorates: [
        "Kairouan", "Gafsa", "Gabès", "Medenine", "Sidi Bouzid",
        "Kasserine", "Tozeur", "Kebili", "Tataouine", "Beja",
        "Jendouba", "Siliana", "Kef"
      ],
      purchasingPower: "COD-Sensitive" as const,
      deliverySpeed: "48-72h Delivery (Aramex / Yalidine / First Delivery)",
      preferredCategories: ["Automotive & Tools", "Practical Household Goods", "Solar & Rechargeable Gadgets"],
      consumerAngleNote: "High COD reliability sensitivity. Prefer under 60 TND sweet-spot prices, durable goods, clear French/Darija phone confirmation, and free delivery guarantees.",
    },
  ];

  return {
    currentDate: referenceDate.toISOString(),
    currentMonthName,
    activeSeasonalWindow,
    upcomingKeyEvents: upcomingKeyEvents.slice(0, 4),
    regionalDemographics,
    codEconomics: {
      avgConfirmationRate: "78% - 86%",
      avgDeliverySuccessRate: "72% - 82%",
      sweetSpotPriceBands: [
        { band: "Under 30 TND", label: "Micro Impulse", conversionFriction: "Very Low" },
        { band: "35 - 59 TND", label: "National Sweet Spot (Highest Volume)", conversionFriction: "Low" },
        { band: "60 - 99 TND", label: "Mid-Ticket (Quality & Bundles)", conversionFriction: "Medium" },
        { band: "100+ TND", label: "High-Ticket (Requires Call Confirmation & Trust)", conversionFriction: "High (Requires Call/Trust)" },
      ],
    },
  };
}
