import { NextResponse } from "next/server";
import { setPrimaryPage } from "@/lib/domain-portfolio";
import { validateApiSecret } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const { id: brandDomainId } = await params;
    const body = await req.json();
    const { trackedPageId } = body;

    if (!trackedPageId) {
      return NextResponse.json(
        { success: false, error: "trackedPageId is required" },
        { status: 400 }
      );
    }

    const result = await setPrimaryPage(brandDomainId, trackedPageId);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[POST /api/domains/[id]/set-primary] Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to set primary page" },
      { status: 500 }
    );
  }
}
