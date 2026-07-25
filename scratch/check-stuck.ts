import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { db } from "../db";
import { trackedPages, queue } from "../db/schema";
import { eq } from "drizzle-orm";

async function checkStuck() {
  const scanningPages = await db.query.trackedPages.findMany({
    where: eq(trackedPages.status, "scanning"),
  });

  const pendingPages = await db.query.trackedPages.findMany({
    where: eq(trackedPages.status, "pending"),
  });

  const runningQueue = await db.query.queue.findMany({
    where: eq(queue.status, "running"),
  });

  const pendingQueue = await db.query.queue.findMany({
    where: eq(queue.status, "pending"),
  });

  console.log(`Scanning Pages in tracked_pages: ${scanningPages.length}`);
  for (const p of scanningPages) {
    console.log(`  - Page ID: ${p.id} | Name: "${p.displayName}" | URL: ${p.url}`);
  }

  console.log(`\nPending Pages in tracked_pages: ${pendingPages.length}`);
  console.log(`Running Queue jobs: ${runningQueue.length}`);
  console.log(`Pending Queue jobs: ${pendingQueue.length}`);
}

checkStuck().catch(console.error);
