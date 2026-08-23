export const SESSION_COOKIE_NAME = "ad_tracker_session";
export const SESSION_DURATION_SECONDS = 30 * 24 * 60 * 60; // 30 days

/**
 * Returns the configured auth secret used to sign session cookies.
 */
export function getAuthSecret(): string {
  return (
    process.env.AUTH_SECRET ||
    process.env.DATABASE_URL ||
    "meta-ad-tracker-fallback-secret-2026-production"
  );
}

/**
 * Returns the configured master password.
 */
export function getAppPassword(): string | null {
  return process.env.APP_PASSWORD || null;
}

/**
 * Performs a constant-time comparison to prevent timing attacks.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  
  const aLen = a.length;
  const bLen = b.length;
  let mismatch = aLen === bLen ? 0 : 1;
  const len = Math.max(aLen, bLen);

  for (let i = 0; i < len; i++) {
    const charA = i < aLen ? a.charCodeAt(i) : 0;
    const charB = i < bLen ? b.charCodeAt(i) : 0;
    mismatch |= charA ^ charB;
  }

  return mismatch === 0;
}

/**
 * Web Crypto HMAC-SHA256 signature generation (compatible with Edge and Node.js).
 */
async function createHmacSignature(data: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  const signatureArray = Array.from(new Uint8Array(signatureBuffer));
  return btoa(String.fromCharCode(...signatureArray))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Signs a session payload and returns a compact token.
 */
export async function createSessionToken(expiresInSeconds: number = SESSION_DURATION_SECONDS): Promise<string> {
  const secret = getAuthSecret();
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now,
    exp: now + expiresInSeconds,
    nonce: Math.random().toString(36).substring(2, 15),
  };

  const encodedPayload = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const signature = await createHmacSignature(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

/**
 * Verifies a session token string. Returns payload if valid, or null if invalid or expired.
 */
export async function verifySessionToken(token: string | undefined | null): Promise<{ iat: number; exp: number } | null> {
  if (!token || typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [encodedPayload, signature] = parts;
  const secret = getAuthSecret();

  try {
    const expectedSignature = await createHmacSignature(encodedPayload, secret);
    if (!timingSafeEqual(signature, expectedSignature)) {
      return null;
    }

    // Decode base64url payload
    let base64 = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) {
      base64 += "=";
    }
    const jsonStr = atob(base64);
    const payload = JSON.parse(jsonStr);

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null; // Expired
    }

    return payload;
  } catch {
    return null;
  }
}

// In-memory rate limiting for login attempts (per IP)
interface RateLimitRecord {
  attempts: number;
  blockedUntil: number;
}

const rateLimitMap = new Map<string, RateLimitRecord>();

export function checkLoginRateLimit(ip: string): { allowed: boolean; waitSeconds?: number } {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record) {
    return { allowed: true };
  }

  if (record.blockedUntil > now) {
    return {
      allowed: false,
      waitSeconds: Math.ceil((record.blockedUntil - now) / 1000),
    };
  }

  // If block expired, reset
  if (record.blockedUntil !== 0 && record.blockedUntil <= now) {
    rateLimitMap.delete(ip);
  }

  return { allowed: true };
}

export function recordFailedLogin(ip: string): { attemptsLeft: number; blockedSeconds?: number } {
  const now = Date.now();
  const MAX_ATTEMPTS = 5;
  const BLOCK_DURATION_MS = 10 * 60 * 1000; // 10 minutes

  let record = rateLimitMap.get(ip);
  if (!record || (record.blockedUntil > 0 && record.blockedUntil <= now)) {
    record = { attempts: 0, blockedUntil: 0 };
  }

  record.attempts += 1;

  if (record.attempts >= MAX_ATTEMPTS) {
    record.blockedUntil = now + BLOCK_DURATION_MS;
    rateLimitMap.set(ip, record);
    return { attemptsLeft: 0, blockedSeconds: Math.ceil(BLOCK_DURATION_MS / 1000) };
  }

  rateLimitMap.set(ip, record);
  return { attemptsLeft: MAX_ATTEMPTS - record.attempts };
}

export function resetLoginRateLimit(ip: string) {
  rateLimitMap.delete(ip);
}
