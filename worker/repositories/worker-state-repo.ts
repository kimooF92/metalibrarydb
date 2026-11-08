import { db } from "../../db";
import { appSettings, workerState } from "../../db/schema";
import { eq } from "drizzle-orm";

export async function getAppSettings() {
  try {
    const settings = await db.query.appSettings.findFirst({
      where: eq(appSettings.id, "default"),
    });
    return settings || {
      id: "default",
      defaultCountry: "ALL",
      autoMerge: true,
      staleHours: 12,
      autoSpyThreshold: 1,
      discoveryWindowDays: 7,
      autoB2Backup: true,
    };
  } catch (err) {
    console.warn("[App Settings] Failed to load settings from DB, using defaults:", err);
    return {
      id: "default",
      defaultCountry: "ALL",
      autoMerge: true,
      staleHours: 12,
      autoSpyThreshold: 1,
      discoveryWindowDays: 7,
      autoB2Backup: true,
    };
  }
}

export async function getWorkerState() {
  let state = await db.query.workerState.findFirst({
    where: eq(workerState.id, 1),
  });

  if (!state) {
    const [inserted] = await db
      .insert(workerState)
      .values({ id: 1, isPaused: false })
      .returning();
    state = inserted;
  }

  return state;
}

export async function updateWorkerState(
  updates: Partial<typeof workerState.$inferInsert>
) {
  await db
    .update(workerState)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(eq(workerState.id, 1));
}
