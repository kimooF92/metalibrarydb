import { test } from "node:test";
import assert from "node:assert";
import {
  extractAdArchiveId,
  extractMedia,
  extractAdActiveStatus,
  parseAdStartDate,
  extractPageInfo,
} from "./apify/apify-normalizer";
import { isSafePublicUrl } from "./scraper/ssrf-validator";
import { normalizeTndMillimes } from "./scraper/price-parser";

test("extractPageInfo enforces numeric Meta Page IDs and rejects UUIDs", () => {
  // Numeric Page ID valid
  const itemWithNumericId = {
    pageId: "104829104820",
    pageName: "Authentic Store",
    profilePicUrl: "https://example.com/pic.jpg",
  };
  const res1 = extractPageInfo(itemWithNumericId);
  assert.strictEqual(res1.pageId, "104829104820");
  assert.strictEqual(res1.pageName, "Authentic Store");

  // UUID in candidate fields must NOT be assigned to pageId
  const itemWithUuid = {
    pageId: "d3b07384-d113-4662-8418-2997bb523178",
    page_id: "e4c18495-e224-5773-9529-3008cc634289",
    pageName: "d3b07384-d113-4662-8418-2997bb523178", // UUID as page name must also be rejected
  };
  const res2 = extractPageInfo(itemWithUuid);
  assert.strictEqual(res2.pageId, null);
  assert.strictEqual(res2.pageName, null);

  // Extract from URI match
  const itemWithUri = {
    page_profile_uri: "https://www.facebook.com/profile.php?id=98765432101",
    page_name: "Profile Page Name",
  };
  const res3 = extractPageInfo(itemWithUri);
  assert.strictEqual(res3.pageId, "98765432101");
  assert.strictEqual(res3.pageName, "Profile Page Name");
});

test("extractAdArchiveId extracts from direct fields and URL query params", () => {
  assert.strictEqual(extractAdArchiveId({ adArchiveId: "123456789" }), "123456789");
  assert.strictEqual(extractAdArchiveId({ snapshot: { ad_archive_id: "987654321" } }), "987654321");
  assert.strictEqual(
    extractAdArchiveId({ ad_library_url: "https://www.facebook.com/ads/library/?id=1497424319087029" }),
    "1497424319087029"
  );
  assert.strictEqual(extractAdArchiveId({}), "");
});

test("extractMedia identifies carousels, videos, and images correctly", () => {
  // Carousel with multiple cards
  const carouselItem = {
    cards: [
      { original_image_url: "https://example.com/card1.jpg" },
      { original_image_url: "https://example.com/card2.jpg" },
    ],
  };
  const resCarousel = extractMedia(carouselItem);
  assert.strictEqual(resCarousel.mediaType, "carousel");
  assert.strictEqual(resCarousel.mediaUrls.length, 2);

  // Video item
  const videoItem = {
    video_hd_url: "https://example.com/ad_video.mp4",
    snapshot: {
      videos: [{ video_preview_image_url: "https://example.com/preview.jpg" }],
    },
  };
  const resVideo = extractMedia(videoItem);
  assert.strictEqual(resVideo.mediaType, "video");
  assert.strictEqual(resVideo.thumbnailUrl, "https://example.com/preview.jpg");
});

test("extractAdActiveStatus accurately classifies active vs inactive", () => {
  assert.strictEqual(extractAdActiveStatus({ status: "ACTIVE" }), true);
  assert.strictEqual(extractAdActiveStatus({ status: "PAUSED" }), false);
  assert.strictEqual(extractAdActiveStatus({ status: "INACTIVE" }), false);
  assert.strictEqual(extractAdActiveStatus({ is_active: false }), false);
  assert.strictEqual(extractAdActiveStatus({ endDate: Date.now() - 10000 }), false);
  assert.strictEqual(extractAdActiveStatus({ endDate: Date.now() + 100000 }), true);
});

test("isSafePublicUrl blocks private and loopback subnets (BUG-08)", () => {
  assert.strictEqual(isSafePublicUrl("http://localhost:3000"), false);
  assert.strictEqual(isSafePublicUrl("http://127.0.0.1:8080"), false);
  assert.strictEqual(isSafePublicUrl("http://169.254.169.254/latest/meta-data"), false);
  assert.strictEqual(isSafePublicUrl("http://10.0.0.1/admin"), false);
  assert.strictEqual(isSafePublicUrl("http://192.168.1.1/router"), false);
  assert.strictEqual(isSafePublicUrl("http://172.16.0.1/internal"), false);
  assert.strictEqual(isSafePublicUrl("http://[::1]/"), false);
  assert.strictEqual(isSafePublicUrl("http://admin/"), false);

  // Safe public targets
  assert.strictEqual(isSafePublicUrl("https://store.example.com/products/item"), true);
  assert.strictEqual(isSafePublicUrl("https://mybrand.tn/produit/robe"), true);
});

test("normalizeTndMillimes handles 3-decimal Tunisian Dinar conversions (BUG-09)", () => {
  assert.strictEqual(normalizeTndMillimes(49000, "49.000 DT"), 49);
  assert.strictEqual(normalizeTndMillimes(49000, "49,000 TND"), 49);
  assert.strictEqual(normalizeTndMillimes(120, "120 DT"), 120);
});

