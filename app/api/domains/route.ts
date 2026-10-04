import { NextResponse } from "next/server";
import { listDomainPortfolios, getOrCreateBrandDomain } from "@/lib/domain-portfolio";
import { validateApiSecret } from "@/lib/api-guard";
import { getActiveWorkspace } from "@/lib/workspace-server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const activeWorkspace = await getActiveWorkspace(req);
    const portfolios = await listDomainPortfolios(activeWorkspace?.id);
    return NextResponse.json({ success: true, domains: portfolios });
  } catch (err: any) {
    console.error("[GET /api/domains] Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch domain portfolios" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const { domain, displayName } = body;

    if (!domain || typeof domain !== "string") {
      return NextResponse.json(
        { success: false, error: "domain is required" },
        { status: 400 }
      );
    }

    const activeWorkspace = await getActiveWorkspace(req);
    const brandDomain = await getOrCreateBrandDomain(domain, displayName, activeWorkspace?.id);
    return NextResponse.json({ success: true, brandDomain });
  } catch (err: any) {
    console.error("[POST /api/domains] Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to create/resolve domain" },
      { status: 500 }
    );
  }
}
