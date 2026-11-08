import { NextRequest, NextResponse } from "next/server";
import { validateApiSecret, validateAdminRole, getRoleFromRequest } from "@/lib/api-guard";
import { PRIVATE_AUTH_VARY, PRIVATE_DETAIL_CACHE_CONTROL, PRIVATE_READ_CACHE_CONTROL } from "@/lib/http-cache";
import { getActiveWorkspace } from "@/lib/workspace-server";
import {
  ALLOWED_PRODUCT_FILTERS,
  buildCanonicalProductCacheKey,
  fetchProducts,
  groupProductsIntoCarousels,
  buildProductProjections,
} from "@/services/product-query-service";
import { updateProduct, deleteProduct, extractPageId } from "@/services/product-mutation-service";

export {
  ALLOWED_PRODUCT_FILTERS,
  buildCanonicalProductCacheKey,
  groupProductsIntoCarousels,
  buildProductProjections,
  extractPageId,
};

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

/**
 * GET /api/products — Thin orchestrator delegating to product-query-service
 */
export async function GET(req: NextRequest) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const role = (await getRoleFromRequest(req)) || "admin";
    const activeWorkspace = await getActiveWorkspace(req);
    const { searchParams } = new URL(req.url);
    const clientTz = searchParams.get("tz") || req.headers.get("x-timezone");
    const includeDetails = Boolean(searchParams.get("id") || searchParams.get("productId"));

    const result = await fetchProducts({
      searchParams,
      workspaceId: activeWorkspace.id,
      countryCode: activeWorkspace.countryCode,
      role,
      clientTz,
    });

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": includeDetails ? PRIVATE_DETAIL_CACHE_CONTROL : PRIVATE_READ_CACHE_CONTROL,
        Vary: PRIVATE_AUTH_VARY,
      },
    });
  } catch (err: any) {
    console.error("[Products API Error]:", err);
    return NextResponse.json({ success: false, error: err.message || "Failed to load products" }, { status: 500 });
  }
}

/**
 * PATCH /api/products — Thin orchestrator delegating to product-mutation-service
 */
export async function PATCH(req: NextRequest) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const activeWorkspace = await getActiveWorkspace(req);
    const role = (await getRoleFromRequest(req)) || "admin";
    const body = await req.json();

    if (!body?.id) {
      return NextResponse.json({ error: "Product id is required." }, { status: 400 });
    }

    const { product, supplierUrls } = await updateProduct(body.id, body, activeWorkspace.id, role as "admin" | "staff");
    return NextResponse.json({ success: true, message: "Product updated successfully.", product, supplierUrls });
  } catch (err: any) {
    console.error("[Products PATCH API Error]:", err);
    return NextResponse.json({ error: err.message || "Failed to update product" }, { status: 500 });
  }
}

/**
 * DELETE /api/products — Thin orchestrator delegating to product-mutation-service
 */
export async function DELETE(req: NextRequest) {
  const authError = await validateAdminRole(req);
  if (authError) return authError;

  try {
    const activeWorkspace = await getActiveWorkspace(req);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Product id is required." }, { status: 400 });
    }

    await deleteProduct(id, activeWorkspace.id);
    return NextResponse.json({ success: true, message: "Product deleted successfully." });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to delete product" }, { status: 500 });
  }
}
