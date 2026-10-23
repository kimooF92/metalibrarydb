import fs from "fs";
import path from "path";
import zlib from "zlib";
import postgres from "postgres";

async function runBackup() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("❌ ERROR: DATABASE_URL is not set in environment.");
    process.exit(1);
  }

  // Ensure backups directory exists
  const backupsDir = path.resolve(process.cwd(), "backups");
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupFileName = `backup_${timestamp}.json.gz`;
  const backupFilePath = path.join(backupsDir, backupFileName);

  console.log("==========================================");
  console.log(" PostgreSQL Automated Database Backup");
  console.log("==========================================");
  console.log(`Target: ${backupFilePath}`);

  // Connect to postgres with safe settings
  const sql = postgres(url, {
    ssl: "require",
    max: 1,
    fetch_types: false,
    idle_timeout: 120,
  });

  const startTime = Date.now();

  try {
    // 1. Get user tables in public schema
    const tables = await sql<{ table_name: string }[]>`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        AND table_name NOT LIKE '_drizzle%'
      ORDER BY table_name;
    `;

    console.log(`Found ${tables.length} tables to back up in schema 'public'.\n`);

    const outputStream = fs.createWriteStream(backupFilePath);
    const gzip = zlib.createGzip({ level: 9 });
    gzip.pipe(outputStream);

    // Write metadata header
    const metadata = {
      backupDate: new Date().toISOString(),
      tablesCount: tables.length,
      tables: tables.map((t) => t.table_name),
    };

    gzip.write(`{"_metadata":${JSON.stringify(metadata)},\n"tables":{`);

    let firstTable = true;
    let totalRows = 0;

    for (const { table_name } of tables) {
      if (!firstTable) {
        gzip.write(",\n");
      }
      firstTable = false;

      process.stdout.write(`  Dumping ${table_name}... `);
      gzip.write(`"${table_name}":[`);

      let tableRows = 0;
      let firstRow = true;

      // Stream rows in cursor/batches to avoid high memory spikes
      await sql.unsafe(`SELECT * FROM "${table_name}"`).cursor(2000, (rows) => {
        for (const row of rows) {
          if (!firstRow) {
            gzip.write(",");
          }
          firstRow = false;
          gzip.write(JSON.stringify(row));
          tableRows++;
          totalRows++;
        }
      });

      gzip.write("]");
      console.log(`✓ (${tableRows.toLocaleString()} rows)`);
    }

    gzip.write("}}\n");
    gzip.end();

    await new Promise<void>((resolve, reject) => {
      outputStream.on("finish", () => resolve());
      outputStream.on("error", (err) => reject(err));
      gzip.on("error", (err) => reject(err));
    });

    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);
    const stats = fs.statSync(backupFilePath);
    const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);

    console.log("\n==========================================");
    console.log("✅ Backup Completed Successfully!");
    console.log(`📦 File: ${backupFileName}`);
    console.log(`📊 Total rows: ${totalRows.toLocaleString()}`);
    console.log(`💾 Compressed size: ${sizeMb} MB`);
    console.log(`⏱️ Duration: ${elapsedSec}s`);
    console.log("==========================================");
  } catch (error) {
    console.error("❌ Backup failed:", error);
    if (fs.existsSync(backupFilePath)) {
      try {
        fs.unlinkSync(backupFilePath);
      } catch {}
    }
    process.exit(1);
  } finally {
    await sql.end();
  }
}

runBackup();
