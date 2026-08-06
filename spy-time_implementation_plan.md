# Implementation Plan — Ad Spy Scheduled Workflows, Auto-Archival & Sorting Enhancements

Enhance the Ad Spy subsystem with dedicated scheduled workflows, automatic archival of deactivated ads, multi-attribute sorting in the feed UI, smart +1 result difference filtering, pre-scan result count updating, and aligned GraphQL+DOM dual-extraction.

---

## User Review Required

> [!IMPORTANT]
> **Pre-Scan Result Count Refresh**:
> Before initiating deep GraphQL/DOM creative extraction during an Ad Spy scan, the worker will **first run `scanMetaAdPage()` to extract and update the live result count** (`currentResults`, `lastChecked`, `scanHistory`). This ensures the live result count and scan history are freshly updated right before ad creatives are extracted.

> [!IMPORTANT]
> **Dual Scanner Alignment (`spy-scanner.ts` + `dom-scanner.ts`)**:
> - **GraphQL Interception**: Captures full structured ad metadata directly from Meta's `/api/graphql/` endpoints.
> - **DOM Extraction**: Scans rendered card DOM nodes every 5 scroll iterations and on final sweep to capture virtualized cards and enrich missing fields (captions, destination links, non-logo thumbnails).
> - Both scanners map to the unified `ExtractedAdData` interface, producing a deduplicated, rich ad collection matching the output goal.

> [!IMPORTANT]
> **Ad Spy Target Filtering (`difference >= +1` Rule)**: 
> - For **first-time creative scans** (pages never scanned for creatives), the worker will scan if `currentResults >= 1`.
> - For **subsequent creative scans**, the worker will **ONLY** enqueue a creative scan if **`difference >= 1`** (i.e. new ads were added since the last scan). If `difference <= 0`, the creative scan is skipped, saving worker capacity and proxy bandwidth.

> [!IMPORTANT]
> **Zero-Overlap Afternoon Execution Schedule**: 
> - Count worker runs in 3-hour morning (9 AM–11:30 AM UTC+1 / 8–10 UTC) and evening (9 PM–11:30 PM UTC+1 / 20–22 UTC) windows.
> - The Ad Spy worker (`spy-worker.yml`) will run at **2:00 PM UTC+1 (13:00 UTC)**. This provides a **2.5-hour safety buffer** after the morning worker completes and a **7-hour buffer** before the evening worker begins, guaranteeing **zero schedule overlap**.

---

## Proposed Changes

### 1. Pre-Scan Result Count Update & Aligned Creative Extraction Flow

