import { db } from "../db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Applying discovery_runs scan limit columns migration...");
  await db.execute(sql`
    ALTER TABLE discovery_runs
    ADD COLUMN IF NOT EXISTS target_max_ads integer DEFAULT 2500,
    ADD COLUMN IF NOT EXISTS max_scrolls integer DEFAULT 150;
  `);
  console.log("Migration completed successfully.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
