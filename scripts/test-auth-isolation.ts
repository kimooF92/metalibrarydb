import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

// Delete APP_PASSWORD to test that auth works 100% without it
delete process.env.APP_PASSWORD;

async function main() {
  console.log("🔒 Running Authentication Isolation & Zero-APP_PASSWORD Test...\n");

  // 1. Verify /api/auth/status detects database password
  const { GET: statusGet } = await import("../app/api/auth/status/route");
  const statusRes = await statusGet();
  const statusData = await statusRes.json();
  console.log(`1. /api/auth/status isConfigured: ${statusData.isConfigured} (Expected: true)`);
  if (!statusData.isConfigured) {
    throw new Error("Failed: statusData.isConfigured must be true from database settings!");
  }

  // 2. Verify middleware intercepts unauthenticated UI requests
  const { middleware } = await import("../middleware");
  const { NextRequest } = await import("next/server");
  const unauthReq = new NextRequest("http://localhost:3000/");
  const midRes = await middleware(unauthReq);
  const location = midRes.headers.get("location");
  console.log(`2. Middleware unauthenticated response: status=${midRes.status}, location=${location} (Expected: redirect to /login)`);
  if (!location?.includes("/login")) {
    throw new Error("Failed: Unauthenticated visitor must be redirected to /login!");
  }

  // 3. Verify middleware allows authenticated requests with session cookie
  const { createSessionToken, SESSION_COOKIE_NAME } = await import("../lib/auth");
  const token = await createSessionToken();
  const authReq = new NextRequest("http://localhost:3000/");
  authReq.cookies.set(SESSION_COOKIE_NAME, token);
  const midAuthRes = await middleware(authReq);
  const nextHeader = midAuthRes.headers.get("x-middleware-next");
  console.log(`3. Middleware authenticated session: x-middleware-next=${nextHeader} (Expected: '1')`);
  if (nextHeader !== "1") {
    throw new Error("Failed: Valid session cookie must be allowed through middleware!");
  }

  // 4. Verify API guard accepts dedicated API_SECRET
  const { getRoleFromRequest } = await import("../lib/api-guard");
  process.env.API_SECRET = "test_machine_secret_987";
  const apiReq = new Request("http://localhost:3000/api/cron/trigger", {
    headers: { "x-api-secret": "test_machine_secret_987" },
  });
  const role = await getRoleFromRequest(apiReq);
  console.log(`4. API Guard with x-api-secret: role=${role} (Expected: 'admin')`);
  if (role !== "admin") {
    throw new Error("Failed: API_SECRET must authenticate caller as admin!");
  }

  console.log("\n✅ All zero-APP_PASSWORD auth isolation tests passed successfully!");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
