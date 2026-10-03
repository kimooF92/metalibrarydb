import { NextResponse } from "next/server";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

const DEFAULT_SETTINGS = {
  id: "default",
  defaultCountry: "TN",
  autoMerge: true,
  autoDomainLink: true,
  staleHours: 12,
  autoSpyThreshold: 1,
  discoveryWindowDays: 7,
  autoB2Backup: true,
};

export async function GET() {
  try {
    let settings = await db.query.appSettings.findFirst({
      where: eq(appSettings.id, "default"),
    });

    if (!settings) {
      const [inserted] = await db
        .insert(appSettings)
        .values(DEFAULT_SETTINGS)
        .onConflictDoNothing()
        .returning();
      settings = inserted || DEFAULT_SETTINGS as any;
    }

    const rawTokens = process.env.APIFY_API_TOKENS || process.env.APIFY_API_TOKEN || "";
    const apifyTokensConfigured = rawTokens
      ? rawTokens
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean).length
      : 0;

    const b2Configured = Boolean(
      process.env.B2_APPLICATION_KEY_ID && process.env.B2_APPLICATION_KEY
    );
    const b2Bucket = process.env.B2_BUCKET || "meta-ad-media-feed";
    const isProduction = process.env.NODE_ENV === "production";
    const hasSavedReports = Boolean(
      settings?.savedOpportunityReport || settings?.savedMarketForecast
    );

    const telemetry = {
      apifyTokensConfigured,
      b2Configured,
      b2Bucket,
      isProduction,
      hasSavedReports,
    };

    return NextResponse.json({ success: true, settings, telemetry });
  } catch (error) {
    console.error("Error in GET /api/settings:", error);
    return NextResponse.json(
      {
        success: false,
        settings: DEFAULT_SETTINGS,
        telemetry: {
          apifyTokensConfigured: 0,
          b2Configured: false,
          b2Bucket: "meta-ad-media-feed",
          isProduction: process.env.NODE_ENV === "production",
          hasSavedReports: false,
        },
        error: "Failed to fetch settings from DB",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body.clearAiCache) {
      await db
        .update(appSettings)
        .set({
          savedOpportunityReport: null,
          savedMarketForecast: null,
          updatedAt: new Date(),
        })
        .where(eq(appSettings.id, "default"));

      return NextResponse.json({
        success: true,
        message: "AI reports cache cleared successfully",
      });
    }

    const updatePayload = {
      defaultCountry: typeof body.defaultCountry === "string" ? body.defaultCountry : "TN",
      autoMerge: typeof body.autoMerge === "boolean" ? body.autoMerge : true,
      autoDomainLink: typeof body.autoDomainLink === "boolean" ? body.autoDomainLink : true,
      staleHours: typeof body.staleHours === "number" ? Math.max(1, Math.min(72, body.staleHours)) : 12,
      autoSpyThreshold: typeof body.autoSpyThreshold === "number" ? Math.max(1, Math.min(20, body.autoSpyThreshold)) : 1,
      discoveryWindowDays: typeof body.discoveryWindowDays === "number" ? Math.max(1, Math.min(90, body.discoveryWindowDays)) : 7,
      autoB2Backup: typeof body.autoB2Backup === "boolean" ? body.autoB2Backup : true,
      updatedAt: new Date(),
    };

    const [updated] = await db
      .insert(appSettings)
      .values({
        id: "default",
        ...updatePayload,
      })
      .onConflictDoUpdate({
        target: appSettings.id,
        set: updatePayload,
      })
      .returning();

    return NextResponse.json({
      success: true,
      message: "Settings saved successfully",
      settings: updated,
    });
  } catch (error) {
    console.error("Error in POST /api/settings:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update settings" },
      { status: 500 }
    );
  }
}
