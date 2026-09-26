import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { scrapedProducts, ads, adObservations } from "@/db/schema";
import { eq, sql, inArray, or, and } from "drizzle-orm";
import { validateApiSecret } from "@/lib/api-guard";
import {
  formatTunisianPhone,
  PHANTOM_PHONE_BLACKLIST,
  isPlaceholderOrDummyPhone,
} from "@/lib/network-extractor";
import { isValidPageId } from "@/lib/utils";
import { PRODUCT_NETWORK_PROJECTION } from "@/lib/product-projections";

export async function GET(req: NextRequest) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const productId = searchParams.get("productId");

    if (!productId) {
      return NextResponse.json(
        { success: false, error: "productId parameter is required." },
        { status: 400 }
      );
    }

    // 1. Fetch target product
    const [targetProduct] = await db
      .select(PRODUCT_NETWORK_PROJECTION)
      .from(scrapedProducts)
      .where(eq(scrapedProducts.id, productId));

    if (!targetProduct) {
      return NextResponse.json(
        { success: false, error: "Product not found." },
        { status: 404 }
      );
    }

    // 2. Sanitize and validate target fingerprints
    const rawPhones = targetProduct.phoneNumbers || [];
    const rawWhatsApps = targetProduct.whatsappNumbers || [];
    const rawPixels = targetProduct.metaPixelIds || [];

    const validPhones = rawPhones.filter(
      (p) => !PHANTOM_PHONE_BLACKLIST.has(p) && !isPlaceholderOrDummyPhone(p)
    );
    const validWhatsApps = rawWhatsApps.filter(
      (w) => !PHANTOM_PHONE_BLACKLIST.has(w) && !isPlaceholderOrDummyPhone(w)
    );
    const validPixels = rawPixels.filter(
      (px) => px && /^\d{12,18}$/.test(px.trim())
    );

    // 3. Hub / Stop-Word Protection:
    // If a phone number is associated with more than 4 distinct domains, it is a shared courier/service hotline,
    // not a private merchant network. Only use it if accompanied by WhatsApp or Pixel.
    let clusterablePhones = validPhones;
    if (validPhones.length > 0) {
      const hubCheckQuery = await db
        .select({
          phone: sql<string>`elem`,
          domainCount: sql<number>`count(distinct ${scrapedProducts.domain})`,
        })
        .from(scrapedProducts)
        .crossJoin(sql`unnest(${scrapedProducts.phoneNumbers}) as elem`)
        .where(
          sql`elem = ANY(ARRAY[${sql.raw(validPhones.map((p) => `'${p}'`).join(","))}]::text[])`
        )
        .groupBy(sql`elem`);

      const hubNumbers = new Set(
        hubCheckQuery
          .filter((r) => Number(r.domainCount) > 4)
          .map((r) => r.phone)
      );

      clusterablePhones = validPhones.filter((p) => !hubNumbers.has(p));
    }

    // 4. Cross-reference other products sharing any verified high-confidence fingerprints
    const matchingProductConditions = [];

    if (validPixels.length > 0) {
      matchingProductConditions.push(
        sql`${scrapedProducts.metaPixelIds} && ${sql.raw(`ARRAY[${validPixels.map((p) => `'${p}'`).join(",")}]::text[]`)}`
      );
    }

    if (validWhatsApps.length > 0) {
      matchingProductConditions.push(
        sql`${scrapedProducts.whatsappNumbers} && ${sql.raw(`ARRAY[${validWhatsApps.map((p) => `'${p}'`).join(",")}]::text[]`)}`
      );
    }

    if (clusterablePhones.length > 0) {
      matchingProductConditions.push(
        sql`${scrapedProducts.phoneNumbers} && ${sql.raw(`ARRAY[${clusterablePhones.map((p) => `'${p}'`).join(",")}]::text[]`)}`
      );
    }

    let rawConnectedProducts: any[] = [];
    if (matchingProductConditions.length > 0) {
      rawConnectedProducts = await db
        .select({
          id: scrapedProducts.id,
          url: scrapedProducts.url,
          domain: scrapedProducts.domain,
          pageId: scrapedProducts.pageId,
          phoneNumbers: scrapedProducts.phoneNumbers,
          whatsappNumbers: scrapedProducts.whatsappNumbers,
          metaPixelIds: scrapedProducts.metaPixelIds,
          storePlatform: scrapedProducts.storePlatform,
        })
        .from(scrapedProducts)
        .where(or(...matchingProductConditions));
    }

    // Map each product to its matching signals relative to targetProduct
    interface ProductMatchMeta {
      id: string;
      domain: string | null;
      pageId: string | null;
      matchedPixels: string[];
      matchedWhatsApps: string[];
      matchedPhones: string[];
      isTarget: boolean;
    }

    const productMatchMap = new Map<string, ProductMatchMeta>();

    // Add target product
    productMatchMap.set(targetProduct.id, {
      id: targetProduct.id,
      domain: targetProduct.domain,
      pageId: targetProduct.pageId,
      matchedPixels: validPixels,
      matchedWhatsApps: validWhatsApps,
      matchedPhones: validPhones,
      isTarget: true,
    });

    for (const cp of rawConnectedProducts) {
      const pPixels = (cp.metaPixelIds || []).filter((px: string) => validPixels.includes(px));
      const pWhatsApps = (cp.whatsappNumbers || []).filter((w: string) => validWhatsApps.includes(w));
      const pPhones = (cp.phoneNumbers || []).filter((p: string) => clusterablePhones.includes(p));

      // Must share at least one valid signal with target
      if (pPixels.length > 0 || pWhatsApps.length > 0 || pPhones.length > 0) {
        productMatchMap.set(cp.id, {
          id: cp.id,
          domain: cp.domain,
          pageId: cp.pageId,
          matchedPixels: pPixels,
          matchedWhatsApps: pWhatsApps,
          matchedPhones: pPhones,
          isTarget: cp.id === targetProduct.id,
        });
      }
    }

    const allNetworkProductIds = Array.from(productMatchMap.keys());

    // 5. Fetch all ads linked to any of these network products
    const networkAds = await db
      .select({
        id: ads.id,
        pageId: ads.pageId,
        pageName: ads.pageName,
        title: ads.title,
        thumbnailUrl: ads.thumbnailUrl,
        thumbnailStoragePath: ads.thumbnailStoragePath,
        mediaUrls: ads.mediaUrls,
        productId: ads.productId,
        duplicationCount: adObservations.duplicationCount,
        isActive: adObservations.isActive,
      })
      .from(ads)
      .leftJoin(adObservations, eq(ads.id, adObservations.adId))
      .where(inArray(ads.productId, allNetworkProductIds));

    // Deduplicate ads by ad id
    const adMap = new Map<string, (typeof networkAds)[0]>();
    networkAds.forEach((ad) => {
      if (!adMap.has(ad.id)) {
        adMap.set(ad.id, ad);
      }
    });

    const uniqueAds = Array.from(adMap.values());

    // 6. Group by Facebook Page and build connection attribution
    interface PageNetworkGroup {
      pageId: string;
      pageName: string;
      isCurrentPage: boolean;
      activeAdsCount: number;
      sampleThumbnails: string[];
      domains: Set<string>;
      matchedPixels: Set<string>;
      matchedWhatsApps: Set<string>;
      matchedPhones: Set<string>;
      confidence: "high" | "medium" | "low" | "current";
      connectionReasons: string[];
    }

    const pageGroups = new Map<string, PageNetworkGroup>();
    let targetPageId = isValidPageId(targetProduct.pageId) ? targetProduct.pageId : null;

    // Fallback: If target product doesn't have a valid numeric pageId directly, check its linked ads
    if (!targetPageId) {
      const targetAd = uniqueAds.find((a) => a.productId === targetProduct.id && isValidPageId(a.pageId));
      if (targetAd && targetAd.pageId) {
        targetPageId = targetAd.pageId;
      }
    }

    uniqueAds.forEach((ad) => {
      if (!ad.pageId || !isValidPageId(ad.pageId)) return;
      const isCurrent = Boolean(
        (targetPageId && ad.pageId === targetPageId) ||
        (ad.productId === targetProduct.id)
      );

      // If this ad belongs to the target product, make sure targetPageId is set
      if (isCurrent && !targetPageId) {
        targetPageId = ad.pageId;
      }

      let group = pageGroups.get(ad.pageId);
      if (!group) {
        group = {
          pageId: ad.pageId,
          pageName: ad.pageName || `Page ${ad.pageId}`,
          isCurrentPage: isCurrent,
          activeAdsCount: 0,
          sampleThumbnails: [],
          domains: new Set<string>(),
          matchedPixels: new Set<string>(),
          matchedWhatsApps: new Set<string>(),
          matchedPhones: new Set<string>(),
          confidence: isCurrent ? "current" : "medium",
          connectionReasons: [],
        };
        pageGroups.set(ad.pageId, group);
      } else if (isCurrent) {
        group.isCurrentPage = true;
      }

      group.activeAdsCount++;
      const thumb = ad.thumbnailUrl || ad.mediaUrls?.[0];
      if (thumb && group.sampleThumbnails.length < 4 && !group.sampleThumbnails.includes(thumb)) {
        group.sampleThumbnails.push(thumb);
      }

      if (ad.productId) {
        const pMeta = productMatchMap.get(ad.productId);
        if (pMeta) {
          if (pMeta.domain) group.domains.add(pMeta.domain);
          pMeta.matchedPixels.forEach((px) => group!.matchedPixels.add(px));
          pMeta.matchedWhatsApps.forEach((w) => group!.matchedWhatsApps.add(w));
          pMeta.matchedPhones.forEach((p) => group!.matchedPhones.add(p));
        }
      }
    });

    // Ensure target product's own page is represented even if it has no ads yet
    if (targetPageId && isValidPageId(targetPageId)) {
      if (!pageGroups.has(targetPageId)) {
        pageGroups.set(targetPageId, {
          pageId: targetPageId,
          pageName: `Page ${targetPageId}`,
          isCurrentPage: true,
          activeAdsCount: 0,
          sampleThumbnails: [],
          domains: targetProduct.domain ? new Set([targetProduct.domain]) : new Set(),
          matchedPixels: new Set(validPixels),
          matchedWhatsApps: new Set(validWhatsApps),
          matchedPhones: new Set(validPhones),
          confidence: "current",
          connectionReasons: ["Current Brand Page"],
        });
      } else {
        const currentGroup = pageGroups.get(targetPageId)!;
        currentGroup.isCurrentPage = true;
      }
    }

    // Determine connection reasons & confidence for each page
    pageGroups.forEach((group) => {
      if (group.isCurrentPage) {
        group.confidence = "current";
        group.connectionReasons = ["Current Brand Page"];
        return;
      }

      const reasons: string[] = [];
      let hasPixelMatch = false;
      let hasWaMatch = false;

      if (group.matchedPixels.size > 0) {
        hasPixelMatch = true;
        group.matchedPixels.forEach((px) => {
          reasons.push(`Shared Meta Pixel (${px})`);
        });
      }

      if (group.matchedWhatsApps.size > 0) {
        hasWaMatch = true;
        group.matchedWhatsApps.forEach((w) => {
          reasons.push(`Shared WhatsApp (${formatTunisianPhone(w).formatted})`);
        });
      }

      if (group.matchedPhones.size > 0) {
        group.matchedPhones.forEach((p) => {
          reasons.push(`Shared Phone (${formatTunisianPhone(p).formatted})`);
        });
      }

      group.connectionReasons = reasons;

      if (hasPixelMatch || hasWaMatch || group.matchedPhones.size >= 2) {
        group.confidence = "high";
      } else if (group.matchedPhones.size === 1) {
        group.confidence = "medium";
      } else {
        group.confidence = "low";
      }
    });

    // Format output connected pages
    const connectedPages = Array.from(pageGroups.values())
      .map((g) => ({
        pageId: g.pageId,
        pageName: g.pageName,
        isCurrentPage: g.isCurrentPage,
        activeAdsCount: g.activeAdsCount,
        sampleThumbnails: g.sampleThumbnails,
        domains: Array.from(g.domains),
        confidence: g.confidence,
        connectionReasons: g.connectionReasons,
      }))
      .sort((a, b) => {
        if (a.isCurrentPage && !b.isCurrentPage) return -1;
        if (!a.isCurrentPage && b.isCurrentPage) return 1;
        return b.activeAdsCount - a.activeAdsCount;
      });

    // Collect all valid unique contact info across the network
    const allPhones = new Set<string>(validPhones);
    const allWhatsApps = new Set<string>(validWhatsApps);
    const allPixels = new Set<string>(validPixels);

    rawConnectedProducts.forEach((p) => {
      (p.phoneNumbers || []).forEach((num: string) => {
        if (!PHANTOM_PHONE_BLACKLIST.has(num) && !isPlaceholderOrDummyPhone(num)) {
          allPhones.add(num);
        }
      });
      (p.whatsappNumbers || []).forEach((num: string) => {
        if (!PHANTOM_PHONE_BLACKLIST.has(num) && !isPlaceholderOrDummyPhone(num)) {
          allWhatsApps.add(num);
        }
      });
      (p.metaPixelIds || []).forEach((id: string) => {
        if (id && /^\d{12,18}$/.test(id.trim())) {
          allPixels.add(id);
        }
      });
    });

    const formattedPhones = Array.from(allPhones).map((p) => formatTunisianPhone(p));
    const formattedWhatsApps = Array.from(allWhatsApps).map((p) => formatTunisianPhone(p));

    const sisterPages = connectedPages.filter((p) => !p.isCurrentPage);
    const totalConnectedPages = connectedPages.length;
    const sisterPagesCount = sisterPages.length;
    const hasShadowNetwork = sisterPagesCount > 0;

    let networkSummary = "Verified Independent Brand — no shared advertiser fingerprints detected.";
    if (hasShadowNetwork) {
      const topReasons = Array.from(
        new Set(sisterPages.flatMap((p) => p.connectionReasons))
      ).slice(0, 2);
      networkSummary = `Shadow Network: Connected to ${sisterPagesCount} sister Facebook Page${
        sisterPagesCount === 1 ? "" : "s"
      } via ${topReasons.join(" & ")}.`;
    }

    return NextResponse.json({
      success: true,
      network: {
        hasShadowNetwork,
        totalConnectedPages,
        sisterPagesCount,
        totalNetworkAds: uniqueAds.length,
        networkSummary,
        storePlatform: targetProduct.storePlatform || "other",
        phoneNumbers: Array.from(allPhones),
        whatsappNumbers: Array.from(allWhatsApps),
        metaPixelIds: Array.from(allPixels),
        formattedPhones,
        formattedWhatsApps,
        connectedPages,
      },
    });
  } catch (err: any) {
    console.error("[Network API] Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}

