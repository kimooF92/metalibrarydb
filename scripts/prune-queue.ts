import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db, client } from "../db";
import { queue } from "../db/schema";
import { and, eq, lt } from "drizzle-orm";

async function pruneQueue() {
  console.log("==========================================");
  console.log(" Queue Retention Pruning (30-day window)  ");
  console.log("==========================================");

  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const deleted = await db
      .delete(queue)
      .where(
        and(
          eq(queue.status, "completed"),
          lt(queue.finishedAt, thirtyDaysAgo)
        )
      )
      .returning();

    console.log(`✅ Pruned ${deleted.length} completed queue job(s) older than 30 days.`);
  } catch (err) {
    console.error("❌ Queue pruning error:", err);
  } finally {
    await client.end();
  }
}

pruneQueue();
