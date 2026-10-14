import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken, UserRole } from "@/lib/auth";

/**
 * Reads the active user's role from server cookies (for Server Components, Route Handlers, and Server Actions).
 * Returns null if not authenticated.
 */
export async function getServerSessionRole(): Promise<UserRole | null> {
  const appPassword = process.env.APP_PASSWORD;
  const staffPassword = process.env.STAFF_PASSWORD;

  // Local development fallback when no passwords configured
  if ((!appPassword || appPassword.trim() === "") && (!staffPassword || staffPassword.trim() === "")) {
    return "admin";
  }

  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    const session = await verifySessionToken(token);
    return session?.role || (session ? "admin" : null);
  } catch {
    return null;
  }
}

/**
 * Asserts that the caller has administrator privileges. Throws an error if not.
 */
export async function requireAdmin(): Promise<void> {
  const role = await getServerSessionRole();
  if (role !== "admin") {
    throw new Error("Forbidden: Administrator access required.");
  }
}
