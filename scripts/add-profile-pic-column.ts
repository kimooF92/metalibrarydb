import { db } from "../db";
import { sql } from "drizzle-orm";

async function runMigration() {
  console.log("Applying non-destructive profile_pic_url column additions...");
  await db.execute(sql`
    ALTER TABLE tracked_pages ADD COLUMN IF NOT EXISTS profile_pic_url text;
  `);
  console.log("✓ Added profile_pic_url to tracked_pages");

  await db.execute(sql`
    ALTER TABLE brand_domains ADD COLUMN IF NOT EXISTS profile_pic_url text;
  `);
  console.log("✓ Added profile_pic_url to brand_domains");

  console.log("Migration complete!");
  process.exit(0);
}

runMigration().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
