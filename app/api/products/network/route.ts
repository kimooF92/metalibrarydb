import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { scrapedProducts, ads, adObservations } from "@/db/schema";
import { eq, sql, inArray, or, and } from "drizzle-orm";
import { validateApiSecret } from "@/lib/api-guard";
import { formatTunisianPhone } from "@/lib/network-extractor";
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

    const phoneNumbers = targetProduct.phoneNumbers || [];
    const whatsappNumbers = targetProduct.whatsappNumbers || [];
    const metaPixelIds = targetProduct.metaPixelIds || [];
    const domain = targetProduct.domain?.toLowerCase() || "";

    // 2. Cross-reference other products and ads sharing any of these fingerprints
    const matchingProductConditions = [];

    if (phoneNumbers.length > 0) {
      matchingProductConditions.push(
        sql`${scrapedProducts.phoneNumbers} && ${sql.raw(`ARRAY[${phoneNumbers.map((p) => `'${p}'`).join(",")}]::text[]`)}`
      );
    }

    if (whatsappNumbers.length > 0) {
      matchingProductConditions.push(
        sql`${scrapedProducts.whatsappNumbers} && ${sql.raw(`ARRAY[${whatsappNumbers.map((p) => `'${p}'`).join(",")}]::text[]`)}`
      );
    }

    if (metaPixelIds.length > 0) {
      matchingProductConditions.push(
        sql`${scrapedProducts.metaPixelIds} && ${sql.raw(`ARRAY[${metaPixelIds.map((p) => `'${p}'`).join(",")}]::text[]`)}`
      );
    }

    let connectedProducts: any[] = [];
    if (matchingProductConditions.length > 0) {
      connectedProducts = await db
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

    // Collect all matched product IDs (including target)
    const allNetworkProductIds = Array.from(
      new Set([targetProduct.id, ...connectedProducts.map((p) => p.id)])
    );

    // 3. Fetch all ads linked to any of these network products
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

    // 4. Group by Facebook Page
    const pageGroups = new Map<
      string,
      {
        pageId: string;
        pageName: string;
        activeAdsCount: number;
        sampleThumbnails: string[];
      }
    >();

    uniqueAds.forEach((ad) => {
      if (!ad.pageId) return;
      const existing = pageGroups.get(ad.pageId) || {
        pageId: ad.pageId,
        pageName: ad.pageName || `Page ${ad.pageId}`,
        activeAdsCount: 0,
        sampleThumbnails: [],
      };

      existing.activeAdsCount++;
      const thumb = ad.thumbnailUrl || ad.mediaUrls?.[0];
      if (thumb && existing.sampleThumbnails.length < 4 && !existing.sampleThumbnails.includes(thumb)) {
        existing.sampleThumbnails.push(thumb);
      }

      pageGroups.set(ad.pageId, existing);
    });

    const connectedPages = Array.from(pageGroups.values()).sort(
      (a, b) => b.activeAdsCount - a.activeAdsCount
    );

    // Collect all unique phone and whatsapp numbers across the network
    const allPhones = new Set<string>(phoneNumbers);
    const allWhatsApps = new Set<string>(whatsappNumbers);
    const allPixels = new Set<string>(metaPixelIds);

    connectedProducts.forEach((p) => {
      (p.phoneNumbers || []).forEach((num: string) => allPhones.add(num));
      (p.whatsappNumbers || []).forEach((num: string) => allWhatsApps.add(num));
      (p.metaPixelIds || []).forEach((id: string) => allPixels.add(id));
    });

    const formattedPhones = Array.from(allPhones).map((p) => formatTunisianPhone(p));
    const formattedWhatsApps = Array.from(allWhatsApps).map((p) => formatTunisianPhone(p));

    const totalConnectedPages = connectedPages.length;
    const totalNetworkAds = uniqueAds.length;
    const hasShadowNetwork = totalConnectedPages > 1;

    return NextResponse.json({
      success: true,
      network: {
        hasShadowNetwork,
        totalConnectedPages,
        totalNetworkAds,
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
