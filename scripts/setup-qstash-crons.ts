import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { getQstashClient, getAppBaseUrl, isQStashConfigured } from "../lib/qstash";

async function main() {
  console.log("==================================================");
  console.log("     Upstash QStash Cron Scheduler Setup          ");
  console.log("==================================================");

  const client = getQstashClient();
  if (!isQStashConfigured() || !client) {
    console.error("❌ QStash is not configured. Please ensure QSTASH_TOKEN is set in .env.local.");
    process.exit(1);
  }

  const appUrl = getAppBaseUrl();
  console.log(`📡 Application Base URL: ${appUrl}`);

  if (appUrl.includes("localhost")) {
    console.warn(
      "⚠️ Warning: Base URL is set to localhost. QStash requires a publicly reachable URL (e.g. your Vercel deployment URL)."
    );
    console.warn("💡 You can set NEXT_PUBLIC_APP_URL in .env.local (e.g. NEXT_PUBLIC_APP_URL=https://metalibrarydb.vercel.app)");
  }

  try {
    // 1. Fetch current schedules
    const existingSchedules = await client.schedules.list();
    console.log(`📋 Found ${existingSchedules.length} existing schedule(s) in QStash.\n`);

    for (const sched of existingSchedules) {
      console.log(` - ID: ${sched.scheduleId}`);
      console.log(`   Destination: ${sched.destination}`);
      console.log(`   Cron: ${sched.cron}`);
      console.log(`   Created: ${sched.createdAt ? new Date(sched.createdAt).toISOString() : "N/A"}\n`);
    }

    const args = process.argv.slice(2);
    if (args.includes("--list-only")) {
      process.exit(0);
    }

    // Define standard recurring jobs
    const desiredJobs = [
      {
        name: "Supabase Keep-Alive & Inactivity Reset",
        destination: `${appUrl}/api/cron/trigger-workers?target=keepalive`,
        cron: "0 */4 * * *", // Every 4 hours (resets Supabase 7-day inactivity pause)
      },
      {
        name: "Scheduled Worker Trigger (Ad Refresh & Spy)",
        destination: `${appUrl}/api/cron/trigger-workers?target=all`,
        cron: "0 6,18 * * *", // Twice daily (6 AM and 6 PM UTC)
      },
    ];

    console.log("🚀 Registering desired recurring schedules...");

    for (const job of desiredJobs) {
      // Check if already registered with exact destination
      const alreadyRegistered = existingSchedules.find(
        (s) => s.destination === job.destination && s.cron === job.cron
      );

      if (alreadyRegistered) {
        console.log(`✅ [Already Active] ${job.name} (${job.cron}) -> Schedule ID: ${alreadyRegistered.scheduleId}`);
      } else {
        const created = await client.schedules.create({
          destination: job.destination,
          cron: job.cron,
        });
        console.log(`🎉 [Created] ${job.name} (${job.cron}) -> Schedule ID: ${created.scheduleId}`);
      }
    }

    console.log("\n✅ QStash schedules configuration complete!");
    process.exit(0);
  } catch (err: any) {
    console.error("❌ Failed to setup QStash schedules:", err?.message || err);
    process.exit(1);
  }
}

main();
