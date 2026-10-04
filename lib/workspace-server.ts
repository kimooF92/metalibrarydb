import { cookies } from "next/headers";
import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

import { WORKSPACE_COOKIE_NAME, WORKSPACE_HEADER_NAME } from "./workspace-constants";
export { WORKSPACE_COOKIE_NAME, WORKSPACE_HEADER_NAME };

export interface WorkspaceRecord {
  id: string;
  name: string;
  slug: string;
  countryCode: string;
  currency: string;
  currencySymbol: string;
  flag: string;
  isDefault: boolean;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// In-memory cache for fast default workspace fallback
let cachedDefaultWorkspace: WorkspaceRecord | null = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minute

export async function getDefaultWorkspace(): Promise<WorkspaceRecord> {
  const now = Date.now();
  if (cachedDefaultWorkspace && now - lastCacheTime < CACHE_TTL_MS) {
    return cachedDefaultWorkspace;
  }

  // 1. Try finding isDefault = true
  const defaults = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.isDefault, true))
    .limit(1);

  if (defaults.length > 0) {
    cachedDefaultWorkspace = defaults[0];
    lastCacheTime = now;
    return defaults[0];
  }

  // 2. Fallback to first available workspace
  const first = await db
    .select()
    .from(workspaces)
    .orderBy(desc(workspaces.createdAt))
    .limit(1);

  if (first.length > 0) {
    cachedDefaultWorkspace = first[0];
    lastCacheTime = now;
    return first[0];
  }

  // 3. Fallback hardcoded Tunisia baseline if table is somehow empty
  return {
    id: "00000000-0000-0000-0000-000000000001",
    name: "Tunisia",
    slug: "tunisia",
    countryCode: "TN",
    currency: "TND",
    currencySymbol: "DT",
    flag: "🇹🇳",
    isDefault: true,
    description: "Default Tunisia Workspace",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export async function getActiveWorkspace(req?: Request): Promise<WorkspaceRecord> {
  let targetId: string | null = null;

  // 1. Check custom request header
  if (req) {
    const headerId = req.headers.get("x-workspace-id")?.trim();
    if (headerId) targetId = headerId;

    // 2. Check URL search param
    if (!targetId && req.url) {
      try {
        const url = new URL(req.url);
        const queryId = url.searchParams.get("workspaceId")?.trim();
        if (queryId) targetId = queryId;
      } catch {}
    }
  }

  // 3. Check Next.js async cookies
  if (!targetId) {
    try {
      const cookieStore = await cookies();
      const cookieVal = cookieStore.get(WORKSPACE_COOKIE_NAME)?.value?.trim();
      if (cookieVal) targetId = cookieVal;
    } catch {
      // In non-Next request context or middleware without next/headers
      if (req) {
        const rawCookies = req.headers.get("cookie") || "";
        const match = rawCookies.match(new RegExp(`(?:^|; )${WORKSPACE_COOKIE_NAME}=([^;]*)`));
        if (match && match[1]) targetId = decodeURIComponent(match[1].trim());
      }
    }
  }

  // 4. Resolve workspace by ID if valid UUID format
  const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  if (targetId && isUuid.test(targetId)) {
    try {
      const rows = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, targetId))
        .limit(1);

      if (rows.length > 0) {
        return rows[0];
      }
    } catch (e) {
      console.error("[getActiveWorkspace] Error resolving workspace by ID:", e);
    }
  }

  // 5. Fallback to default workspace
  return await getDefaultWorkspace();
}
