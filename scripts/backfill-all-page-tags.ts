/**
 * Backfill All Page Archetype Tags
 *
 * Runs the complete sweet-spot mathematical tagging engine across all tracked pages in the database.
 * Resolves borderline doubt clashes using Span/Jev (respan/span-02 via OpenRouter Decisions API).
 * Updates tracked_pages.tags in PostgreSQL.
 *
 * Usage:
 *   npx tsx scripts/backfill-all-page-tags.ts
 *   npx tsx scripts/backfill-all-page-tags.ts --dry-run
 *   npx tsx scripts/backfill-all-page-tags.ts --no-referee
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { client } from "../db";
import { resolvePageTag, persistPageTag, PageScanInput } from "../lib/page-tagger";

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run");
  const disableReferee = args.includes("--no-referee");

  console.log("============================================================");
  console.log(" 🚀 BACKFILL PAGE ARCHETYPE TAGS (SWEET-SPOT ENGINE)");
  console.log(` Mode: ${isDryRun ? "DRY-RUN (No DB updates)" : "LIVE (Persisting to tracked_pages.tags)"}`);
  console.log(` Span/Jev Referee: ${disableReferee ? "DISABLED" : "ENABLED (respan/span-02)"}`);
  console.log("============================================================\n");

  try {
    // 1. Fetch all pages and recent 12 scans in a single high-performance query
    console.log("Fetching pages and recent scan telemetry from database...");
    const pageRows = await client`
      WITH ranked_scans AS (
        SELECT 
          tracked_page_id,
          results,
          checked_at,
          ROW_NUMBER() OVER (PARTITION BY tracked_page_id ORDER BY checked_at DESC) as rn
        FROM scan_history
        WHERE results IS NOT NULL
      ),
      recent_12_scans AS (
        SELECT * FROM ranked_scans WHERE rn <= 12
      )
      SELECT 
        tp.id,
        tp.display_name,
        tp.current_results,
        tp.hold_status,
        tp.last_known_valid_results,
        tp.consecutive_zero_scans,
        json_agg(
          json_build_object('results', s.results, 'checked_at', s.checked_at)
          ORDER BY s.checked_at ASC
        ) as scans
      FROM tracked_pages tp
      LEFT JOIN recent_12_scans s ON s.tracked_page_id = tp.id
      GROUP BY tp.id, tp.display_name, tp.current_results, tp.hold_status, tp.last_known_valid_results, tp.consecutive_zero_scans
      ORDER BY tp.current_results DESC NULLS LAST;
    `;

    console.log(`Found ${pageRows.length} total tracked pages to tag.\n`);

    const tagCounts: Record<string, number> = {};
    const refereeDecisions: any[] = [];
    let updatedCount = 0;
    let refereeCount = 0;

    for (let i = 0; i < pageRows.length; i++) {
      const p = pageRows[i];
      const scansRaw = (p.scans || []).filter((s: any) => s && s.results !== null);
      const scans: PageScanInput[] = scansRaw.map((s: any) => ({
        results: Number(s.results),
        checkedAt: s.checked_at,
      }));

      const pageContext = {
        holdStatus: p.hold_status,
        lastKnownValidResults: p.last_known_valid_results,
        consecutiveZeroScans: p.consecutive_zero_scans,
      };

      // Resolve tag via hybrid sweet-spot engine with time-coupling and hold protection
      const resolved = await resolvePageTag(
        { id: p.id, displayName: p.display_name, currentResults: p.current_results },
        scans,
        { disableReferee },
        pageContext
      );

      tagCounts[resolved.tag] = (tagCounts[resolved.tag] || 0) + 1;

      if (resolved.resolvedByReferee) {
        refereeCount++;
        refereeDecisions.push({
          name: (p.display_name || "Unknown").slice(0, 20),
          current: p.current_results,
          refereeTag: resolved.tag.toUpperCase(),
          doubtContenders: resolved.pattern.doubtContenders?.join(" vs "),
          model: resolved.refereeModel || "respan/span-02",
        });
        console.log(
          `[Referee #${refereeCount}] 🎯 "${p.display_name || p.id}" (${p.current_results} ads) ➔ ${resolved.tag.toUpperCase()} (${resolved.pattern.doubtContenders?.join(" vs ")})`
        );
      }

      if (!isDryRun) {
        await persistPageTag(p.id, resolved.tag);
        updatedCount++;
      }
    }

    console.log("\n============================================================");
    console.log(" TAG DISTRIBUTION SUMMARY");
    console.log("============================================================");
    console.table(
      Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([tag, count]) => ({
          tag: tag.toUpperCase(),
          count,
          percentage: `${Math.round((count / pageRows.length) * 100)}%`,
        }))
    );

    if (refereeDecisions.length > 0) {
      console.log("\n============================================================");
      console.log(` SPAN/JEV REFEREE DECISIONS (${refereeDecisions.length} CLASHES RESOLVED)`);
      console.log("============================================================");
      console.table(refereeDecisions);
    }

    console.log("\n============================================================");
    console.log(`✅ Backfill completed successfully!`);
    console.log(`   Total pages processed: ${pageRows.length}`);
    console.log(`   Database tags persisted: ${isDryRun ? "0 (dry run)" : updatedCount}`);
    console.log(`   Span/Jev referee invocations: ${refereeCount}`);
    console.log("============================================================\n");
  } catch (err: any) {
    console.error("❌ Backfill encountered an error:", err);
    process.exit(1);
  } finally {
    await client.end();
    process.exit(0);
  }
}

main();
