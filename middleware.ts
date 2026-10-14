import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySessionToken, SESSION_COOKIE_NAME, timingSafeEqual } from "@/lib/auth";

// Paths that never require authentication
const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/status",
  "/api/spy/b2-media",
  "/api/spy/image-proxy",
  "/favicon.ico",
  "/icon.png",
  "/apple-icon.png",
];

// Pages staff are fully redirected away from (sent to /products)
const STAFF_BLOCKED_PAGES = [
  "/",
  "/settings",
  "/discovery",
  "/spy",
  "/fresh-winners",
  "/opportunities",
  "/import",
  "/analytics",
];

// API namespaces staff are fully blocked from (403)
const STAFF_BLOCKED_API_PREFIXES = [
  "/api/pages",       // GET tracked pages list
  "/api/page",        // GET/PATCH/DELETE individual page records (/api/page/...)
  "/api/stats",       // Dashboard stats — admin only
  "/api/analytics",   // Analytics data — admin only
  "/api/settings",
  "/api/worker",      // Worker pause/resume/reset controls
  "/api/queue",       // Queue management
  "/api/refresh",     // Trigger scan refresh
  "/api/retry",
  "/api/discovery",
  "/api/spy",
  "/api/import",
  "/api/apify",
  "/api/history",
  "/api/tracked-pages",
  "/api/webhooks",
  "/api/products/extract",
  "/api/products/add-url",
];

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // 1. Skip static assets, Next.js system routes, public media paths, and cron endpoints (handled internally)
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    pathname.startsWith("/api/spy/b2-media") ||
    pathname.startsWith("/api/spy/image-proxy") ||
    pathname.startsWith("/api/cron/") ||
    PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith("/api/auth/"))
  ) {
    return NextResponse.next();
  }

  const appPassword = process.env.APP_PASSWORD;
  const staffPassword = process.env.STAFF_PASSWORD;

  // 2. If no passwords at all are configured, allow requests (local unconfigured dev mode)
  if ((!appPassword || appPassword.trim() === "") && (!staffPassword || staffPassword.trim() === "")) {
    return NextResponse.next();
  }

  // 3. Check for API Secret / Bearer Token authorization (for background workers & automation)
  const apiSecretHeader = request.headers.get("x-api-secret");
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
  const configuredApiSecret = process.env.API_SECRET || appPassword;

  // Admin secret match
  if (
    (apiSecretHeader && ((configuredApiSecret && timingSafeEqual(apiSecretHeader, configuredApiSecret)) || (appPassword && timingSafeEqual(apiSecretHeader, appPassword)))) ||
    (bearerToken && ((configuredApiSecret && timingSafeEqual(bearerToken, configuredApiSecret)) || (appPassword && timingSafeEqual(bearerToken, appPassword))))
  ) {
    return NextResponse.next();
  }

  // Staff secret match
  let requestRole: "admin" | "staff" | null = null;
  if (staffPassword && staffPassword.trim() !== "") {
    if (
      (apiSecretHeader && timingSafeEqual(apiSecretHeader, staffPassword)) ||
      (bearerToken && timingSafeEqual(bearerToken, staffPassword))
    ) {
      requestRole = "staff";
    }
  }

  // 4. Verify browser session cookie
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(sessionCookie);

  if (session || requestRole) {
    const role = requestRole || session?.role || "admin";

    // If authenticated user visits /login, redirect to their home
    if (pathname === "/login") {
      const redirectUrl = role === "staff" ? "/products" : "/";
      return NextResponse.redirect(new URL(redirectUrl, request.url));
    }

    // Role-based restrictions for staff
    if (role === "staff") {
      // A. UI Route Gate: redirect blocked pages to /products
      const isBlockedPage =
        pathname === "/" ||
        STAFF_BLOCKED_PAGES.some(
          (p) => p !== "/" && (pathname === p || pathname.startsWith(p + "/"))
        );

      if (isBlockedPage) {
        return NextResponse.redirect(new URL("/products", request.url));
      }

      // B. API Route Gate: check blocked API endpoints
      if (pathname.startsWith("/api/")) {
        // Explicit carve-outs:
        // 1. Staff can add new tracked pages (POST /api/pages)
        const isAddPageAction = request.method === "POST" && pathname === "/api/pages";
        // 2. Staff can query linked ads for products (/api/spy/ads)
        const isProductAdsAction = pathname === "/api/spy/ads";

        if (!isAddPageAction && !isProductAdsAction) {
          const isBlockedApi = STAFF_BLOCKED_API_PREFIXES.some(
            (prefix) => pathname === prefix || pathname.startsWith(prefix + "/")
          );

          if (isBlockedApi) {
            return NextResponse.json(
              {
                error: "Forbidden",
                message: "Staff role is restricted from accessing this endpoint.",
              },
              { status: 403 }
            );
          }
        }
      }
    }

    return NextResponse.next();
  }

  // 5. Handle unauthenticated requests
  // For API endpoints, return JSON 401 Unauthorized
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        error: "Unauthorized",
        message: "Authentication required. Please log in or provide X-API-Secret header.",
      },
      { status: 401 }
    );
  }

  // For UI pages, redirect to /login with redirect return target
  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") {
    loginUrl.searchParams.set("from", pathname + search);
  }

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files with extensions (.svg, .png, .jpg, .jpeg, .gif, .webp)
     */
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