#### [MODIFY] [worker/spy-scanner.ts](file:///c:/Users/Anis/Desktop/Vibe%20coding/meta%20brand%20result/worker/spy-scanner.ts) & [worker/index.ts](file:///c:/Users/Anis/Desktop/Vibe%20coding/meta%20brand%20result/worker/index.ts)
- In `scanAdCreatives()`:
  1. Execute `scanMetaAdPage(page, targetUrl)` first to fetch live header count and update `trackedPages.currentResults` & `scanHistory`.
  2. Initiate Playwright response listener for GraphQL payloads while scrolling the container.
  3. Every 5 scroll iterations, invoke `extractAdsFromDOM(page, trackedPageId)` from [dom-scanner.ts](file:///c:/Users/Anis/Desktop/Vibe%20coding/meta%20brand%20result/worker/dom-scanner.ts) to capture rendered DOM cards.
  4. Perform final DOM sweep and merge results into `collectedAds` deduplicated by `adArchiveId`.

---

### 2. Dedicated Time-Separated Ad Spy Schedule & Difference +1 Result Filtering

#### [MODIFY] [worker/db.ts](file:///c:/Users/Anis/Desktop/Vibe%20coding/meta%20brand%20result/worker/db.ts)
- Add `enqueuePagesForCreativeScan()`:
  - Selects `trackedPages` and checks the latest `scanHistory` record.
  - Enqueues a `creative` job ONLY if:
    1. Page has never had a creative scan AND `currentResults >= 1`, **OR**
    2. The latest `scanHistory.difference` is **`>= 1`** (indicating new ads were detected).
  - Creates a `creativeScans` record (`status: "pending"`) and inserts a corresponding `queue` job (`jobType: "creative"`).

#### [NEW] [.github/workflows/spy-worker.yml](file:///c:/Users/Anis/Desktop/Vibe%20coding/meta%20brand%20result/.github/workflows/spy-worker.yml)
- Dedicated GitHub Actions workflow triggered at **13:00 UTC (2:00 PM UTC+1)**.
- Strictly isolated from the morning (8-10 UTC) and evening (20-22 UTC) count worker schedules to prevent job collisions and IP rate limit competition.
- Runs `npm run worker -- --enqueue-spy` to enqueue and extract new ad creatives.

---

### 3. Auto-Archiving Deactivated Ads

#### [MODIFY] [worker/spy-scanner.ts](file:///c:/Users/Anis/Desktop/Vibe%20coding/meta%20brand%20result/worker/spy-scanner.ts)
- Refine `reconcileArchivedAds` for `completed` creative scans:
  - When a full creative scan finishes for a page, query all previously active ads for that page.
  - Any ad that was NOT present in the latest full scan payload is updated in `ads`: `isArchived = true`, `archivedAt = now()`.
  - Insert an `adObservation` row with `isActive = false` to record the exact deactivation timestamp for historical auditing.

---

### 4. Sorting Types in API and Ad Spy Feed UI

#### [MODIFY] [app/api/spy/ads/route.ts](file:///c:/Users/Anis/Desktop/Vibe%20coding/meta%20brand%20result/app/api/spy/ads/route.ts)
- Accept `sort` query parameter:
  - `newest`: `started_running_on DESC NULLS LAST` (Default)
  - `oldest`: `started_running_on ASC NULLS LAST` (Longest running ads)
  - `scale`: `duplication_count DESC` (Highest ad duplication / winning creatives)
  - `recently_observed`: `observed_at DESC`
- Incorporate `sort` into the SQL `ORDER BY` clause.

#### [MODIFY] [hooks/use-spy.ts](file:///c:/Users/Anis/Desktop/Vibe%20coding/meta%20brand%20result/hooks/use-spy.ts) & [app/spy/page.tsx](file:///c:/Users/Anis/Desktop/Vibe%20coding/meta%20brand%20result/app/spy/page.tsx)
- Add a Sorting Dropdown select control to the Ad Spy toolbar (`Newest Ads`, `Oldest Ads (Longest Running)`, `Most Duplicated (Scale)`, `Recently Observed`).
- Pass the selected sort option to `fetchFeed`.

---

## Verification Plan

### Automated Verification
1. **Type Check & Build**:
   ```bash
   npx tsc --noEmit
   npm run build
   ```

2. **Creative Scan Enqueue Test**:
   ```bash
   npx tsx worker/index.ts --enqueue-spy
   ```
   Verify that pages with `difference <= 0` are excluded, and only pages with `difference >= 1` (or new pages) are enqueued.

### Manual Verification
1. **Ad Spy UI Sorting**: Open `/spy`, test changing the sort dropdown between "Newest", "Oldest", and "Most Duplicated", verifying the grid reorders dynamically.
2. **Auto-Archiving Verification**: Run a creative scan on a test brand, verify missing ads get marked `isArchived = true` with `archivedAt` timestamps.

---

## Post-Implementation Review — 2026-08-06

> [!NOTE]
> This section documents the review of this plan against the actual implemented code, identifying completed items, deviations, and remaining improvements.

---

### ✅ Implementation Status

| Plan Item | Status | File |
|:---|:---:|:---|
| Pre-scan live result count refresh in `scanAdCreatives()` | ✅ Done | [spy-scanner.ts](file:///c:/Users/Anis/Desktop/Vibe%20coding/meta%20brand%20result/worker/spy-scanner.ts) |
| `enqueuePagesForCreativeScan()` with `difference >= 1` filter | ✅ Done | [worker/db.ts](file:///c:/Users/Anis/Desktop/Vibe%20coding/meta%20brand%20result/worker/db.ts) |
| `--enqueue-spy` CLI flag + `ENQUEUE_SPY` env var | ✅ Done | [worker/index.ts](file:///c:/Users/Anis/Desktop/Vibe%20coding/meta%20brand%20result/worker/index.ts) |
| Dedicated `spy-worker.yml` at 13:00 UTC | ✅ Done | [.github/workflows/spy-worker.yml](file:///c:/Users/Anis/Desktop/Vibe%20coding/meta%20brand%20result/.github/workflows/spy-worker.yml) |
| Auto-archiving on completed scans | ✅ Done | [spy-scanner.ts](file:///c:/Users/Anis/Desktop/Vibe%20coding/meta%20brand%20result/worker/spy-scanner.ts) |
| Sorting API (`newest`, `oldest`, `scale`, `recently_observed`) | ✅ Done | [app/api/spy/ads/route.ts](file:///c:/Users/Anis/Desktop/Vibe%20coding/meta%20brand%20result/app/api/spy/ads/route.ts) |
| Sorting dropdown in UI | ✅ Done | [components/spy/spy-filters.tsx](file:///c:/Users/Anis/Desktop/Vibe%20coding/meta%20brand%20result/components/spy/spy-filters.tsx) |

---

### 🛠️ Post-Review Refactoring & Resolution — 2026-08-06

> [!TIP]
> Based on technical challenges and review feedback, the following refactoring improvements were executed:

1. **Shared `parseResultCountFromText()` Helper**:
   - Extracted pure text regex parser `parseResultCountFromText()` in [worker/scanner.ts](file:///c:/Users/Anis/Desktop/Vibe%20coding/meta%20brand%20result/worker/scanner.ts#L16-L89).
   - Reused inside `scanAdCreatives()` in [worker/spy-scanner.ts](file:///c:/Users/Anis/Desktop/Vibe%20coding/meta%20brand%20result/worker/spy-scanner.ts#L293-L330) on the single loaded `page` instance.
   - **Benefit**: Eliminates regex code duplication across scanners while preserving single-navigation Playwright performance (avoiding double `page.goto()` calls).

2. **Standalone `reconcileArchivedAds()` Function**:
   - Extracted archival reconciliation into an exported helper `reconcileArchivedAds()` at the bottom of [worker/spy-scanner.ts](file:///c:/Users/Anis/Desktop/Vibe%20coding/meta%20brand%20result/worker/spy-scanner.ts#L560-L596).
   - **Benefit**: Clean, testable isolation of ad archival logic.

3. **Production Build (`npm run build`) Verification**:
   - Triggered full Next.js production build (`npm run build`) to ensure zero bundling or page rendering issues.

---

### 📋 Updated Status Summary

| # | Item | Status | Solution |
|:---|:---|:---:|:---|
| 1 | Shared Result Count Parser | ✅ Resolved | Exported `parseResultCountFromText()` in `scanner.ts` |
| 2 | Standalone Archival Function | ✅ Resolved | Extracted `reconcileArchivedAds()` in `spy-scanner.ts` |
| 3 | Query Param Dual Naming | ✅ Intended | Retained backward-compatible `sortBy` + `sortOrder` |
| 4 | DOM Scanner `collationId` | ✅ Intended | DOM HTML nodes do not expose internal Meta UUIDs |
| 5 | Production Build Verification | ✅ Passed | Executed `npm run build` (0 errors, 20/20 routes built) |

