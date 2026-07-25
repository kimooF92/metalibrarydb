import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function inspect() {
  const { db, client } = await import("../db");
  try {
    const pages = await db.query.trackedPages.findMany();
    console.log("Current tracked pages count:", pages.length);
    console.log("Pages:", pages);

    const imports = await db.query.importJobs.findMany();
    console.log("Import jobs:", imports);
  } catch (err) {
    console.error("Error inspecting DB:", err);
  } finally {
    await client.end();
  }
}

inspect();
