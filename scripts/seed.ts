import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

// Dynamic import or loading after dotenv
import { workerState } from "../db/schema";
import { eq } from "drizzle-orm";

async function seed() {
  const { db, client } = await import("../db");
  console.log("Seeding database...");
  try {
    const existing = await db.query.workerState.findFirst({
      where: eq(workerState.id, 1),
    });

    if (!existing) {
      await db.insert(workerState).values({
        id: 1,
        isPaused: false,
        consecutiveFailures: 0,
        scansThisHour: 0,
        scansToday: 0,
      });
      console.log("✅ Seeded worker_state row (id=1).");
    } else {
      console.log("ℹ️ worker_state row already exists.");
    }
  } catch (err) {
    console.error("❌ Seed failed:", err);
  } finally {
    await client.end();
  }
}

seed();
