import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { client } from "../db";

async function runMaintenance() {
  console.log("==========================================");
  console.log(" Database Storage Maintenance Trigger     ");
  console.log("==========================================");

  try {
    console.log("Invoking public.run_storage_maintenance()...");
    const result = await client`SELECT public.run_storage_maintenance() AS summary;`;
    
    if (result && result.length > 0) {
      console.log("\n✅ Maintenance completed successfully!");
      console.log(JSON.stringify(result[0].summary, null, 2));
    }

    console.log("\nRunning ANALYZE to refresh query optimizer statistics...");
    await client`ANALYZE queue;`;
    await client`ANALYZE scan_history;`;
    await client`ANALYZE ad_observations;`;
    await client`ANALYZE scraped_products;`;
    await client`ANALYZE ads;`;
    console.log("✓ Statistics updated.");

    // Check cron status
    const cronJobs = await client`
      SELECT jobid, jobname, schedule, active 
      FROM cron.job 
      WHERE jobname = 'nightly-storage-maintenance';
    `;
    if (cronJobs.length > 0) {
      console.log(`\n✓ Nightly cron is active: schedule="${cronJobs[0].schedule}" (3:00 AM UTC)`);
    }

    process.exit(0);
  } catch (err: any) {
    console.error("❌ Maintenance error:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMaintenance();
