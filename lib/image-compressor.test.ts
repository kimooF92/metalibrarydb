import { test, describe } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { compressImageBuffer } from "./image-compressor";

describe("Image Compressor (Max Compression)", () => {
  test("compresses raw PNG/JPEG buffer to WebP with significant size reduction", async () => {
    // Generate a 1000x1000 test image using sharp
    const inputBuffer = await sharp({
      create: {
        width: 1000,
        height: 1000,
        channels: 3,
        background: { r: 220, g: 110, b: 50 },
      },
    })
      .jpeg({ quality: 95 })
      .toBuffer();

    assert.ok(inputBuffer.length > 5000);

    const result = await compressImageBuffer(inputBuffer, { keyPrefix: "thumbnails" });

    assert.equal(result.contentType, "image/webp");
    assert.equal(result.ext, ".webp");
    assert.ok(result.compressedSize < inputBuffer.length);
    assert.ok(result.isCompressed);

    // Verify metadata of compressed image
    const meta = await sharp(result.buffer).metadata();
    assert.equal(meta.format, "webp");
    assert.ok((meta.width || 0) <= 500);
    assert.ok((meta.height || 0) <= 500);
  });

  test("gracefully falls back on corrupted buffer without crashing", async () => {
    const corruptBuffer = Buffer.from("not-a-valid-image-data-string");
    const result = await compressImageBuffer(corruptBuffer, { keyPrefix: "thumbnails" });

    assert.equal(result.isCompressed, false);
    assert.equal(result.buffer.toString(), corruptBuffer.toString());
  });
});

