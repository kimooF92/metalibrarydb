import { NextResponse } from "next/server";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

const DEFAULT_SETTINGS = {
  id: "default",
  defaultCountry: "TN",
  autoMerge: true,
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

    return NextResponse.json({ success: true, settings });
  } catch (error) {
    console.error("Error in GET /api/settings:", error);
    return NextResponse.json(
      { success: false, settings: DEFAULT_SETTINGS, error: "Failed to fetch settings from DB" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const updatePayload = {
      defaultCountry: typeof body.defaultCountry === "string" ? body.defaultCountry : "TN",
      autoMerge: typeof body.autoMerge === "boolean" ? body.autoMerge : true,
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
