import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../db";
import { sql } from "drizzle-orm";

async function migrate() {
  try {
    // Add is_watchlisted column if not exists
    await db.execute(sql`
      ALTER TABLE tracked_pages
      ADD COLUMN IF NOT EXISTS is_watchlisted BOOLEAN NOT NULL DEFAULT FALSE
    `);
    console.log("✅ Migration applied: is_watchlisted column added to tracked_pages");
  } catch (err) {
    console.error("Migration error:", err);
  }
}

migrate();
