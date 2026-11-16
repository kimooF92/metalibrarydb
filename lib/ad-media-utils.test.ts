import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isZeroAdResultText,
  isRateLimitedText,
  isInactiveCardText,
  isActiveCardText,
  isAdCreativeImage,
  consolidateRefreshedMedia,
} from "./ad-media-utils";

describe("ad-media-utils", () => {
  describe("isZeroAdResultText", () => {
    it("detects zero ad result and not found messages across languages", () => {
      assert.equal(isZeroAdResultText("There are 0 results matching your query"), true);
      assert.equal(isZeroAdResultText("No ads match your search criteria"), true);
      assert.equal(isZeroAdResultText("This ad has expired and is not in the Ad Library"), true);
      assert.equal(isZeroAdResultText("Aucun résultat ne correspond"), true);
      assert.equal(isZeroAdResultText("Ce contenu n'est pas disponible"), true);
      assert.equal(isZeroAdResultText("الإعلان غير موجود"), true);
      assert.equal(isZeroAdResultText("~0 results"), true);
    });

    it("returns false for regular active page text", () => {
      assert.equal(isZeroAdResultText("Sponsored ad running since Nov 1, 2026"), false);
      assert.equal(isZeroAdResultText("Library ID: 123456789012345"), false);
      assert.equal(isZeroAdResultText(""), false);
      assert.equal(isZeroAdResultText(null), false);
    });
  });

  describe("isRateLimitedText", () => {
    it("detects CAPTCHA and rate limit screens", () => {
      assert.equal(isRateLimitedText("Please enter the code below to confirm it's you"), true);
      assert.equal(isRateLimitedText("Security check required"), true);
      assert.equal(isRateLimitedText("Prouvez que vous êtes un humain"), true);
      assert.equal(isRateLimitedText("Rate limit exceeded"), true);
    });

    it("returns false for normal ad content", () => {
      assert.equal(isRateLimitedText("Shop our new collection with free shipping"), false);
    });
  });

  describe("isInactiveCardText & isActiveCardText", () => {
    it("identifies inactive badges", () => {
      assert.equal(isInactiveCardText("Inactive - Ended on Nov 10, 2026"), true);
      assert.equal(isInactiveCardText("Inactif"), true);
      assert.equal(isInactiveCardText("غير نشط"), true);
      assert.equal(isInactiveCardText("Active and delivering"), false);
    });

    it("identifies active badges", () => {
      assert.equal(isActiveCardText("Active - Started running on Nov 1, 2026"), true);
      assert.equal(isActiveCardText("Actif - Lancé le 1 nov 2026"), true);
      assert.equal(isActiveCardText("نشط"), true);
      assert.equal(isActiveCardText("Inactive - Ended"), false);
    });
  });

  describe("isAdCreativeImage", () => {
    it("accepts genuine ad creative URLs", () => {
      assert.equal(isAdCreativeImage("https://scontent.xx.fbcdn.net/v/t39.35426-6/4567_ad_creative.jpg"), true);
      assert.equal(isAdCreativeImage("https://video.xx.fbcdn.net/o1/v/t2/poster.jpg"), true);
    });

    it("filters out profile avatars, tiny icons, emojis, and static scripts", () => {
      assert.equal(isAdCreativeImage("https://scontent.xx.fbcdn.net/v/t39.30808-1/1234_avatar.jpg"), false);
      assert.equal(isAdCreativeImage("https://scontent.xx.fbcdn.net/v/t39.30808-6/s148x148/profile.jpg"), false);
      assert.equal(isAdCreativeImage("https://scontent.xx.fbcdn.net/v/t39.30808-6/s50x50/icon.png"), false);
      assert.equal(isAdCreativeImage("https://static.xx.facebook.com/rsrc.php/v3/y1/r/logo.png"), false);
      assert.equal(isAdCreativeImage("data:image/png;base64,abc"), false);
      assert.equal(isAdCreativeImage(null), false);
      assert.equal(isAdCreativeImage(""), false);
    });
  });

  describe("consolidateRefreshedMedia", () => {
    it("PRESERVES existing media when ad is expired or not found (prevents false media overwrite)", () => {
      const existingMedia = ["https://scontent.fbcdn.net/original-ad.jpg"];
      const existingThumb = "https://scontent.fbcdn.net/original-thumb.jpg";

      const res = consolidateRefreshedMedia({
        existingMediaUrls: existingMedia,
        existingThumbnailUrl: existingThumb,
        isNotFound: true,
        // Hypothetical stray images intercepted from Meta empty page
        cardImages: [],
        interceptedVideos: ["https://video.fbcdn.net/promo.mp4"],
      });

      assert.deepEqual(res.updatedMediaUrls, existingMedia);
      assert.equal(res.updatedThumbnailUrl, existingThumb);
      assert.equal(res.discoveredVideoUrl, null);
      assert.equal(res.videoRefreshed, false);
      assert.equal(res.thumbnailRefreshed, false);
    });

    it("does NOT attach intercepted videos to an image ad without a video element", () => {
      const existingMedia = ["https://scontent.fbcdn.net/original-ad.jpg"];

      const res = consolidateRefreshedMedia({
        existingMediaUrls: existingMedia,
        existingThumbnailUrl: "https://scontent.fbcdn.net/original-thumb.jpg",
        isNotFound: false,
        hasVideoElement: false, // NO video on card
        videoSrc: null,
        interceptedVideos: ["https://video.fbcdn.net/unrelated-promo.mp4"],
        cardImages: ["https://scontent.fbcdn.net/fresh-creative.jpg"],
      });

      assert.equal(res.discoveredVideoUrl, null);
      assert.deepEqual(res.updatedMediaUrls, ["https://scontent.fbcdn.net/fresh-creative.jpg"]);
      assert.equal(res.updatedThumbnailUrl, "https://scontent.fbcdn.net/fresh-creative.jpg");
    });

    it("attaches intercepted video only when card explicitly has a video element", () => {
      const existingMedia = ["https://scontent.fbcdn.net/old-video.mp4"];

      const res = consolidateRefreshedMedia({
        existingMediaUrls: existingMedia,
        existingThumbnailUrl: "https://scontent.fbcdn.net/old-thumb.jpg",
        isNotFound: false,
        hasVideoElement: true,
        videoSrc: null, // blob URL on card
        videoPoster: "https://scontent.fbcdn.net/fresh-poster.jpg",
        interceptedVideos: ["https://video.fbcdn.net/fresh-stream.mp4"],
      });

      assert.equal(res.discoveredVideoUrl, "https://video.fbcdn.net/fresh-stream.mp4");
      assert.equal(res.discoveredThumbnailUrl, "https://scontent.fbcdn.net/fresh-poster.jpg");
      assert.equal(res.updatedMediaUrls[0], "https://video.fbcdn.net/fresh-stream.mp4");
      assert.equal(res.updatedThumbnailUrl, "https://scontent.fbcdn.net/fresh-poster.jpg");
      assert.equal(res.videoRefreshed, true);
      assert.equal(res.thumbnailRefreshed, true);
    });

    it("preserves existing media if fresh card yielded zero creative images", () => {
      const existingMedia = ["https://scontent.fbcdn.net/creative.jpg"];
      const existingThumb = "https://scontent.fbcdn.net/thumb.jpg";

      const res = consolidateRefreshedMedia({
        existingMediaUrls: existingMedia,
        existingThumbnailUrl: existingThumb,
        isNotFound: false,
        hasVideoElement: false,
        cardImages: [], // Could not extract new creative images
      });

      assert.deepEqual(res.updatedMediaUrls, existingMedia);
      assert.equal(res.updatedThumbnailUrl, existingThumb);
      assert.equal(res.videoRefreshed, false);
      assert.equal(res.thumbnailRefreshed, false);
    });

    it("filters out avatar images from cardImages", () => {
      const existingMedia = ["https://scontent.fbcdn.net/old.jpg"];

      const res = consolidateRefreshedMedia({
        existingMediaUrls: existingMedia,
        existingThumbnailUrl: null,
        isNotFound: false,
        hasVideoElement: false,
        cardImages: [
          "https://scontent.fbcdn.net/v/t39.30808-1/avatar.jpg", // avatar
          "https://scontent.fbcdn.net/genuine-creative.jpg",     // genuine
        ],
      });

      assert.deepEqual(res.updatedMediaUrls, ["https://scontent.fbcdn.net/genuine-creative.jpg"]);
      assert.equal(res.updatedThumbnailUrl, "https://scontent.fbcdn.net/genuine-creative.jpg");
    });
  });
});
