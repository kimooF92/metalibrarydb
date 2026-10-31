import test from "node:test";
import assert from "node:assert/strict";
import {
  getClientIp,
  checkRateLimit,
  rateLimitResponse,
  resetRateLimit,
  createLimiter,
} from "./ratelimit";

test("getClientIp correctly prioritizes headers", () => {
  const reqWithForwarded = new Request("http://localhost:3000/api/test", {
    headers: {
      "x-forwarded-for": "203.0.113.195, 70.41.3.18, 150.172.238.178",
      "x-real-ip": "198.51.100.1",
    },
  });
  assert.equal(getClientIp(reqWithForwarded), "203.0.113.195");

  const reqWithRealIp = new Request("http://localhost:3000/api/test", {
    headers: {
      "x-real-ip": "198.51.100.2",
    },
  });
  assert.equal(getClientIp(reqWithRealIp), "198.51.100.2");

  const reqWithCfIp = new Request("http://localhost:3000/api/test", {
    headers: {
      "cf-connecting-ip": "198.51.100.3",
    },
  });
  assert.equal(getClientIp(reqWithCfIp), "198.51.100.3");

  const reqDefault = new Request("http://localhost:3000/api/test");
  assert.equal(getClientIp(reqDefault), "127.0.0.1");
});

test("checkRateLimit fails open when limiter is null", async () => {
  const res = await checkRateLimit(null, "127.0.0.1");
  assert.equal(res.success, true);
  assert.equal(res.retryAfterSeconds, 0);
});

test("rateLimitResponse formats HTTP 429 correctly", async () => {
  const res = rateLimitResponse(45, "Custom rate limit message");
  assert.equal(res.status, 429);
  assert.equal(res.headers.get("Retry-After"), "45");
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.retryAfter, 45);
  assert.equal(data.error, "Custom rate limit message");
});

test("live rate limiting works with test limiter and reset", async () => {
  const testLimiter = createLimiter(2, "10 s", "rl:test:suite", "fixed");
  if (!testLimiter) {
    // If Redis is not configured in environment, skip gracefully
    return;
  }

  const testId = `test-runner-${Date.now()}`;

  // 1st request -> allowed
  const r1 = await checkRateLimit(testLimiter, testId);
  assert.equal(r1.success, true);

  // 2nd request -> allowed
  const r2 = await checkRateLimit(testLimiter, testId);
  assert.equal(r2.success, true);

  // 3rd request -> blocked
  const r3 = await checkRateLimit(testLimiter, testId);
  assert.equal(r3.success, false);
  assert.ok(r3.retryAfterSeconds > 0);

  // Reset tokens
  await resetRateLimit(testLimiter, testId);

  // Next request -> allowed again
  const r4 = await checkRateLimit(testLimiter, testId);
  assert.equal(r4.success, true);
});

