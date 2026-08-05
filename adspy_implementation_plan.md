# Implementation Plan — Ad Spy Feed Performance & Worker Extraction Optimization

Remediate the Ad Spy feed scrolling delay/lag and solve incomplete ad extraction in the Playwright worker process.

---

## User Review Required

> [!IMPORTANT]
> **Thumbnail URL strategy**: The worker already calls `getPublicUrl()` in [thumbnail-cache.ts](file:///c:/Users/Anis/Desktop/Vibe%20coding/meta%20brand%20result/worker/thumbnail-cache.ts) and stores public URLs in `ads.thumbnailUrl`. But the API route in [route.ts](file:///c:/Users/Anis/Desktop/Vibe%20coding/meta%20brand%20result/app/api/spy/ads/route.ts) then re-signs every row with `createSignedUrl`, creating 24 sequential network roundtrips per page load. We will **remove the per-row signed URL calls entirely** and use the already-stored public URL / original CDN URL fallback. This assumes the `ad-thumbnails` bucket is configured as public (which `getPublicUrl` already relies on).

> [!IMPORTANT]
> **Infinite Scroll vs Pagination**: We propose replacing the full-page-swap pagination with a "load more" infinite scroll pattern using `IntersectionObserver`, while keeping the Previous/Next buttons as an alternative. The existing drawer component ([page-ad-library-drawer.tsx](file:///c:/Users/Anis/Desktop/Vibe%20coding/meta%20brand%20result/components/spy/page-ad-library-drawer.tsx)) also uses `useAdFeed` but with `limit: 100` — changes to the hook will preserve its current behavior.

---

## Proposed Changes

### 1. Backend API — Eliminate N+1 Signed URL Calls

#### [MODIFY] [route.ts](file:///c:/Users/Anis/Desktop/Vibe%20coding/meta%20brand%20result/app/api/spy/ads/route.ts)

**Problem**: Lines 167–207 loop through each row and call `supabaseClient.storage.from("ad-thumbnails").createSignedUrl()` individually. For a page of 24 ads, that's 24 sequential HTTP roundtrips to Supabase Storage before the API can respond. This is the primary cause of the visible delay when scrolling/paginating the feed.

**Fix**:
- Remove the `createClient` import and the per-row `createSignedUrl` loop entirely.
- Use the `thumbnailUrl` already stored on the `ads` row (which is populated by the worker's `cacheThumbnail` → `getPublicUrl` call).
- Fall back to the original Meta CDN `thumbnailUrl` when no cached version exists.
- Remove the duplicate `signedThumbnailUrl` field from the response shape — the `thumbnailUrl` field already serves this purpose.
- Also remove the `Promise.all(rows.map(async ...))` wrapper — it becomes a simple synchronous `.map()`.

**Also optimize the count query**: The current code runs a separate `SELECT count(distinct ads.id)` with the same 3-table join and `whereClause`. This is redundant — use `sql<number>\`(SELECT count(*) FROM ${subquery})\`` against the already-computed CTE, or use a window function to piggyback total count into the main query.

---

### 2. Database — Add Missing Composite Indexes

#### [MODIFY] [schema.ts](file:///c:/Users/Anis/Desktop/Vibe%20coding/meta%20brand%20result/db/schema.ts)

**Problem**: The `ad_observations` table has single-column indexes on `tracked_page_id` and `duplication_count`, but the API's CTE uses `DISTINCT ON (ads.id)` with `ORDER BY ads.id, ad_observations.observed_at DESC`. The `observed_at` column has no index at all, forcing sequential scans on large observation tables.

**Fix** — add two composite indexes to `adObservations`:
- `idx_ad_obs_ad_observed` on `(adId, observedAt DESC)` — directly supports the `DISTINCT ON` + `ORDER BY` in the CTE.
- `idx_ad_obs_page_observed` on `(trackedPageId, observedAt DESC)` — supports filtered queries scoped to a tracked page.

These indexes already have names not conflicting with existing `idx_ad_obs_*` entries. The existing single-column `idx_ad_obs_duplication` is fine as-is.

---

### 3. Frontend — Keep Previous Data Visible During Pagination

#### [MODIFY] [use-spy.ts](file:///c:/Users/Anis/Desktop/Vibe%20coding/meta%20brand%20result/hooks/use-spy.ts)

**Problem**: `fetchFeed` (line 65) sets `setIsLoading(true)` immediately, and in [page.tsx](file:///c:/Users/Anis/Desktop/Vibe%20coding/meta%20brand%20result/app/spy/page.tsx) line 118 the entire ad grid is unmounted when `isLoading` is true, replaced with a full-screen spinner. This causes jarring layout destruction and scroll position loss on every page change or filter update.

**Fix**:
- Add a separate `isFetchingMore` state (boolean, default false) distinct from the initial `isLoading`.
- On initial load (no ads yet), use `isLoading` as before → full skeleton screen.
- On subsequent fetches (pagination, filter change when ads already exist), set only `isFetchingMore = true` and keep existing `ads` in state. Replace `ads` only when the new response arrives.
- Export `isFetchingMore` alongside `isLoading` from the hook.
- The drawer component won't be affected since it doesn't paginate (uses `limit: 100`).

#### [MODIFY] [page.tsx](file:///c:/Users/Anis/Desktop/Vibe%20coding/meta%20brand%20result/app/spy/page.tsx)

**Fix**:
- Use `isLoading` only for the initial empty-state spinner (when `ads.length === 0 && isLoading`).
- Use `isFetchingMore` for an inline progress indicator (small bar or overlay) that doesn't unmount the existing ad grid.
- Add an `IntersectionObserver` sentinel `<div>` at the bottom of the ad grid. When it enters the viewport, call `updateFilters({ page: pagination.page + 1 })` to append the next page of results.
- Guard auto-fetch: only trigger when `!isFetchingMore && pagination.page < pagination.totalPages`.

---

### 4. Worker — Container-Aware Scrolling

#### [MODIFY] [spy-scanner.ts](file:///c:/Users/Anis/Desktop/Vibe%20coding/meta%20brand%20result/worker/spy-scanner.ts)

**Problem (lines 279–282)**: The scroll loop uses `window.scrollBy(0, 1600)` and `window.scrollTo(0, document.body.scrollHeight)`. Meta Ad Library renders ad cards inside an internal scroll container (typically `div[role="feed"]` or an overflow container). Scrolling `window` doesn't dispatch scroll events on that internal container, so Meta's infinite-loading pagination GraphQL calls are never triggered for pages with many ads.

**Fix**: Replace the `page.evaluate` scroll block with a container-aware strategy:
1. First, try to find Meta's internal scroll container via `document.querySelector('div[role="feed"]')` or the first `div` with `overflow-y: auto/scroll` that is a parent of ad card elements.
2. If found, scroll that container (`container.scrollTop = container.scrollHeight`).
3. Always also scroll `window` as a fallback for layouts without a nested scroll container.
4. Log which scroll target was used for debugging.

---

### 5. Worker — Balanced Adaptive Scroll Strategy for High-Volume Brands (400–500+ ads)

#### [MODIFY] [spy-scanner.ts](file:///c:/Users/Anis/Desktop/Vibe%20coding/meta%20brand%20result/worker/spy-scanner.ts)

**Problem (lines 34–36)**: Current values are too aggressive for large brands:
- `SCROLL_WAIT_MS = 1800` — Meta GraphQL responses often take 2–4s. The wait expires before the response arrives, registering a false "no progress" increment.
- `NO_PROGRESS_CAP = 5` — With 1.8s waits, 5 consecutive no-progress checks = only 9 seconds of patience. A single slow GraphQL response triggers premature termination.
- `MAX_SCROLL_ATTEMPTS = 30` — Meta returns ~20–30 ads per GraphQL batch. 30 scrolls captures at most ~150 ads — far short of the 400–500 needed for large brands.

**Capacity analysis** — Meta sends ~25 ads per GraphQL batch. Each scroll attempt triggers 0–1 batch depending on scroll position. Conservative estimate: ~60% of scrolls trigger a new batch.

| Ads on page | Batches needed | Scroll attempts needed (~60% hit rate) | Time at 3s/scroll |
|---|---|---|---|
| 100 | 4 | ~7 | ~21s |
| 200 | 8 | ~14 | ~42s |
| 300 | 12 | ~20 | ~60s |
| 400 | 16 | ~27 | ~81s |
| 500 | 20 | ~34 | ~102s |

**Fix — Two-part approach**:

**A. Balanced defaults, env-configurable:**
```ts
const MAX_SCROLL_ATTEMPTS = parseInt(process.env.SPY_MAX_SCROLL_ATTEMPTS || "50", 10);
const NO_PROGRESS_CAP = parseInt(process.env.SPY_NO_PROGRESS_CAP || "6", 10);
const SCROLL_WAIT_MS = parseInt(process.env.SPY_SCROLL_WAIT_MS || "3000", 10);
```

50 attempts × 3s = **150s max wall-clock** time. At ~60% scroll hit rate, that's ~30 effective batches × 25 ads = **~750 ads capacity** — comfortably covers 500-ad brands without sessions that linger like a bot.

| | Current | **Balanced (recommended)** |
|---|---|---|
| `SPY_MAX_SCROLL_ATTEMPTS` | 30 | **50** |
| `SPY_NO_PROGRESS_CAP` | 5 | **6** |
| `SPY_SCROLL_WAIT_MS` | 1800 | **3000** |
| Capacity | ~150 ads | **~750 ads** |
| No-progress patience | 9s | **18s** |

The 3s base wait is more human-paced — real users don't scroll every 1.8s nonstop. The 6 no-progress cap = 18s of patience before stopping, which is about how long a person would wait before assuming a page has finished loading.

**B. Adaptive response-aware waiting** — replace the blind `waitForTimeout(SCROLL_WAIT_MS)` with a smarter wait that proceeds as soon as the GraphQL response actually arrives:

```ts
// Track whether a new GraphQL response arrived since last scroll
let graphqlResponseReceived = false;

// Inside handleResponse, after extractAdsFromJSON:
graphqlResponseReceived = true;

// Inside scroll loop, replace:
//   await page.waitForTimeout(SCROLL_WAIT_MS);
// With:
graphqlResponseReceived = false;
const waitStart = Date.now();
while (!graphqlResponseReceived && (Date.now() - waitStart) < SCROLL_WAIT_MS) {
  await page.waitForTimeout(300); // poll every 300ms
}
```

With adaptive waiting, actual time per scroll is typically ~1–2s (when Meta responds quickly) instead of the full 3s ceiling. A 500-ad scan completes in **~60–90s real time**, but the 3s max between scrolls keeps the browsing pattern looking natural to Meta. If Meta is slow or stops responding, the no-progress cap kicks in after 18s and terminates gracefully.

---

### 6. Worker — Interleaved DOM Extraction During Scroll Loop

#### [MODIFY] [spy-scanner.ts](file:///c:/Users/Anis/Desktop/Vibe%20coding/meta%20brand%20result/worker/spy-scanner.ts)

**Problem (lines 304–326)**: `extractAdsFromDOM` runs only once, after the scroll loop finishes. Meta Ad Library uses DOM virtualization — as the user scrolls down, cards at the top are removed from the DOM. By the time all scrolling is done, only the bottom-most cards remain in the DOM. The post-scroll DOM scan only captures those.

**Fix**:
- Call `extractAdsFromDOM` inside the scroll loop, every 5th iteration (e.g., `if (i % 5 === 4)`), merging results into `collectedAds` as the loop progresses.
- Keep the existing post-loop DOM scan as a final sweep.
- This ensures cards that are about to be virtualized out are captured before they disappear.

---

### 7. Worker — Resilient GraphQL Response Parsing

#### [MODIFY] [spy-scanner.ts](file:///c:/Users/Anis/Desktop/Vibe%20coding/meta%20brand%20result/worker/spy-scanner.ts)

**Problem (lines 209–210)**: The `handleResponse` handler does:
```ts
const text = await response.text();
const json = JSON.parse(text);
```
Meta sometimes prefixes GraphQL responses with `for (;;);` as an anti-XSSI measure, and may also return newline-delimited multi-JSON (NDJSON) responses. Both cause `JSON.parse` to throw, and the `catch {}` silently drops the entire payload — potentially losing a batch of 25 ads per dropped response.

**Fix**:
1. Strip leading `for (;;);` prefix before parsing.
2. If `JSON.parse` fails on the full text, attempt to split by newlines and parse each line individually, feeding valid JSON objects into `extractAdsFromJSON`.

---

### 8. Worker — Fix Snapshot Subtree Skipping

#### [MODIFY] [spy-scanner.ts](file:///c:/Users/Anis/Desktop/Vibe%20coding/meta%20brand%20result/worker/spy-scanner.ts)

**Problem (line 176)**: `extractAdsFromJSON` has `if (key !== "snapshot" && typeof obj[key] === "object")` — it skips recursing into `"snapshot"` keys. This was intended to avoid re-parsing the snapshot after it's been consumed by `parseAdGraphQLNode`. However, Meta sometimes nests ad collections inside a `snapshot` wrapper (e.g., `snapshot.cards` contains ad-like objects with their own `adArchiveID`). The current code silently misses these nested ads.

**Fix**: Remove the `key !== "snapshot"` guard. The `parseAdGraphQLNode` function already deduplicates by `adArchiveId` via the `collectedMap`, so re-encountering the same ad during recursion is harmless — the map prevents duplicates.

---

### 9. Worker — Fix Unsafe Archive Reconciliation

#### [MODIFY] [spy-scanner.ts](file:///c:/Users/Anis/Desktop/Vibe%20coding/meta%20brand%20result/worker/spy-scanner.ts)

**Problem (lines 402–432)**: After saving ads, the code queries ALL previous observations for the tracked page, then marks any ad not found in the current scan as `isArchived = true`. This directly contradicts the project's own design rule from [scraping_implementation_plan.md](file:///c:/Users/Anis/Desktop/Vibe%20coding/meta%20brand%20result/scraping_implementation_plan.md):

> *"A missing ad only means inactive when Meta explicitly reports it as inactive—not because it was absent from a capped, failed, or partial scan."*

If the current scan only captured 50 of 100 ads (due to scroll limits, timeouts, or rate limiting), the other 50 get incorrectly archived. This is a data corruption bug.

**Fix**: Only run archive reconciliation when `finalStatus === "completed"` AND the scan extracted at least as many ads as the previous completed scan for that page. For `partial` scans, skip reconciliation entirely — a partial scan cannot prove an ad no longer exists.

---

## Verification Plan

### Automated Verification
1. **Build & Type Check**:
   ```bash
   npm run build
   ```
2. **Worker Test Scan** — Run against a page with 50+ ads and verify the extracted count matches the visible count on Meta:
   ```bash
   npx ts-node worker/index.ts --test-spy-url "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&view_all_page_id=553391504532355"
   ```

### Manual Verification
1. **Feed latency**: Open browser DevTools Network tab, navigate to `/spy`, verify `GET /api/spy/ads` response time is under 500ms (was 2–4s with signed URL N+1).
2. **Scroll UX**: On the `/spy` feed, click "Next" or scroll down — verify existing cards remain visible with an inline loading indicator (no full-page spinner flash).
3. **Worker extraction**: After a scan, compare `extractedCount` in the `creative_scans` table to the actual number of visible ads on the Meta Ad Library page for the same brand.
4. **No false archival**: After a partial scan, verify that previously captured ads that weren't re-seen are NOT marked `isArchived = true`.
