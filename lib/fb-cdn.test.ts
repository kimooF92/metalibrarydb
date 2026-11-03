import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isFbCdnUrl,
  isPermanentMediaUrl,
  isFbCdnUrlExpired,
  getFbCdnExpirationDate,
} from "./fb-cdn";

describe("fb-cdn utilities", () => {
  it("correctly identifies FB CDN URLs", () => {
    assert.equal(isFbCdnUrl("https://video-mrs2-2.xx.fbcdn.net/o1/v/t2/sample.mp4"), true);
    assert.equal(isFbCdnUrl("https://scontent.xx.fbcdn.net/v/t39/sample.jpg"), true);
    assert.equal(isFbCdnUrl("https://static.xx.facebook.com/rsrc.php/v3/y1.png"), true);
    assert.equal(isFbCdnUrl("https://fbsbx.com/test.jpg"), true);
    assert.equal(isFbCdnUrl("https://cdninstagram.com/test.jpg"), true);
    assert.equal(isFbCdnUrl("https://f729.backblazeb2.com/file/meta-ads/video.mp4"), false);
    assert.equal(isFbCdnUrl("https://files.catbox.moe/abc123.jpg"), false);
    assert.equal(isFbCdnUrl(null), false);
    assert.equal(isFbCdnUrl(""), false);
  });

  it("correctly identifies permanent storage URLs", () => {
    assert.equal(isPermanentMediaUrl("https://f729.backblazeb2.com/file/meta-ads/video.mp4"), true);
    assert.equal(isPermanentMediaUrl("https://files.catbox.moe/thumb_123.jpg"), true);
    assert.equal(isPermanentMediaUrl("https://xyz.supabase.co/storage/v1/object/public/ad.jpg"), true);
    assert.equal(isPermanentMediaUrl("https://video-mrs2-2.xx.fbcdn.net/video.mp4"), false);
  });

  it("detects expired FB CDN URL via hex oe timestamp", () => {
    // Current time is roughly 2026-11-03
    // Expired timestamp in the past: 2024-01-01 00:00:00 UTC = 1704067200 -> hex 65920780
    const pastUrl = "https://video.xx.fbcdn.net/o1/v/t2/ad.mp4?oh=1234&oe=65920780";
    assert.equal(isFbCdnUrlExpired(pastUrl), true);

    // Future timestamp: 2030-01-01 00:00:00 UTC = 1893456000 -> hex 70DF6380
    const futureUrl = "https://video.xx.fbcdn.net/o1/v/t2/ad.mp4?oh=1234&oe=70DF6380";
    assert.equal(isFbCdnUrlExpired(futureUrl), false);
  });

  it("never marks permanent storage URLs as expired", () => {
    const b2Url = "https://f729.backblazeb2.com/file/meta-ads/video.mp4?oe=65920780";
    assert.equal(isFbCdnUrlExpired(b2Url), false);
  });

  it("handles URLs without oe param gracefully (returns false to let video element attempt load)", () => {
    const noOeUrl = "https://video.xx.fbcdn.net/o1/v/t2/ad.mp4";
    assert.equal(isFbCdnUrlExpired(noOeUrl), false);
  });

  it("correctly parses expiration Date", () => {
    // 1704067200 = 2024-01-01T00:00:00.000Z -> hex 65920080
    const url = "https://video.xx.fbcdn.net/v/ad.mp4?oe=65920080";
    const date = getFbCdnExpirationDate(url);
    assert.ok(date instanceof Date);
    assert.equal(date?.toISOString(), "2024-01-01T00:00:00.000Z");

    assert.equal(getFbCdnExpirationDate("https://example.com/test.mp4"), null);
    assert.equal(getFbCdnExpirationDate(null), null);
  });
});
