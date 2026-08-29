import { NextRequest, NextResponse } from "next/server";
import { generateBrandDossierPrompt, DossierPersona } from "@/lib/brand-dossier-exporter";
import { validateApiSecret } from "@/lib/api-guard";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_-]/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

export async function GET(req: NextRequest) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const pageId = searchParams.get("pageId") || searchParams.get("id");
    const persona = (searchParams.get("persona") || "strategic") as DossierPersona;
    const format = searchParams.get("format") || "download"; // download | json

    if (!pageId || pageId.trim() === "") {
      return NextResponse.json(
        { error: "Page ID or Tracked Page UUID is required (?pageId=...)" },
        { status: 400 }
      );
    }

    const result = await generateBrandDossierPrompt(pageId, persona);

    if (format === "json") {
      return NextResponse.json({
        prompt: result.markdownPrompt,
        meta: result.meta,
      });
    }

    // Default: Return as downloadable Markdown attachment
    const cleanBrandName = sanitizeFilename(result.meta.displayName || result.meta.pageId);
    const dateStamp = new Date().toISOString().split("T")[0];
    const filename = `brand-dossier-${cleanBrandName}-${result.meta.persona}-${dateStamp}.md`;

    return new NextResponse(result.markdownPrompt, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (err: any) {
    console.error("[Brand Dossier Export Error]:", err);
    return NextResponse.json(
      { error: err.message || "Failed to generate brand dossier prompt" },
      { status: 500 }
    );
  }
}
