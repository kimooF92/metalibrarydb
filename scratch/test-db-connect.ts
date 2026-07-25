import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import postgres from "postgres";

async function testConnection() {
  const url = process.env.DATABASE_URL || "";
  console.log("Testing connection string:", url.replace(/:[^:@]+@/, ":****@"));

  try {
    const sql = postgres(url, {
      prepare: false,
      max: 1,
      connect_timeout: 5,
      ssl: "require",
    });

    const res = await sql`SELECT 1 as test`;
    console.log("✅ DB Connection SUCCESS:", res);
    await sql.end();
  } catch (err) {
    console.error("❌ DB Connection ERROR:", err);
  }
}

testConnection();
