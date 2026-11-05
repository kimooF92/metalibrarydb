import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { suppliers, supplierPhotos } from "@/db/schema";
import { eq, and, sql, desc, ilike, or, gte, inArray } from "drizzle-orm";
import { getActiveWorkspace } from "@/lib/workspace-server";
import { normalizeFacebookPageUrl } from "@/lib/supplier-scraper";

export const dynamic = "force-dynamic";

/**
 * GET /api/suppliers
 * Fetches suppliers for the active workspace with filtering, search, and KPI metrics.
 */
export async function GET(req: NextRequest) {
  try {
    const activeWorkspace = await getActiveWorkspace(req);
    const { searchParams } = new URL(req.url);

    const q = searchParams.get("q")?.trim() || "";
    const status = searchParams.get("status") || "all";
    const category = searchParams.get("category") || "all";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "24", 10)));
    const offset = (page - 1) * limit;

    const conditions: any[] = [];
    if (activeWorkspace?.id) {
      conditions.push(eq(suppliers.workspaceId, activeWorkspace.id));
    }

    if (q) {
      conditions.push(
        or(
          ilike(suppliers.name, `%${q}%`),
          ilike(suppliers.facebookUrl, `%${q}%`),
          ilike(suppliers.notes, `%${q}%`)
        )
      );
    }

    if (status === "active") {
      conditions.push(eq(suppliers.status, "active"));
    } else if (status === "paused") {
      conditions.push(eq(suppliers.status, "paused"));
    } else if (status === "has_drop") {
      conditions.push(eq(suppliers.hasUnseenDrop, true));
    }

    if (category !== "all") {
      conditions.push(eq(suppliers.category, category));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // 1. Fetch total count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(suppliers)
      .where(whereClause);
    const totalCount = Number(countResult?.count || 0);

    // 2. Fetch paginated suppliers with explicit column projections
    const supplierRows = await db
      .select({
        id: suppliers.id,
        workspaceId: suppliers.workspaceId,
        name: suppliers.name,
        facebookUrl: suppliers.facebookUrl,
        facebookPageId: suppliers.facebookPageId,
        avatarUrl: suppliers.avatarUrl,
        phone: suppliers.phone,
        whatsapp: suppliers.whatsapp,
        category: suppliers.category,
        notes: suppliers.notes,
        status: suppliers.status,
        lastScrapeStatus: suppliers.lastScrapeStatus,
        lastScrapeError: suppliers.lastScrapeError,
        lastCheckedAt: suppliers.lastCheckedAt,
        lastPostDate: suppliers.lastPostDate,
        lastPostUrl: suppliers.lastPostUrl,
        lastAlbumUrl: suppliers.lastAlbumUrl,
        lastAlbumTitle: suppliers.lastAlbumTitle,
        lastAlbumPhotoCount: suppliers.lastAlbumPhotoCount,
        hasUnseenDrop: suppliers.hasUnseenDrop,
        createdAt: suppliers.createdAt,
        updatedAt: suppliers.updatedAt,
      })
      .from(suppliers)
      .where(whereClause)
      .orderBy(desc(suppliers.hasUnseenDrop), desc(suppliers.lastPostDate), desc(suppliers.createdAt))
      .limit(limit)
      .offset(offset);

    // 3. Batch fetch latest 4 preview photos for each returned supplier
    const supplierIds = supplierRows.map((s) => s.id);
    let previewMap: Record<string, any[]> = {};

    if (supplierIds.length > 0) {
      // Partition latest 4 photos per supplier
      const photos = await db
        .select({
          id: supplierPhotos.id,
          supplierId: supplierPhotos.supplierId,
          albumUrl: supplierPhotos.albumUrl,
          albumTitle: supplierPhotos.albumTitle,
          photoUrl: supplierPhotos.photoUrl,
          caption: supplierPhotos.caption,
          postedAt: supplierPhotos.postedAt,
          isPromotedToProduct: supplierPhotos.isPromotedToProduct,
          createdAt: supplierPhotos.createdAt,
        })
        .from(supplierPhotos)
        .where(inArray(supplierPhotos.supplierId, supplierIds))
        .orderBy(desc(supplierPhotos.postedAt), desc(supplierPhotos.createdAt));

      for (const p of photos) {
        if (!previewMap[p.supplierId]) {
          previewMap[p.supplierId] = [];
        }
        if (previewMap[p.supplierId].length < 4) {
          previewMap[p.supplierId].push(p);
        }
      }
    }

    // Attach previews
    const items = supplierRows.map((s) => ({
      ...s,
      previewPhotos: previewMap[s.id] || [],
    }));

    // 4. Compute overall KPI metrics
    const baseWorkspaceCondition = activeWorkspace?.id ? eq(suppliers.workspaceId, activeWorkspace.id) : undefined;
    const [kpiResult] = await db
      .select({
        total: sql<number>`count(*)`,
        active: sql<number>`count(*) filter (where ${suppliers.status} = 'active')`,
        unseenDrops: sql<number>`count(*) filter (where ${suppliers.hasUnseenDrop} = true)`,
      })
      .from(suppliers)
      .where(baseWorkspaceCondition);

    // Photos ingested in rolling 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [photosMonthResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(supplierPhotos)
      .where(gte(supplierPhotos.createdAt, thirtyDaysAgo));

    return NextResponse.json({
      success: true,
      suppliers: items,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.max(1, Math.ceil(totalCount / limit)),
      },
      stats: {
        totalSuppliers: Number(kpiResult?.total || 0),
        activeSuppliers: Number(kpiResult?.active || 0),
        unseenDropsCount: Number(kpiResult?.unseenDrops || 0),
        photosThisMonth: Number(photosMonthResult?.count || 0),
      },
    });
  } catch (err: any) {
    console.error("[API Suppliers] Error fetching suppliers:", err);
    return NextResponse.json({ error: "Failed to fetch suppliers", message: err?.message }, { status: 500 });
  }
}

