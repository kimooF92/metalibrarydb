import { ScrapedProduct, Ad } from "@/types";

export type ModalTab = "all" | "overview" | "ads" | "suppliers" | "network";

export interface SupplierPlatformInfo {
  name: string;
  badgeClass: string;
  icon: string;
}

export function getSupplierPlatformInfo(url: string): SupplierPlatformInfo {
  try {
    const lowercase = url.toLowerCase();
    if (
      lowercase.includes("facebook.com") ||
      lowercase.includes("fb.com") ||
      lowercase.includes("fb.watch") ||
      lowercase.includes("m.facebook.com")
    ) {
      return {
        name: "Facebook",
        badgeClass: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
        icon: "🌐",
      };
    }
    if (lowercase.includes("instagram.com")) {
      return {
        name: "Instagram",
        badgeClass: "bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/20",
        icon: "📷",
      };
    }

    const host = new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
    return {
      name: host || "Supplier Link",
      badgeClass: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
      icon: "🔗",
    };
  } catch {
    return {
      name: "Supplier Link",
      badgeClass: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
      icon: "🔗",
    };
  }
}

export function generateAIProductPrompt(
  product: ScrapedProduct,
  linkedAds: Ad[],
  supplierUrls: string[],
  allImages: string[]
): string {
  const offersText =
    product.allOffers && Array.isArray(product.allOffers) && product.allOffers.length > 0
      ? product.allOffers
          .map((o: any) => `- ${o.tier_name || "Tier"}: ${o.price || ""} ${o.savings ? `(${o.savings})` : ""}`)
          .join("\n")
      : "- Price: " + (product.currentPrice || "N/A");

  const imagesText = allImages.map((img, i) => `${i + 1}. ${img}`).join("\n");

  const adCopiesText =
    linkedAds.length > 0
      ? linkedAds
          .slice(0, 5)
          .map((ad, i) => `Angle ${i + 1} (${ad.pageName || "Store"}):\n"${ad.caption || ad.title || "No copy text"}"`)
          .join("\n\n")
      : "No active ad copies tracked.";

  const suppliersText =
    supplierUrls.length > 0
      ? supplierUrls
          .map((u, i) => `${i + 1}. [${getSupplierPlatformInfo(u).name}] ${u}`)
          .join("\n")
      : "None specified.";

  return `# Product Brief for AI Copywriting & Store Listing

## Product Details:
- **Title:** ${product.title || "Product Landing Page"}
- **Current Price:** ${product.currentPrice || "N/A"}
- **Original / Regular Price:** ${product.originalPrice || "N/A"}
- **Discount Offer:** ${product.discountOrOffer || "N/A"}
- **Delivery / Shipping Policy:** ${product.deliveryCost || "Not specified"}
- **Store Domain:** ${product.domain || "N/A"}
- **Destination URL:** ${product.url}

## Sourcing & Verified Supplier Links:
${suppliersText}

## Multi-Tier Offers & Bundles:
${offersText}

## Product Images (High-Resolution):
${imagesText}

## Active Meta Ad Creative Angles:
${adCopiesText}

---
### 🤖 Copywriting Instructions for AI:
"You are a world-class direct response e-commerce copywriter. Based on the product data above:
1. Write 5 high-converting headline hooks (Problem-Agitate-Solve, Curiosity, Benefit-Driven).
2. Write a complete high-converting Shopify product page description with Bullet Points, Benefits, and an FAQ section.
3. Write 3 short-form UGC video ad scripts (30 seconds each) with visual scene directions and voiceover text."`;
}

export function generateCleanMarkdown(
  product: ScrapedProduct,
  allImages: string[],
  supplierUrls: string[]
): string {
  const offersText =
    product.allOffers && Array.isArray(product.allOffers) && product.allOffers.length > 0
      ? product.allOffers
          .map((o: any) => `- ${o.tier_name || "Tier"}: ${o.price || ""} ${o.savings ? `(${o.savings})` : ""}`)
          .join("\n")
      : "- Price: " + (product.currentPrice || "N/A");

  const imagesText = allImages.map((img) => `- ${img}`).join("\n");

  const suppliersText =
    supplierUrls.length > 0
      ? supplierUrls
          .map((u) => `- [${getSupplierPlatformInfo(u).name}](${u})`)
          .join("\n")
      : "None specified.";

  return `# ${product.title || "Product Landing Page"}

**Price:** ${product.currentPrice || "N/A"} ${product.originalPrice ? `(Regular: ${product.originalPrice})` : ""}
**Offer:** ${product.discountOrOffer || "N/A"}
**Delivery:** ${product.deliveryCost || "Not specified"}
**Source URL:** ${product.url}

### Sourcing & Suppliers:
${suppliersText}

### Offers / Quantity Discounts:
${offersText}

### Images:
${imagesText}`;
}
