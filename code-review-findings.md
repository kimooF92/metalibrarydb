# Code Review Findings — Validation & Resolution Report

Review scope: all uncommitted changes for Sequential Discovery Request with Cold-Restart RAM Safeguard.

## Findings & Resolutions

### 1. High — Selected sequence mode can queue the wrong inputs
- **Status:** **Resolved / Fixed**
- **Locations:** [app/discovery/page.tsx](file:///c:/Users/Anis/Desktop/Vibe%20coding/meta%20brand%20result/app/discovery/page.tsx), [app/api/discovery/runs/route.ts](file:///c:/Users/Anis/Desktop/Vibe%20coding/meta%20brand%20result/app/api/discovery/runs/route.ts)
- **Validation:** Confirmed. Switching tabs in the sequence modal left inputs in both state buckets; the API defaulted to URLs if both were present, ignoring `sequenceType`.
- **Fix:** 
  1. In `app/discovery/page.tsx`, `handleLaunchSequenceScan` now explicitly passes `sequenceType: sequenceScanType` and only populates `urlsText` when `sequenceScanType === "urls"` or `keywordsText` when `sequenceScanType === "keywords"`.
  2. In `app/api/discovery/runs/route.ts`, `requestedType` respects `body.sequenceType` first before falling back to heuristics, eliminating cross-talk and stale input submissions.

---

### 2. High — Batch scans are not guaranteed FIFO or single-worker
- **Status:** **Resolved / Fixed**
- **Locations:** [app/api/discovery/runs/route.ts](file:///c:/Users/Anis/Desktop/Vibe%20coding/meta%20brand%20result/app/api/discovery/runs/route.ts), [worker/db.ts](file:///c:/Users/Anis/Desktop/Vibe%20coding/meta%20brand%20result/worker/db.ts)
- **Validation:** Confirmed. Multi-row `INSERT` without explicit timestamps assigns identical `defaultNow()` timestamps. In addition, standard `FOR UPDATE SKIP LOCKED` allows multiple workers to claim concurrent jobs from the queue.
- **Fix:**
  1. In `app/api/discovery/runs/route.ts`, each queued run receives an explicit monotonically increasing `createdAt: new Date(baseTimestamp + i * 1000)`.
  2. In `worker/db.ts`, `claimNextPendingDiscoveryRun()` enforces a single-active-run concurrency gate:
     `AND NOT EXISTS (SELECT 1 FROM discovery_runs WHERE status = 'running' AND (started_at IS NULL OR started_at >= NOW() - INTERVAL '45 minutes'))`
     ordered by `ORDER BY created_at ASC, id ASC`, ensuring strictly 1-by-1 FIFO execution across all workers/shards without RAM exhaustion.

---

### 3. High — Browser initialization failure leaves runs permanently `running`
- **Status:** **Resolved / Fixed**
- **Location:** [worker/index.ts](file:///c:/Users/Anis/Desktop/Vibe%20coding/meta%20brand%20result/worker/index.ts)
- **Validation:** Confirmed. If `getBrowserSession()` crashed during cold restart or launch, the exception skipped updating the database record that was already claimed in `status = 'running'`.
- **Fix:** In `worker/index.ts`, wrapped the scan dispatch in a top-level error handler that updates `discovery_runs` to `status = 'failed'`, setting `failure_reason = 'timeout'` and recording error details in `outcome_details` before re-throwing or continuing.

---

### 4. Medium — Malformed sequence payloads produce 500s or bad scans
- **Status:** **Resolved / Fixed**
- **Locations:** [app/api/discovery/runs/route.ts](file:///c:/Users/Anis/Desktop/Vibe%20coding/meta%20brand%20result/app/api/discovery/runs/route.ts), [lib/sequence-discovery.ts](file:///c:/Users/Anis/Desktop/Vibe%20coding/meta%20brand%20result/lib/sequence-discovery.ts)
- **Validation:** Confirmed. Non-string inputs, invalid country codes, reversed date ranges, and non-array items could crash the route or enqueue invalid scans.
- **Fix:** Created centralized sanitization helpers in `lib/sequence-discovery.ts`:
  - `sanitizeDateRange`: Validates ISO strings and auto-swaps reversed dates (`min > max`).
  - `sanitizeCountryCode`: Regex validates `/^[A-Z]{2,3}$/` and falls back safely to workspace default (`ALL`).
  - `sanitizeMediaType`: Restricts strictly to `"all" | "video" | "image"`.
  - `extractSequenceKeywords` & `extractSequenceUrls`: Cleans, strips quotes, filters non-strings, trims delimiters, and enforces max caps (15 items max).

---

### 5. Medium — Sequence metadata disappears after a scan completes
- **Status:** **Resolved / Fixed**
- **Locations:** [worker/discovery-scanner.ts](file:///c:/Users/Anis/Desktop/Vibe%20coding/meta%20brand%20result/worker/discovery-scanner.ts), [worker/db.ts](file:///c:/Users/Anis/Desktop/Vibe%20coding/meta%20brand%20result/worker/db.ts)
- **Validation:** Confirmed. `runDiscoveryScan` wrote newly generated completion text directly to `outcome_details`, wiping out the sequence batch badge (`Sequence X/Y · Batch [id]`).
- **Fix:** 
  1. `worker/db.ts` now projects and returns `outcomeDetails` on claimed runs.
  2. `worker/discovery-scanner.ts` receives `initialOutcomeDetails` and uses `formatPreservedOutcomeDetails` to extract and preserve any existing `Sequence X/Y · Batch [id]` prefix when writing final success/failure summary text.

---

### 6. Medium — Invalid cooldown configuration disables the safety delay
- **Status:** **Resolved / Fixed**
- **Locations:** [worker/index.ts](file:///c:/Users/Anis/Desktop/Vibe%20coding/meta%20brand%20result/worker/index.ts), [lib/sequence-discovery.ts](file:///c:/Users/Anis/Desktop/Vibe%20coding/meta%20brand%20result/lib/sequence-discovery.ts)
- **Validation:** Confirmed. Unvalidated `process.env.DISCOVERY_INTER_RUN_COOLDOWN_MS` could evaluate to `NaN` or negative numbers, triggering 0s cooldown or indefinite stalls.
- **Fix:** In `lib/sequence-discovery.ts`, implemented `sanitizeSequenceCooldown()` which parses and clamps values between 5,000 ms (minimum) and 120,000 ms (maximum), safely falling back to 20,000 ms default on `NaN` or missing values.

---

### 7. Low — Persisted sequence mode is never restored
- **Status:** **Resolved / Fixed**
- **Location:** [app/discovery/page.tsx](file:///c:/Users/Anis/Desktop/Vibe%20coding/meta%20brand%20result/app/discovery/page.tsx)
- **Validation:** Confirmed. While `discovery_active_tab` saved `"sequence"`, initial component mount state only recognized `"url"` and `"controls"`.
- **Fix:** In `app/discovery/page.tsx`, updated the `useEffect` initialization to accept `"sequence"` as a valid persisted mode and set `activeTab("sequence")` accordingly.

---

### 8. Medium — Core sequence paths have no automated coverage
- **Status:** **Resolved / Fixed**
- **Locations:** [lib/sequence-discovery.test.ts](file:///c:/Users/Anis/Desktop/Vibe%20coding/meta%20brand%20result/lib/sequence-discovery.test.ts), [package.json](file:///c:/Users/Anis/Desktop/Vibe%20coding/meta%20brand%20result/package.json)
- **Validation:** Confirmed. There were no unit tests for sequence parsing, validation, cooldown clamping, or outcome prefix preservation.
- **Fix:** Created a comprehensive test suite in `lib/sequence-discovery.test.ts` testing:
  - Cooldown parsing, `NaN` handling, and clamping bounds.
  - Date range auto-correction and swapping.
  - Country code and media type normalization.
  - Keyword and URL splitting, trimming, and quote stripping.
  - Monotonic timestamp progression for FIFO ordering.
  - Outcome details sequence badge preservation.
  Integrated into the test suite via `package.json`.

---

## Verification Summary

- **TypeScript check (`npx tsc --noEmit`):** PASSED (0 errors).
- **Unit test suite (`npm test`):** PASSED (98/98 tests passing, 8 new dedicated sequence tests).
- **Git diff check (`git diff --check`):** PASSED (clean diffs, no whitespace/conflict errors).
- **Supabase Quota Compliance:** Full compliance with `AGENTS.md` (no blind `SELECT *`, lean projections, single-worker DB mutex).