/**
 * POST /api/suppliers
 * Adds a single supplier or performs a bulk import from an array of Facebook URLs.
 */
export async function POST(req: NextRequest) {
  try {
    const activeWorkspace = await getActiveWorkspace(req);
    const body = await req.json();

    // Mode A: Bulk import
    if (Array.isArray(body.urls) && body.urls.length > 0) {
      const urls: string[] = body.urls;
      const defaultCategory = body.defaultCategory || "general";
      let addedCount = 0;
      let skippedCount = 0;

      for (const rawUrl of urls) {
        if (!rawUrl || typeof rawUrl !== "string") continue;
        const normalized = normalizeFacebookPageUrl(rawUrl);
        if (!normalized || (!normalized.includes("facebook.com") && !normalized.includes("fb.me"))) {
          skippedCount++;
          continue;
        }

        // Derive fallback name from URL slug
        let name = "Supplier";
        try {
          const urlObj = new URL(normalized);
          const parts = urlObj.pathname.split("/").filter(Boolean);
          if (parts.length > 0) {
            name = parts[parts.length - 1].replace(/[-_.]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
          }
        } catch {}

        try {
          await db
            .insert(suppliers)
            .values({
              workspaceId: activeWorkspace?.id || null,
              name,
              facebookUrl: normalized,
              category: defaultCategory,
              status: "active",
            })
            .onConflictDoNothing();
          addedCount++;
        } catch {
          skippedCount++;
        }
      }

      return NextResponse.json({
        success: true,
        message: `Imported ${addedCount} suppliers (${skippedCount} skipped/duplicates).`,
        addedCount,
        skippedCount,
      });
    }

    // Mode B: Single supplier add
    const { name, facebookUrl, phone, whatsapp, category, notes } = body;
    if (!name || !facebookUrl) {
      return NextResponse.json({ error: "Name and Facebook URL are required." }, { status: 400 });
    }

    const normalizedUrl = normalizeFacebookPageUrl(facebookUrl);
    const [created] = await db
      .insert(suppliers)
      .values({
        workspaceId: activeWorkspace?.id || null,
        name: name.trim(),
        facebookUrl: normalizedUrl,
        phone: phone?.trim() || null,
        whatsapp: whatsapp?.trim() || null,
        category: category?.trim() || "general",
        notes: notes?.trim() || null,
        status: "active",
      })
      .onConflictDoNothing()
      .returning({ id: suppliers.id });

    if (!created) {
      return NextResponse.json({ error: "Supplier with this Facebook URL already exists in this workspace." }, { status: 409 });
    }

    return NextResponse.json({
      success: true,
      supplierId: created.id,
      message: "Supplier added successfully.",
    });
  } catch (err: any) {
    console.error("[API Suppliers] Error adding supplier:", err);
    return NextResponse.json({ error: "Failed to add supplier", message: err?.message }, { status: 500 });
  }
}

