import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { workerState } from "../db/schema";
import { eq } from "drizzle-orm";

async function resetLimits() {
  const { db, client } = await import("../db");
  console.log("Resetting internal scan limits in database...");
  try {
    const now = new Date();
    await db
      .update(workerState)
      .set({
        scansThisHour: 0,
        scansToday: 0,
        hourWindowStart: now,
        dayWindowStart: now,
        consecutiveFailures: 0,
        backoffUntil: null,
      })
      .where(eq(workerState.id, 1));
    console.log("✅ Hourly/Daily limits reset successfully! You can restart scanning now.");
  } catch (err) {
    console.error("❌ Failed to reset scan limits:", err);
  } finally {
    await client.end();
  }
}

resetLimits();
