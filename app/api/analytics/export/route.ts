import { NextRequest, NextResponse } from "next/server";
import { validateApiSecret, getRoleFromRequest } from "@/lib/api-guard";
import { getActiveWorkspace, getTunisianWorkspace } from "@/lib/workspace-server";
import { serializeToCsv } from "@/lib/csv-utils";
import {
  getBrandsCsvData,
  getProductsCsvData,
  getCategoryMatrixCsvData,
  getAdsCsvData,
  CsvDataset,
  EXPORT_ROW_LIMIT,
} from "@/lib/analytics/csv-server";
import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const VALID_TYPES = new Set(["brands", "products", "categories", "ads"]);
const RANGE_MAP: Record<string, number> = {
  today: 1,
  "7d": 7,
  "14d": 14,
  "15d": 15,
  "30d": 30,
};

export async function GET(req: NextRequest) {
  // 1. Auth Guard
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const { searchParams } = req.nextUrl;
    const typeParam = searchParams.get("type")?.toLowerCase()?.trim();

    // 2. Validate Type
    if (!typeParam || !VALID_TYPES.has(typeParam)) {
      return NextResponse.json(
        {
          error: "Invalid or missing 'type' parameter. Expected: brands | products | categories | ads",
        },
        { status: 400 }
      );
    }

    // 3. Validate Range
    const rangeParam = searchParams.get("range")?.toLowerCase()?.trim() || "7d";
    if (rangeParam && !(rangeParam in RANGE_MAP)) {
      return NextResponse.json(
        {
          error: "Invalid 'range' parameter. Expected: today | 7d | 14d | 15d | 30d",
        },
        { status: 400 }
      );
    }
    const rangeDays = RANGE_MAP[rangeParam] ?? 7;

    // Lean mode support (default true)
    const leanParam = searchParams.get("lean");
    const isLean = leanParam === null || leanParam === "true" || leanParam === "1";

    // 4. Strict Workspace Resolution & Authorization
    const role = (await getRoleFromRequest(req)) || "admin";
    let targetWorkspaceId: string;
    let workspaceSlug = "workspace";

    if (role === "staff") {
      // Staff users are strictly scoped to the Tunisian workspace; reject/ignore attempts to access other workspaces
      const tunisianWs = await getTunisianWorkspace();
      targetWorkspaceId = tunisianWs.id;
      workspaceSlug = tunisianWs.slug || "tunisia";
    } else {
      const headerWorkspaceId = req.headers.get("x-workspace-id")?.trim();
      if (headerWorkspaceId) {
        if (!UUID_REGEX.test(headerWorkspaceId)) {
          return NextResponse.json(
            { error: "Invalid workspace UUID format in x-workspace-id header" },
            { status: 400 }
          );
        }
        const [found] = await db
          .select({ id: workspaces.id, slug: workspaces.slug })
          .from(workspaces)
          .where(eq(workspaces.id, headerWorkspaceId))
          .limit(1);

        if (!found) {
          return NextResponse.json(
            { error: "Specified workspace not found" },
            { status: 404 }
          );
        }
        targetWorkspaceId = found.id;
        workspaceSlug = found.slug || "workspace";
      } else {
        const activeWorkspace = await getActiveWorkspace(req);
        targetWorkspaceId = activeWorkspace.id;
        workspaceSlug = activeWorkspace.slug || "workspace";
      }
    }

    // 5. Fetch Dataset
    let dataset: CsvDataset;
    switch (typeParam) {
      case "brands":
        dataset = await getBrandsCsvData(targetWorkspaceId, rangeDays, isLean);
        break;
      case "products":
        dataset = await getProductsCsvData(targetWorkspaceId, rangeDays, isLean);
        break;
      case "categories":
        dataset = await getCategoryMatrixCsvData(targetWorkspaceId, rangeDays, isLean);
        break;
      case "ads":
        dataset = await getAdsCsvData(targetWorkspaceId, rangeDays, isLean);
        break;
      default:
        return NextResponse.json(
          { error: "Unsupported export type" },
          { status: 400 }
        );
    }

    // 6. Serialize to RFC 4180 CSV with UTF-8 BOM
    const csvString = serializeToCsv(dataset.headers, dataset.rows);

    // 7. Safe Filename
    const safeSlug = workspaceSlug.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
    const dateStamp = new Date().toISOString().split("T")[0];
    const filename = `${safeSlug}_${typeParam}_${dateStamp}.csv`;

    // 8. Return Attachment Stream / Response with Truncation Signals
    const responseHeaders: Record<string, string> = {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Export-Count": String(dataset.rows.length),
      "X-Export-Truncated": dataset.isTruncated ? "true" : "false",
      "X-Export-Limit": String(EXPORT_ROW_LIMIT),
    };

    return new NextResponse(csvString, {
      status: 200,
      headers: responseHeaders,
    });
  } catch (error: any) {
    // Log internal error on server without leaking SQL or schema internals to client
    console.error("[Analytics Export API] Error generating CSV export:", error);
    return NextResponse.json(
      { error: "Failed to generate CSV export" },
      { status: 500 }
    );
  }
}
