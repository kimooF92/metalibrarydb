# Product Requirements Document (PRD)

# Meta Ad Library Tracker (Personal Edition)

**Version:** 1.2
**Status:** Ready for Development
**Target Developer:** Google Antigravity
**Project Type:** Internal Personal Tool

---

# 1. Product Vision

Build a lightweight web application that allows me to monitor Meta Ad Library search URLs and track the number of active ads over time.

The application should be extremely simple, reliable, and optimized for long-term use.

This is **NOT** an ad scraper.

The application only reads the visible **"~XXX results"** count shown by Meta Ad Library and stores historical changes.

The architecture should be designed so future features (creative extraction, AI analysis, etc.) can be added without redesigning the database.

---

# 2. Goals

The application should allow me to:

* Upload CSV/XLSX files containing Meta Ad Library URLs
* Manually add a single Meta Ad Library search URL directly, without needing a file import
* Automatically process imported URLs
* Read the visible result count
* Save the latest result
* Keep historical scans
* Show increases/decreases
* Retry failed scans
* Manually refresh pages
* Search and filter tracked pages

---

# 3. Non Goals (V1)

Do NOT build:

* User accounts
* Authentication
* Team collaboration
* AI analysis
* Ad downloading
* Creative extraction
* GraphQL reverse engineering
* Charts
* Notifications
* Scheduling

Keep V1 intentionally simple.

---

# 4. Tech Stack

## Frontend

* Next.js 15 (App Router)
* TypeScript
* TailwindCSS
* shadcn/ui
* TanStack Table
* React Hook Form
* Zod

---

## Backend

Next.js Route Handlers

---

## Database

Supabase PostgreSQL

---

## ORM

Drizzle ORM

---

## File Import

SheetJS (xlsx)

Supports:

* csv
* xlsx

---

## Storage

Supabase Storage

Imported files are stored for history/debugging.

---

## Deployment

Frontend

Vercel

Worker

Run manually, on-demand, on a local machine (not a hosted VPS).

* Docker container (or plain local Node/Playwright environment) started by hand
  when a scan session is wanted.
* No always-on hosting required. The worker connects to the same Supabase
  database as the Vercel-hosted frontend, so the dashboard reflects results as
  soon as a local run finishes.
* Because runs are manual and infrequent rather than continuous, this is
  inherently a "burstier, human-triggered" usage pattern — closer to normal
  browsing behavior than a permanently running scraper.

---

# 5. Architecture

```
              User

                │

        Upload CSV/XLSX

                │

          Next.js (Vercel)

                │

      Parse + Validate File

                │

        Insert Queue Jobs

                │

            Supabase

                │

  Playwright Worker (run manually,

    on-demand, on local machine)

                │

      Meta Ad Library

                │

Read Visible Result Count

                │

Update Database

                │

Dashboard Refresh
```

---

# 6. Playwright Strategy

The worker must behave as close as possible to a normal, occasional human user —
not a monitoring tool. This means limiting both **how fast** it acts and **how much**
it does in a given day, not just adding delays between individual actions.

## Browser

One persistent Chromium instance.

Never launch a browser for every request.

## Browser Profile

Persistent profile.

Store:

* Cookies
* Cache
* Local Storage

## Concurrency

Only ONE active page at a time.

```
URL1 → URL2 → URL3
```

No parallel workers.

## Timing (per-action delays)

Randomized delays, configurable via environment variables:

| Step               | Range   |
|---------------------|---------|
| Before navigation   | 2–5 sec |
| After page load     | 1–3 sec |
| Before extracting   | 0.5–1.5 sec |
| Before next page    | 3–8 sec |

## Daily / Hourly Throttling

Per-action delays alone are not enough. Scanning hundreds of URLs back-to-back for
hours, even with delays between each one, is still a long, uninterrupted burst of
traffic from a single browser — the pattern most likely to get flagged.

* Add a configurable **scan cap** per rolling window, e.g. `MAX_SCANS_PER_HOUR` and
  `MAX_SCANS_PER_DAY`. Defaults: conservative (e.g. 20/hour, 150/day) — tunable later
  once real-world behavior is observed.
* When a cap is hit, the worker stops pulling new jobs from the queue and waits until
  the window resets. Remaining jobs stay `pending` and simply carry over.
