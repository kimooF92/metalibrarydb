import crypto from "crypto";

const KEY_LENGTH = 64; // 64 bytes (512-bit key)
const SALT_BYTES = 16; // 16 bytes cryptographically random salt

/**
 * Generates a cryptographically random salt and hashes the password using scrypt.
 */
export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(SALT_BYTES).toString("hex");
  const derivedKey = crypto.scryptSync(password, salt, KEY_LENGTH);
  return {
    hash: derivedKey.toString("hex"),
    salt,
  };
}

/**
 * Verifies a candidate password against a stored scrypt hash and salt.
 * Uses timingSafeEqual to eliminate timing side-channels.
 */
export function verifyPassword(password: string, storedHash: string, storedSalt: string): boolean {
  if (!password || !storedHash || !storedSalt) {
    return false;
  }

  try {
    const derivedKey = crypto.scryptSync(password, storedSalt, KEY_LENGTH);
    const storedBuffer = Buffer.from(storedHash, "hex");

    if (derivedKey.length !== storedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(derivedKey, storedBuffer);
  } catch (err) {
    console.error("[crypto-password] Verification error:", err);
    return false;
  }
}

