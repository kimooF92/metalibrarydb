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

  // 2. If no APP_PASSWORD is configured, allow requests (local unconfigured dev mode)
  if (!appPassword || appPassword.trim() === "") {
    return NextResponse.next();
  }

  // 3. Check for API Secret / Bearer Token authorization (for background workers & automation)
  const apiSecretHeader = request.headers.get("x-api-secret");
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
  const configuredApiSecret = process.env.API_SECRET || appPassword;

  if (apiSecretHeader && timingSafeEqual(apiSecretHeader, configuredApiSecret)) {
    return NextResponse.next();
  }

  if (bearerToken && (timingSafeEqual(bearerToken, configuredApiSecret) || timingSafeEqual(bearerToken, appPassword))) {
    return NextResponse.next();
  }

  // 4. Verify browser session cookie
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(sessionCookie);

  if (session) {
    // If authenticated user visits /login, redirect them to dashboard
    if (pathname === "/login") {
      return NextResponse.redirect(new URL("/", request.url));
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