* Process the queue in **batches with cool-down windows** between batches (e.g. scan
  10–20 URLs, then pause 15–30 minutes) rather than draining it continuously. This
  spreads a large backlog (e.g. 1,000 URLs) across several days instead of one sitting.
* A large import (see §15/§17) should **not** auto-start the worker at full speed —
  see "Manual Queue Confirmation" in §16.

## Automatic Backoff on Failures

* Track consecutive failures across the queue (not just per-URL retries).
* If failures exceed a threshold (e.g. 3–5 in a row, configurable via
  `MAX_CONSECUTIVE_FAILURES`), pause the entire worker for an extended cooldown
  (hours, not seconds) — configurable via `BACKOFF_COOLDOWN_MINUTES`.
* This is distinct from a single URL's retry — it's a global signal that something
  about the current session (CAPTCHA, rate-limiting, IP flagging) has changed.
* Dashboard should surface a clear "Worker paused — repeated failures detected" state,
  separate from individual failed rows.

## Manual Kill Switch

* Add a single dashboard control to immediately pause all worker activity.
* Useful the moment failures start spiking — stopping fast is cheaper than debugging
  after the fact.

## Access Check (New)

Since the worker runs manually and on-demand (see §4 Deployment), there should be a
lightweight, automated way to confirm Meta Ad Library is actually reachable and
returning real data from the current machine/network *before* kicking off a full
scan session — without requiring a manual browser check.

* A standalone script (`scripts/check-access.ts`) that reuses the same Playwright
  context, extraction pattern, and settings as the real worker (same user agent,
  locale, persistent profile).
* It navigates to one known Meta Ad Library URL and classifies the outcome:
  * **Result pattern found** → access is working normally.
  * **Page loaded, no pattern, CAPTCHA/challenge markers present** → flagged,
    do not proceed with a scan session.
  * **Navigation timeout/error** → likely a network-level block (geo, ISP, DNS).
  * **"Not available in your region" style message** → Meta's legal/regional ad
    gating, not a block — informational, not necessarily blocking.
* Run this before starting a batch of scans. If it reports anything other than
  "working normally," hold off on running the full worker.

## Navigation

Wait for:

* `networkidle`, AND
* the result-count text to be present (see extraction note below — match by pattern,
  not a fixed selector).

## Extraction

Read the visible results text, e.g.:

```
~440 results
```

Notes:

* Meta doesn't always use `~`. It may show an exact small number, or "No results
  found," and phrasing can vary slightly by locale. Extraction should match a
  **text pattern** (regex for a number followed by "result(s)"), not a fixed
  CSS selector — DOM structure changes far more often than the visible text.
* If no matching pattern is found, treat the scan as "unclear" (not the same as a
  hard failure) and store a note. Don't silently record `0` unless the page
  actually indicates zero results.
* Fix locale/region explicitly (e.g. `Accept-Language` header or a `country=`
  param on the URL) so the results text format doesn't silently drift because the
  browser's default locale changed.

Never scroll. Never interact with ads. Never click creatives. Never load additional
pages.

## Retry

On failure:

* Mark the job as `failed`, with a distinct **failure reason** stored (see §18).
* Dashboard displays a Retry button.
* If retries for a given URL fail repeatedly (e.g. 3+ times), stop auto-surfacing
  the retry button as a one-click action — flag it for manual review instead, so a
  stuck URL doesn't keep quietly hammering the same page.

---

# 7. CSV Import

Supported columns

Only ONE column required.

Example

