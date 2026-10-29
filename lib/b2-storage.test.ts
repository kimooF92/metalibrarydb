import test from "node:test";
import assert from "node:assert/strict";
import {
  canUseSupabaseStorageFallback,
  isVideoMedia,
  MAX_SUPABASE_STORAGE_BYTES,
  registerPendingB2Upload,
  waitForB2UploadsDrain,
} from "./b2-storage";

test("allows only small non-video thumbnail fallbacks in Supabase", () => {
  assert.equal(canUseSupabaseStorageFallback("thumbnails", MAX_SUPABASE_STORAGE_BYTES), true);
  assert.equal(canUseSupabaseStorageFallback("thumbnails", MAX_SUPABASE_STORAGE_BYTES + 1), false);
  assert.equal(canUseSupabaseStorageFallback("thumbnails", 1024, true), false);
  assert.equal(canUseSupabaseStorageFallback("images", 1024), false);
  assert.equal(canUseSupabaseStorageFallback("videos", 1024), false);
  assert.equal(isVideoMedia("thumbnails", "https://cdn.example.test/asset", "video/webm"), true);
});

test("in-flight B2 upload queue tracks and drains properly", async () => {
  let resolved = false;
  const delayedPromise = new Promise((resolve) => {
    setTimeout(() => {
      resolved = true;
      resolve("done");
    }, 50);
  });

  registerPendingB2Upload(delayedPromise);
  const result = await waitForB2UploadsDrain(2000);

  assert.equal(resolved, true);
  assert.equal(result.remaining, 0);
  assert.ok(result.drained >= 1);
});
