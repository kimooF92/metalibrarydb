import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { client } from "../db";
import fs from "fs";
import path from "path";

async function syncOpportunityReportsTable() {
  console.log("Applying 0028_opportunity_reports.sql to database...");

  try {
    const sqlPath = path.resolve(process.cwd(), "drizzle", "0028_opportunity_reports.sql");
    const sqlContent = fs.readFileSync(sqlPath, "utf-8");

    // Split on statement breakpoints
    const statements = sqlContent
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const statement of statements) {
      await client.unsafe(statement);
    }

    console.log("✓ Successfully created opportunity_reports table and applied RLS policies.");
    process.exit(0);
  } catch (err) {
    console.error("❌ Failed to sync opportunity_reports table:", err);
    process.exit(1);
  }
}

syncOpportunityReportsTable();