| url                                     |
| --------------------------------------- |
| [https://facebook](https://facebook)... |

Ignore additional columns.

---

Duplicate URLs

Automatically remove duplicates before inserting.

---

Validation

Accept only:

facebook.com/ads/library

Reject invalid rows.

---

Import Flow

```
Upload

↓

Validate

↓

Remove duplicates

↓

Extract metadata

↓

Insert Queue

↓

Worker starts automatically (small imports) / awaits confirmation (large imports)
```

---

# 7a. Manual URL Add

In addition to bulk CSV/XLSX import, allow adding a single Meta Ad Library search
URL directly through the UI — no file needed.

* A simple input field (dashboard or dedicated "Add URL" area) accepting one
  Meta Ad Library search link at a time.
* Same validation as bulk import: must match `facebook.com/ads/library`, rejected
  otherwise.
* Same duplicate check: if the URL (or resulting page ID / query) already exists
  in `tracked_pages`, don't insert a duplicate — surface a message instead.
* Goes through the same metadata extraction (§8) and lands in the queue as
  `pending`, same as an imported row.
* Since this is a single row, it's exempt from the `AUTO_START_THRESHOLD`
  confirmation step in §16 — it can queue immediately.

---

# 8. Metadata Extraction

From URL automatically extract:

Example

```
https://facebook...
...view_all_page_id=553391504532355
```

Store

Page ID

---

If URL contains

```
q=dreemz.tn
```

Store

```
Display Name

dreemz.tn
```

---

Store

Search Type

Example

```
page

keyword_exact_phrase

keyword_unordered

etc.
```

---

Store full URL.

---

# 9. Database Design

## Table

tracked_pages

```
id

url

display_name

search_type

page_id

current_results

last_checked

last_success_at

status

created_at

updated_at
```

---

Table

scan_history

```
id

tracked_page_id

results

difference

checked_at

status

failure_reason
```

---

Table

import_jobs

```
id

filename

total_rows

successful

failed

created_at
```

---

Table

queue

```
id

tracked_page_id

status

attempts

failure_reason

created_at

started_at

finished_at
```

---

# 10. Dashboard

Show summary cards.

Total Pages

Pending

Running

Completed

Failed

Average Results

Highest Results

Last Import

---

# 11. Main Table

Columns

Display Name

Search Type

Current Results

Previous Results

Difference

Status

Last Checked

Actions

---

Difference examples

+54

-31

0

Use colors:

Green

Red

Gray

---

Actions

Refresh

History

Retry

Delete

---

# 12. History Modal

Clicking History shows

```
Previous scans

--------------------------------

July 20

440

+20

July 17

420

+5

July 15

415

0

...
```

No charts.

Simple table.

---

# 13. Search

Global search.

Search by

Display Name

Page ID

URL

---

# 14. Filters

Status

Success

Pending

Running

Failed

---

Search Type

page

keyword

etc.

---

# 15. Import Page

Upload Area

Drag & Drop

Browse button

Accepted

CSV

XLSX

---

Show

Rows

Duplicates Removed

Imported

Failed

---

For imports above a configurable threshold (see `AUTO_START_THRESHOLD` in §19),
show an estimated completion time based on current rate limits before the worker
starts, and require manual confirmation to begin (see §16).

---

# 16. Worker Logic

```
Check global kill switch → if paused, stop

↓

Check hourly/daily scan cap → if reached, stop until window resets

↓

Check consecutive failure count → if over threshold, enter backoff cooldown

↓

Get next pending job (respecting batch size / cool-down since last batch)

↓

Open page

↓

Wait (networkidle + result pattern present)

↓

Read result text (pattern match, not fixed selector)

↓

Extract number (or mark "unclear" if pattern not found)

↓

Update tracked_pages (current_results, last_checked, last_success_at)

↓

Insert scan_history (results, difference, checked_at, status)

↓

Mark queue job completed / failed (+ failure reason if applicable)

↓

Next job (respecting per-action + batch delays)
```

### Import → Queue Behavior

* On import, valid/deduplicated rows are inserted into the queue as `pending` —
  but the worker does **not** auto-start at full speed for large imports.
* For imports above a configurable threshold (e.g. `AUTO_START_THRESHOLD=50`
  rows), require a manual confirmation step in the UI before the worker begins
  processing, and show an estimate: *"1,000 URLs queued — at current rate limits
  this will take approximately 6 days to complete."*
* Small imports (below the threshold) can auto-start as before.

### Queue Retention

* Completed queue jobs should be periodically archived or pruned (e.g. after 30
  days) so the `queue` table doesn't grow unbounded. `scan_history` remains the
  permanent record — `queue` is just the working table.

---

# 17. Difference Calculation

Always compare

Current Scan

VS

Previous Scan

Example

Yesterday

440

Today

520

Difference

+80

---

# 18. Error Handling

Possible failures, stored as a distinct `failure_reason` field on
`scan_history` / `queue` (not just a generic "Failed" status):

* `timeout`
* `navigation_error`
* `element_missing` / `pattern_not_found`
* `captcha`
* `rate_limited`

Dashboard shows:

* Failed status
* Reason (from the list above)
* Retry button (see retry-limit note in §6)
* If the global backoff cooldown is active, show that state clearly instead of
  implying each row can just be retried immediately.

---

# 19. Environment Variables

```
SUPABASE_URL
SUPABASE_KEY
DATABASE_URL

PLAYWRIGHT_HEADLESS=true          # see deployment note below
PAGE_TIMEOUT
RESULT_PATTERN                    # regex for result-count text

WORKER_DELAY_MIN
WORKER_DELAY_MAX

MAX_SCANS_PER_HOUR
MAX_SCANS_PER_DAY
BATCH_SIZE
BATCH_COOLDOWN_MINUTES

MAX_CONSECUTIVE_FAILURES
BACKOFF_COOLDOWN_MINUTES

AUTO_START_THRESHOLD
```

### Deployment note: headless mode

On a headless VPS (Hetzner, Railway), there's no display server, so a headful
browser won't launch without extra setup. Two options:

1. **Default to `PLAYWRIGHT_HEADLESS=true`** with reasonable, realistic browser
   launch args (viewport size, user agent, locale) — simplest, no extra
   infrastructure.
2. If headful is specifically wanted (e.g. for more human-like rendering
   behavior), run the container with `xvfb-run` to provide a virtual display,
   and document this explicitly in the Docker setup.

Recommendation: start with (1) unless there's a specific reason headful is
needed — it removes a deployment dependency for a single-user tool.

---

# 20. Folder Structure

```
app/

components/

lib/

actions/

hooks/

types/

db/

worker/

playwright/

queue/

utils/

scripts/

public/
```

---

# 21. API Routes

POST

```
/api/import
```

Upload file.

---

POST

```
/api/pages
```

Manually add a single Meta Ad Library URL (see §7a).

---

POST

```
/api/refresh
```

Refresh selected pages.

---

POST

```
/api/retry
```

Retry failed jobs.

---

GET

```
/api/pages
```

List pages.

---

GET

```
/api/history/:id
```

History.

---

DELETE

```
/api/page/:id
```

Delete.

---

# 22. UI Theme

Modern SaaS

Minimal

Dark Mode First

Rounded Cards

Clean Tables

No unnecessary animations

Fast loading

---

# 23. Future-Proof Fields

Reserve columns for future use.

```
country

landing_page

ad_count

video_count

image_count

notes

tags

ai_summary

last_creative_scan

creative_hash
```

These remain unused in V1 but prevent disruptive schema changes later.

---

# 24. Security

Single-user application.

No authentication.

Protect API routes with an application secret or local deployment configuration if exposed publicly.

Validate all uploaded files.

Never execute uploaded content.

---

# 25. Performance Targets

Import 1,000 URLs without UI blocking.

Sequential processing with configurable delays, scan caps, and batch cool-downs
(see §6).

Dashboard queries should remain responsive through pagination and indexed database fields.

---

# 26. Acceptance Criteria

The application is considered complete when it can:

* Import CSV/XLSX files containing Meta Ad Library URLs.
* Manually add a single Meta Ad Library URL directly, without a file import.
* Validate URLs and remove duplicates (bulk and manual add).
* Automatically enqueue valid entries, requiring manual confirmation before starting large batches.
* Process jobs sequentially using a persistent Playwright browser, run manually and on-demand, respecting configurable rate caps and backoff cooldowns.
* Run an automated access-check before a scan session to confirm Meta Ad Library is reachable and not blocking the current machine/network.
* Read the visible `~XXX results` count via pattern matching.
* Save the latest result and maintain a history of previous scans, including failure reasons.
* Calculate and display the difference from the previous scan.
* Show processing status for each tracked item.
* Allow manual retry of failed jobs, with escalation to manual review after repeated failures.
* Allow manual refresh of one or more tracked pages.
* Allow immediate manual pause of all worker activity.
* Display a searchable, filterable dashboard.
* Deploy the frontend on Vercel; run the Playwright worker locally and manually, with no always-on hosting required.
* Be structured for future expansion without requiring a major database redesign.

---

# 27. Future Roadmap (Out of Scope for V1)

The architecture should make it straightforward to add:

* Scheduled monitoring
* Creative image and video collection
* Landing page extraction
* AI-powered competitor summaries
* Trend analysis
* CSV/Excel exports of scan history
* Watchlists and tagging
* Multi-workspace support
* REST API access
* Browser extension integration
* Batch refresh scheduling
* Advanced analytics and visualizations

This PRD intentionally favors a **simple, stable, and maintainable** first version while laying a solid foundation for evolving into a comprehensive Meta Ad Library intelligence platform.