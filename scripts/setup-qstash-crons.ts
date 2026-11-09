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
    const forceSync = args.includes("--sync") || args.includes("--force");
    if (args.includes("--list-only")) {
      process.exit(0);
    }

    const cronSecret = process.env.CRON_SECRET || process.env.API_SECRET || process.env.APP_PASSWORD;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (cronSecret) {
      headers["Authorization"] = `Bearer ${cronSecret}`;
      headers["x-api-secret"] = cronSecret;
      console.log(`🔐 Authorization headers will be attached using configured secret.`);
    } else {
      console.log(`ℹ️ No CRON_SECRET or APP_PASSWORD detected in local env; relying on cryptographic signature.`);
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
      {
        name: "Twice-Weekly Supplier Facebook Watchdog (Mon & Thu)",
        destination: `${appUrl}/api/cron/suppliers-watchdog`,
        cron: "0 20 * * 1,4", // Mondays and Thursdays at 20:00 UTC (21:30 local)
      },
    ];

    console.log("🚀 Registering and synchronizing desired recurring schedules...");

    for (const job of desiredJobs) {
      // Check if already registered with exact destination
      const alreadyRegistered = existingSchedules.find(
        (s) => s.destination === job.destination && s.cron === job.cron
      );

      const hasAuthHeader =
        alreadyRegistered &&
        alreadyRegistered.header &&
        (alreadyRegistered.header["x-api-secret"] || alreadyRegistered.header["authorization"] || alreadyRegistered.header["Authorization"]);

      if (alreadyRegistered && hasAuthHeader && !forceSync) {
        console.log(`✅ [Already Active & Configured] ${job.name} (${job.cron}) -> Schedule ID: ${alreadyRegistered.scheduleId}`);
      } else {
        if (alreadyRegistered) {
          console.log(`🔄 [Updating Schedule] Deleting outdated schedule ${alreadyRegistered.scheduleId} to refresh headers...`);
          await client.schedules.delete(alreadyRegistered.scheduleId);
        }

        const created = await client.schedules.create({
          destination: job.destination,
          cron: job.cron,
          headers,
        });
        console.log(`🎉 [Configured] ${job.name} (${job.cron}) -> Schedule ID: ${created.scheduleId}`);
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
