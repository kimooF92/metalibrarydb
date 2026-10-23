import fs from "fs";
import path from "path";
import zlib from "zlib";
import postgres from "postgres";

async function runRestore() {
  const backupArg = process.argv[2];
  const url = process.env.DATABASE_URL;

  if (!url) {
    console.error("❌ ERROR: DATABASE_URL is not set.");
    process.exit(1);
  }

  const backupsDir = path.resolve(process.cwd(), "backups");
  let targetFile = backupArg;

  if (!targetFile) {
    // Find the latest backup
    if (!fs.existsSync(backupsDir)) {
      console.error("❌ ERROR: No backups directory found.");
      process.exit(1);
    }
    const files = fs
      .readdirSync(backupsDir)
      .filter((f) => f.startsWith("backup_") && f.endsWith(".json.gz"))
      .sort()
      .reverse();

    if (files.length === 0) {
      console.error("❌ ERROR: No backup files found in ./backups");
      process.exit(1);
    }
    targetFile = path.join(backupsDir, files[0]);
    console.log(`No backup specified. Selected latest: ${files[0]}`);
  } else if (!fs.existsSync(targetFile)) {
    // Try resolving relative to backups/
    const inBackups = path.join(backupsDir, targetFile);
    if (fs.existsSync(inBackups)) {
      targetFile = inBackups;
    } else {
      console.error(`❌ ERROR: File not found: ${targetFile}`);
      process.exit(1);
    }
  }

  console.log("==========================================");
  console.log(" PostgreSQL Database Restore Helper");
  console.log("==========================================");
  console.log(`Source File: ${targetFile}`);

  const sql = postgres(url, {
    ssl: "require",
    max: 2,
    fetch_types: false,
    idle_timeout: 120,
  });

  try {
    console.log("Reading and decompressing backup payload...");
    const compressedBuffer = fs.readFileSync(targetFile);
    const jsonString = zlib.gunzipSync(compressedBuffer).toString("utf8");
    const data = JSON.parse(jsonString);

    const tables = Object.keys(data.tables || {});
    console.log(`Found ${tables.length} tables in backup file.\n`);

    for (const tableName of tables) {
      const rows = data.tables[tableName];
      if (!Array.isArray(rows) || rows.length === 0) {
        console.log(`  Skipping ${tableName} (0 rows)`);
        continue;
      }

      process.stdout.write(`  Restoring ${tableName} (${rows.length.toLocaleString()} rows)... `);

      // Insert in chunks of 500 rows
      const chunkSize = 500;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        // Postgres.js insert helper with ON CONFLICT DO NOTHING
        await sql`
          INSERT INTO ${sql(tableName)} ${sql(chunk)}
          ON CONFLICT DO NOTHING
        `;
      }

      console.log("✓");
    }

    console.log("\n==========================================");
    console.log("✅ Restore Completed Successfully!");
    console.log("==========================================");
  } catch (error) {
    console.error("❌ Restore failed:", error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

runRestore();
