import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { extractMedia } from "../lib/apify-ingest";
import { uploadMediaWithHashing, isB2Configured } from "../lib/b2-storage";

async function testLocalScanMedia() {
  console.log("=== Testing Local Scan Media & Carousel Extraction ===\n");

  // Test 1: GraphQL Carousel Extraction
  const mockCarouselNode = {
    adArchiveID: "99990001",
    pageID: "brand-123",
    pageName: "Test Brand",
    snapshot: {
      body: { text: "Check out our top products in this carousel!" },
      cards: [
        {
          title: "Product 1",
          original_image_url: "https://scontent.xx.fbcdn.net/v/t39.35426-6/p1.jpg",
          link_url: "https://example.com/p1",
        },
        {
          title: "Product 2",
          resized_image_url: "https://scontent.xx.fbcdn.net/v/t39.35426-6/p2.jpg",
          link_url: "https://example.com/p2",
        },
        {
          title: "Product 3",
          image_url: "https://scontent.xx.fbcdn.net/v/t39.35426-6/p3.jpg",
          link_url: "https://example.com/p3",
        },
      ],
    },
  };

  const carouselMedia = extractMedia(mockCarouselNode);
  console.log("1. Extracted Carousel:", carouselMedia);

  if (carouselMedia.mediaType !== "carousel") {
    throw new Error(`Expected mediaType 'carousel', got '${carouselMedia.mediaType}'`);
  }
  if (carouselMedia.mediaUrls.length !== 3) {
    throw new Error(`Expected 3 mediaUrls, got ${carouselMedia.mediaUrls.length}`);
  }
  console.log("✓ Carousel extraction passed!");

  // Test 2: GraphQL Image Extraction
  const mockImageNode = {
    adArchiveID: "99990002",
    pageID: "brand-123",
    pageName: "Test Brand",
    snapshot: {
      body: { text: "Single image product ad" },
      images: [
        {
          original_image_url: "https://scontent.xx.fbcdn.net/v/t39.35426-6/single_img.jpg",
        },
      ],
    },
  };

  const imageMedia = extractMedia(mockImageNode);
  console.log("\n2. Extracted Image:", imageMedia);

  if (imageMedia.mediaType !== "image") {
    throw new Error(`Expected mediaType 'image', got '${imageMedia.mediaType}'`);
  }
  if (imageMedia.mediaUrls.length !== 1) {
    throw new Error(`Expected 1 mediaUrl, got ${imageMedia.mediaUrls.length}`);
  }
  console.log("✓ Single image extraction passed!");

  console.log(`\nB2 Storage Configured: ${isB2Configured()}`);
  console.log("✓ All local scan media extraction tests PASSED!");
  process.exit(0);
}

testLocalScanMedia().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
