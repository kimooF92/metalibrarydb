import crypto from "crypto";
import sharp from "sharp";

/**
 * Computes exact binary SHA-256 hash of a media buffer.
 * Ideal for Content-Addressable Storage (e.g. B2) and bit-for-bit duplicate checking.
 */
export function computeSha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * Computes a 64-bit Perceptual Difference Hash (dHash) from an image buffer using sharp.
 * Converts the image to 9x8 grayscale and computes horizontal gradient transitions.
 * 
 * Returns a 16-character hexadecimal string representing the 64-bit visual hash.
 * If the image cannot be decoded (e.g. corrupt or unsupported video stream), returns null.
 */
export async function computeDHash(imageBuffer: Buffer): Promise<string | null> {
  if (!imageBuffer || imageBuffer.length === 0) return null;

  try {
    const { data } = await sharp(imageBuffer)
      .resize(9, 8, { fit: "fill" })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    let binaryHash = "";
    // 8 rows x 8 horizontal comparisons = 64 bits
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const left = data[row * 9 + col];
        const right = data[row * 9 + col + 1];
        binaryHash += left > right ? "1" : "0";
      }
    }

    // Convert 64-bit binary string into 16-character lowercase hex string
    let hex = "";
    for (let i = 0; i < 64; i += 4) {
      const chunk = binaryHash.substring(i, i + 4);
      hex += parseInt(chunk, 2).toString(16);
    }

    return hex.toLowerCase();
  } catch (err: any) {
    // If sharp fails (e.g. video buffer passed directly instead of thumbnail), fail gracefully
    return null;
  }
}

/**
 * Computes the Hamming Distance (number of differing bits) between two 64-bit hex hashes.
 * 
 * - 0: Visually identical.
 * - 1 to 6: Near-identical image/creative (different compression, slight crop, resolution change).
 * - 7 to 10: Highly similar (minor text/watermark variation).
 * - > 10: Different creatives.
 */
export function getHammingDistance(hex1?: string | null, hex2?: string | null): number {
  if (!hex1 || !hex2 || hex1.length !== 16 || hex2.length !== 16) {
    return 64; // Max distance / incomparable
  }

  let distance = 0;
  for (let i = 0; i < 16; i++) {
    const val1 = parseInt(hex1[i], 16);
    const val2 = parseInt(hex2[i], 16);
    let xor = val1 ^ val2;
    // Count set bits (Kernighan's algorithm)
    while (xor > 0) {
      distance += xor & 1;
      xor >>= 1;
    }
  }

  return distance;
}

/**
 * Returns true if two perceptual hashes are visually identical or near-duplicate.
 * Default threshold is 6 bits difference out of 64.
 */
export function areVisuallyIdentical(
  hex1?: string | null,
  hex2?: string | null,
  threshold: number = 6
): boolean {
  if (!hex1 || !hex2) return false;
  if (hex1 === hex2) return true;
  return getHammingDistance(hex1, hex2) <= threshold;
}

/**
 * Extracts stable Meta CDN base asset identifier if present in URL.
 * Catches identical CDN assets even before downloading.
 */
export function extractMetaBaseAssetId(url?: string | null): string | null {
  if (!url) return null;
  try {
    // Look for standard Meta CDN path formats e.g. /v/t39.35426-6/456789_123456_n.jpg
    const match = url.match(/\/([a-zA-Z0-9_\-]+\.(?:jpg|jpeg|png|mp4|webp))/i);
    if (match && match[1]) {
      return match[1].toLowerCase();
    }
  } catch {}
  return null;
}
