import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { getApifyAccountBalance } from "../lib/apify";

async function check() {
  console.log("===============================================================");
  console.log("       APIFY KEY POOL & CYCLE LOOP ROTATION MONITOR           ");
  console.log("===============================================================\n");

  const balance = await getApifyAccountBalance({ forceRefresh: true });

  if (!balance || !balance.keys || balance.keys.length === 0) {
    console.error("❌ No Apify tokens found or failed to fetch balance info.");
    process.exit(1);
  }

  console.log(
    `Total Configured Keys: ${balance.totalTokensCount} | Active In-Use Key: #${balance.activeTokenIndex}`
  );
  console.log(
    `Total Pool Balance:    $${balance.totalPoolRemainingUsd.toFixed(2)} remaining of $${balance.totalPoolMaxUsd.toFixed(2)} (${balance.totalPoolUsagePercent}% pool used)\n`
  );

  console.log("--------------------------------------------------------------------------------------------------");
  console.log(
    `${"Key".padEnd(5)} | ${"Status".padEnd(10)} | ${"Remaining / Limit".padEnd(19)} | ${"Renewal Date".padEnd(14)} | ${"Days Left".padEnd(11)} | ${"Cycle Duration".padEnd(15)} | ${"Token Mask".padEnd(18)}`
  );
  console.log("--------------------------------------------------------------------------------------------------");

  for (const k of balance.keys) {
    const keyNum = `#${k.index}`.padEnd(5);
    const status = (k.isActive ? "ACTIVE" : k.isExhausted ? "EXHAUSTED" : "STANDBY").padEnd(10);
    const credits = `$${k.remainingUsd.toFixed(2)} / $${k.maxMonthlyUsageUsd.toFixed(2)}`.padEnd(19);
    const renewal = (k.renewalDateFormatted || "N/A").padEnd(14);
    const days = (k.daysRemaining !== null && k.daysRemaining !== undefined
      ? `${k.daysRemaining} day(s)`
      : "N/A"
    ).padEnd(11);
    const cycle = (k.cycleDaysTotal ? `${k.cycleDaysTotal}d (${k.cycleProgressPercent}%)` : "N/A").padEnd(15);
    const masked = k.token.padEnd(18);

    console.log(`${keyNum} | ${status} | ${credits} | ${renewal} | ${days} | ${cycle} | ${masked}`);
  }
  console.log("--------------------------------------------------------------------------------------------------\n");

  // Cycle Loop Rotation Schedule (sorted by days remaining)
  const sortedCycle = [...balance.keys]
    .filter((k) => typeof k.daysRemaining === "number")
    .sort((a, b) => (a.daysRemaining ?? 999) - (b.daysRemaining ?? 999));

  console.log("🔄 CYCLE LOOP ROTATION TIMELINE (When keys replenish):");
  if (sortedCycle.length === 0) {
    console.log("  No cycle date data available.");
  } else {
    sortedCycle.forEach((k, idx) => {
      const isNext = idx === 0;
      const arrow = isNext ? "👉 [NEXT UP]" : "   ";
      const statusTag = k.isActive ? "(Currently Active)" : k.isExhausted ? "(Exhausted)" : "(Standby)";
      console.log(
        `${arrow} Key #${k.index}: ${k.resetCountdownText} (${k.renewalDateFormatted}) -> unlocks $${k.maxMonthlyUsageUsd.toFixed(2)} credits ${statusTag}`
      );
    });
  }

  console.log("\n===============================================================");
}

check();
