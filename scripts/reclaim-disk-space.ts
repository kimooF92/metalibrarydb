import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import postgres from "postgres";

// Connect to Session Pooler (port 5432) because VACUUM FULL cannot run inside transaction pooler (6543)
const connStr = (process.env.DATABASE_URL || "").replace(":6543/", ":5432/");

console.log("==========================================");
console.log(" PostgreSQL Physical Disk Space Reclamation");
console.log("==========================================");
console.log("Connecting via Session Pooler (port 5432)...");

const sql = postgres(connStr, { ssl: "require", max: 1 });

async function reclaimDiskSpace() {
  try {
    const before = await sql`SELECT pg_size_pretty(pg_database_size(current_database())) AS size;`;
    console.log(`Database size before: ${before[0].size}`);

    console.log("\nRewriting tables and compacting disk pages (VACUUM FULL)...");
    
    process.stdout.write("Compacting queue... ");
    await sql.unsafe("VACUUM FULL queue;");
    console.log("✓");

    process.stdout.write("Compacting ad_observations... ");
    await sql.unsafe("VACUUM FULL ad_observations;");
    console.log("✓");

    process.stdout.write("Compacting scan_history... ");
    await sql.unsafe("VACUUM FULL scan_history;");
    console.log("✓");

    process.stdout.write("Compacting scraped_products (reclaiming TOAST table)... ");
    await sql.unsafe("VACUUM FULL scraped_products;");
    console.log("✓");

    process.stdout.write("Compacting ads... ");
    await sql.unsafe("VACUUM FULL ads;");
    console.log("✓");

    const after = await sql`SELECT pg_size_pretty(pg_database_size(current_database())) AS size;`;
    console.log("\n==========================================");
    console.log(`Database size after: ${after[0].size}`);
    console.log("==========================================");
    process.exit(0);
  } catch (err: any) {
    console.error("\n❌ Error during disk reclamation:", err.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

reclaimDiskSpace();
