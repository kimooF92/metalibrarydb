import { NextResponse } from "next/server";
import { unlinkPageFromDomain } from "@/lib/domain-portfolio";
import { validateApiSecret } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const { trackedPageId } = body;

    if (!trackedPageId) {
      return NextResponse.json(
        { success: false, error: "trackedPageId is required" },
        { status: 400 }
      );
    }

    const result = await unlinkPageFromDomain(trackedPageId);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[POST /api/domains/[id]/unlink] Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to unlink page" },
      { status: 500 }
    );
  }
}
