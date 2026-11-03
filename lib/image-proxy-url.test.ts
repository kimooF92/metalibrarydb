import test from "node:test";
import assert from "node:assert/strict";
import { getProxiedImageUrl, getSmartMediaUrl } from "./image-proxy-url";

test("getProxiedImageUrl returns empty string for null, undefined, or empty input", () => {
  assert.equal(getProxiedImageUrl(null), "");
  assert.equal(getProxiedImageUrl(undefined), "");
  assert.equal(getProxiedImageUrl(""), "");
});

test("getProxiedImageUrl formats valid URL using configured proxy base", () => {
  const target = "https://scontent.xx.fbcdn.net/v/t39.35426-6/sample.jpg";
  const proxied = getProxiedImageUrl(target);
  assert.ok(proxied.includes("url=" + encodeURIComponent(target)));
});

test("getProxiedImageUrl prevents double wrapping", () => {
  const alreadyProxiedCf = "https://meta-image-proxy.kareem-fezani.workers.dev/?url=https%3A%2F%2Ffbcdn.net%2Fa.jpg";
  assert.equal(getProxiedImageUrl(alreadyProxiedCf), alreadyProxiedCf);

  const alreadyProxiedLocal = "/api/spy/image-proxy?url=https%3A%2F%2Ffbcdn.net%2Fa.jpg";
  assert.equal(getProxiedImageUrl(alreadyProxiedLocal), alreadyProxiedLocal);
});

test("getSmartMediaUrl routes FB CDN URLs through Cloudflare directly", () => {
  const fbUrl = "https://scontent-iad3-1.xx.fbcdn.net/v/t39.35426-6/475823194_sample.jpg?_nc_cat=101&oe=67D1E8F0";
  const result = getSmartMediaUrl(fbUrl);
  assert.ok(result.includes("workers.dev") || result.includes("/api/spy/image-proxy"));
  assert.ok(result.includes(encodeURIComponent(fbUrl)));
});

test("getSmartMediaUrl leaves permanent storage URLs untouched by default", () => {
  const b2Url = "https://f005.backblazeb2.com/file/my-bucket/ad-123.jpg";
  assert.equal(getSmartMediaUrl(b2Url), b2Url);

  const supabaseUrl = "https://ymqeimihggnzfmsmbvcj.supabase.co/storage/v1/object/public/thumbnails/ad-123.jpg";
  assert.equal(getSmartMediaUrl(supabaseUrl), supabaseUrl);
});

test("getSmartMediaUrl forces proxy when forceProxy=true", () => {
  const b2Url = "https://f005.backblazeb2.com/file/my-bucket/ad-123.jpg";
  const result = getSmartMediaUrl(b2Url, true);
  assert.ok(result.includes("url=" + encodeURIComponent(b2Url)));
});
