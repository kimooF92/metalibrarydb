import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { db } from "../db";
import { trackedPages, queue } from "../db/schema";
import { eq } from "drizzle-orm";

async function fixNow() {
  await db
    .update(queue)
    .set({ status: "pending" })
    .where(eq(queue.status, "running"));

  await db
    .update(trackedPages)
    .set({ status: "pending" })
    .where(eq(trackedPages.status, "scanning"));

  console.log("✅ Reset all stuck scanning/running pages to pending.");
}

fixNow().catch(console.error);
