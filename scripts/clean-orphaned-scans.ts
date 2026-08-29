import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { cleanOrphanedScans } from "../lib/clean-scans";

async function main() {
  console.log("==========================================");
  console.log(" 🧹 Cleaning Orphaned & Stuck Scans...    ");
  console.log("==========================================");

  const timeoutMinutes = process.argv.includes("--all") ? 0 : 5;
  console.log(`Checking for scans stuck longer than ${timeoutMinutes === 0 ? "0m (force all)" : `${timeoutMinutes}m`}...`);

  const result = await cleanOrphanedScans(timeoutMinutes);

  console.log(`✅ Cleaned up:`);
  console.log(`   • ${result.fixedPages} tracked page(s) reset from 'scanning'`);
  console.log(`   • ${result.fixedScans} creative scan(s) marked failed from 'running'`);
  console.log(`   • ${result.fixedQueue} queue job(s) marked failed from 'running'`);
  console.log(`   • ${result.fixedDiscoveryRuns} discovery run(s) marked failed from 'running'`);
  console.log("==========================================");

  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Error cleaning orphaned scans:", err);
  process.exit(1);
});
