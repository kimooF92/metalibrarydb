import { NextRequest, NextResponse } from "next/server";
import { mergeExactMatchWithPageId } from "@/actions/merge-pages";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { exactMatchTrackedPageId, resolvedPageId, resolvedDisplayName } = body;

    if (!exactMatchTrackedPageId || !resolvedPageId) {
      return NextResponse.json(
        { error: "exactMatchTrackedPageId and resolvedPageId are required." },
        { status: 400 }
      );
    }

    const result = await mergeExactMatchWithPageId(
      exactMatchTrackedPageId,
      resolvedPageId,
      resolvedDisplayName
    );

    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to merge pages" },
      { status: 500 }
    );
  }
}
