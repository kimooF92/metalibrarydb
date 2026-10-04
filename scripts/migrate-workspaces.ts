import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { client, db } from "../db";
import fs from "fs";
import path from "path";

async function run() {
  console.log("🚀 Starting Workspaces Engine Database Migration & Backfill...");

  const sqlFilePath = path.join(__dirname, "../drizzle/0020_workspaces_engine.sql");
  const rawSql = fs.readFileSync(sqlFilePath, "utf-8");

  // Split by drizzle statement breakpoints
  const statements = rawSql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  console.log(`Executing ${statements.length} migration statements...`);

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    try {
      await client.unsafe(stmt);
      console.log(`  ✓ Executed statement ${i + 1}/${statements.length}`);
    } catch (err: any) {
      console.error(`  ✗ Error on statement ${i + 1}:`, err.message);
      throw err;
    }
  }

  // Verification queries
  const workspacesCount = await client.unsafe(`SELECT count(*) as count FROM workspaces`);
  const workspacesList = await client.unsafe(`SELECT id, name, slug, country_code, currency, flag, is_default FROM workspaces`);
  const pagesCount = await client.unsafe(`SELECT count(*) as count, workspace_id FROM tracked_pages GROUP BY workspace_id`);
  const productsCount = await client.unsafe(`SELECT count(*) as count, workspace_id FROM scraped_products GROUP BY workspace_id`);

  console.log("\n✅ Migration & Backfill Complete!");
  console.log("Workspaces in DB:", workspacesList);
  console.log("Tracked pages per workspace:", pagesCount);
  console.log("Products per workspace:", productsCount);
}

run()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await client.end();
  });
