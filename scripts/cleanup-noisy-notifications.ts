import { db } from "../db";
import { activityNotifications } from "../db/schema";
import { eq, or, sql, and, like } from "drizzle-orm";

async function run() {
  console.log("🧹 Cleaning up legacy spam/no-change notifications...");

  const deleted = await db
    .delete(activityNotifications)
    .where(
      or(
        like(activityNotifications.message, "%(No change)%"),
        like(activityNotifications.title, "%Apify Scan Started%"),
        like(activityNotifications.title, "%Count Checked%")
      )
    );

  console.log("✓ Removed legacy spam/no-change notifications.");
  process.exit(0);
}

run().catch((err) => {
  console.error("Cleanup error:", err);
  process.exit(1);
});
