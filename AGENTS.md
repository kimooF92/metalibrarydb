<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:egress-and-performance-rules -->
# MANDATORY PERFORMANCE, EGRESS & QUOTA PROTECTION RULES

You MUST check and strictly adhere to these rules before implementing any feature, bug fix, or refactor. The project operates under Supabase free-tier constraints (5 GB monthly egress, 500 MB database disk limit, 100 GB monthly Log Query scan quota, pooler connection limits) and tight API rate limits.

### 1. Database Egress & Projection Rules
- **No Blind `SELECT *` / Full Row Fetches**: Always specify explicit columns when querying through Drizzle or SQL (`columns: { id: true, ... }` or `.select({ id: table.id, ... })`). Never fetch entire rows for existence checks, counts, or deduplication.
- **Isolate & Truncate Heavy Columns**: Text and JSON blobs (`raw_extract`, ad `caption`, `metadata`, `storyboard_urls`, `raw_html`) must never be fetched on list queries, feeds, loops, or batch routines. If only text prefixes are needed, truncate directly in PostgreSQL (e.g. `sql<string>\`LEFT(${ads.caption}, 120)\``).
- **No Gratuitous `.returning()`**: Never append `.returning()` on `INSERT`, `UPDATE`, or `DELETE` operations unless the caller actually consumes the returned data. If only the ID is needed, return strictly `{ id: table.id }`.
- **Lean Endpoints & Guarded Subqueries**: Any route accepting large limits or exports (`/api/pages`, CSV exports) MUST support a `lean=true` mode that completely skips non-essential subqueries (sparklines, window rankings, domain maps, queue checks).
- **Time-Bound Window Queries**: Always apply date bounds on historical partitions (e.g. `scan_history.checkedAt >= NOW() - INTERVAL '30 days'`) before applying window ranking functions (`row_number() over (partition by ...)`).

### 2. Connection Pooler & Driver Health
- **Preserve `fetch_types: false`**: Never re-enable `fetch_types` in `postgres.js` configuration in `db/index.ts`. It causes 360+ catalog rows to be transferred on every connection handshake.
- **Connection Churn & Idle Timeout**: Keep `idle_timeout >= 120` seconds in `db/index.ts`. Never set short timeouts (e.g. 20s), which trigger thousands of `ClientHandler: Connection authenticated` and `Terminate` events in Supavisor daily, polluting logs.
- **Throttled Loops & Heartbeats**: Never update database state or heartbeats unconditionally inside infinite worker/poller loops. Throttle heartbeat updates to at least 30–60 second intervals (`Date.now() - lastHeartbeat >= 30_000`).

### 3. External API & Worker Call Limits
- **Batching & Debouncing**: Never make unbounded serial API calls in loops (Meta Ad Library, Apify, Firecrawl). Use concurrency limiters, exponential backoff, and circuit breakers.
- **Batch Loop History Checks**: In worker schedulers, never execute `.findFirst()` queries sequentially in a `for` loop across pages. Always batch fetch using `DISTINCT ON` or `ANY(:ids::uuid[])`.
- **Prune & Compress Storage**: Ephemeral scrape payloads (`raw_extract`) must be set to `NULL` for deleted/failed records immediately, and purged within 2 days for successful scrapes.

### 4. Supabase Log Volume, Log Query & Quota Protection Rules
- **Strict Realtime Publication Scope**: Never add high-write or append-heavy tables (like `ads`) to the `supabase_realtime` publication. Every single insert/update triggers logical decoding in Postgres CDC WAL replication, producing 100,000+ internal polling queries. Only low-frequency entity tables (like `tracked_pages`) belong in Realtime.
- **Log Query Quota Protection (ClickHouse Scans)**: The free tier provides ONLY 100 GB of monthly Log Query data scanned. With ~43 GB consumed, the remaining 57 GB must be strictly preserved. Do NOT inspect or query logs unless explicitly requested. When reading Supabase logs (via Studio Logs Explorer, Management API, or MCP `query_logs`), **always** pass explicit narrow time windows (max 15–30 minutes: `iso_timestamp_start` and `iso_timestamp_end`). Defaulting to 24h or 7d scans gigabytes of log partitions on ClickHouse and burns the 100 GB monthly quota.
- **Index URL & Text Matching Fields**: Never use unindexed wildcard substring matches (`LIKE '%' || url || '%'`) across tables with thousands of rows (`ads`, `scraped_products`). Always use exact matching or functional expression indexes (`idx_ads_link_url_lower_trimmed`). Queries running >10s trigger `auto_explain` full plan dumps directly into `postgres_logs`, bloating log storage.
<!-- END:egress-and-performance-rules -->

<!-- BEGIN:context7-mcp-rules -->
# Context7 MCP Usage for Technical Best Practices & Documentation
- Whenever researching technical implementations, architectural patterns, library APIs, or technical best practices, use the `context7` MCP tools (`resolve-library-id` and `query-docs`) to query accurate, up-to-date documentation and best-practice patterns.
<!-- END:context7-mcp-rules -->

<!-- BEGIN:notion-workflow-sync-rules -->
# Notion Workflow & Progress Synchronization Rules

The workspace uses a Notion Coding Workflow OS connected via Notion MCP (Bot: `Agy-token`, Workspace: `Kareem Fezani's Notion`) to track projects, backlogs, technical specs, and daily progress:
- **Coding System Root Page**: `https://app.notion.com/p/Coding-system-4022b9f29f2680198c45dfaa4be26363`
- **Projects DB**: `4022b9f2-9f26-817d-960d-c4412a504877`
- **Parent Project (Meta Brand Result)**: `4022b9f2-9f26-81a8-b61c-c7f68abc3b8b`
- **Docs & Specs DB**: `4022b9f2-9f26-8194-9914-e25be2a87326`
- **Tasks & Backlog DB**: `4022b9f2-9f26-81a1-9fd1-ca9c352fb56a`
- **Dev Logs & Journal DB**: `4022b9f2-9f26-8197-a162-ec0527e1768d`

### Mandatory Tracking Guidelines
1. **Sync Work Items**: When starting work on a task, update its status in `Tasks & Backlog` to `In Progress`. When complete, mark it `Done`.
2. **Decompose New Features**: Whenever a new significant feature or refactor is planned, document the architecture in `Docs & Specs` and decompose it into actionable items in `Tasks & Backlog` linked to the active project.
3. **Log Significant Milestones & Discoveries**: Record daily progress, key debugging breakthroughs, or architectural decisions in `Dev Logs & Journal` so insights are preserved.
4. **Preserve Relations**: Always associate new tasks and documents with their parent Project (`Meta Brand Result` or corresponding codebase) and relevant specs.

### Notion MCP Tool Call Standards (Prevent First-Try Validation Errors)
- **Strict Parent Object Format**: In `API-post-page`, `parent` MUST ALWAYS be an object: `{ "database_id": "<UUID>" }` or `{ "page_id": "<UUID>" }`. NEVER pass a plain string UUID.
- **Property ID Standard for Core Databases**: Notion database properties containing spaces, ampersands, or symbols fail validation if passed as raw names. Always use the internal property IDs in `properties`:
  - **Dev Logs & Journal DB** (`4022b9f2-9f26-8197-a162-ec0527e1768d`):
    - `title`: `{"title": [{"text": {"content": "<Title>"}}]}`
    - `_trt`: `{"rich_text": [{"text": {"content": "<Insights/Notes>"}}]}` (Key Insights & Notes)
    - `k<Ri`: `{"date": {"start": "YYYY-MM-DD"}}` (Date)
    - `|hks`: `{"relation": [{"id": "4022b9f2-9f26-81a8-b61c-c7f68abc3b8b"}]}` (Project)
    - `OXjv`: `{"relation": [{"id": "<TASK_ID>"}]}` (Tasks Worked)
  - **Tasks & Backlog DB** (`4022b9f2-9f26-81a1-9fd1-ca9c352fb56a`):
    - `title`: Task Name
    - `pbuV`: Status (`{"status": {"name": "In Progress" | "Done" | "Backlog" | "Ready (Sprint)" | "Review / Testing"}}`)
    - `:<M{`: Priority (`{"select": {"name": "P0 - Blocker" | "P1 - High" | "P2 - Medium" | "P3 - Low"}}`)
    - `}VwN`: Type (`{"select": {"name": "Feature" | "Bug Fix" | "Refactor" | "Spike / Research" | "Chore / Infra"}}`)
    - `lcU[`: Project relation (`4022b9f2-9f26-81a8-b61c-c7f68abc3b8b`)
    - `|~WT`: Specification relation
    - `DN\L`: Branch / PR URL
    - `RFsv`: Sprint / Target Date
  - **Docs & Specs DB** (`4022b9f2-9f26-8194-9914-e25be2a87326`):
    - `title`: Doc Title
    - `OnHP`: Doc Type (`{"select": {"name": "PRD / Spec" | "Architecture / ADR" | "API Schema" | "Dev Setup Guide" | "Snippet / Playbook"}}`)
    - `^;Mi`: Status (`{"status": {"name": "Draft" | "Under Review" | "Approved / Active" | "Deprecated"}}`)
    - `PZMB`: Project relation (`4022b9f2-9f26-81a8-b61c-c7f68abc3b8b`)
- **Pre-flight Schema Inspection**: Before modifying any newly created or unfamiliar database, call `API-retrieve-a-database` to verify property IDs and option names before calling `API-post-page` or `API-patch-page`.
<!-- END:notion-workflow-sync-rules -->

<!-- BEGIN:database-migration-backup-rules -->
# MANDATORY PRE-MIGRATION BACKUP RULE
- **High-Priority Backup Rule**: Before executing any risky, destructive, or structural database migration (e.g., dropping columns/tables, modifying column types, renaming fields, data backfills, or table rewrites), **ALWAYS create a full database backup via `pg_dump`** before proceeding. Because the project operates on Supabase Free Tier (which does not provide automatic daily backups or Point-In-Time Recovery), pre-migration `pg_dump` snapshots are strictly mandatory to guarantee full recoverability against data loss.
<!-- END:database-migration-backup-rules -->

<!-- BEGIN:refactoring-safety-invariants -->
# MANDATORY REFACTORING & CODE-SPLITTING SAFETY INVARIANTS

You MUST strictly adhere to these rules during ANY file refactoring, code extraction, or modernization task across the project:

### 1. The Strangler Fig Extraction Protocol (Zero-Regression)
- **Import Back Before Deleting**: When extracting any logic (utilities, hooks, sub-components) from an existing file, write the new module first, import it back into the original file, and confirm it runs identically. NEVER delete original inline code before verifying the imported version.
- **Backward-Compatible Barrel Re-exports**: When moving or splitting an existing component or utility, always preserve a re-export bridge in the original file path (e.g., `export * from '@/features/brands/components/pages-table'`). No existing consumer should break due to path relocation.
- **Bottom-Up Dependency Flow**: Always extract leaves first before touching orchestrators:
  1. Pure utilities (`lib/`) with zero UI or side-effect risk
  2. Domain Hooks
  3. Leaf UI atom components (no children)
  4. Container/Table components
  5. Page orchestrators (`page.tsx`)

### 2. Mandatory Compiler & Quality Gates
- **Zero-Error Compiler Gate**: Run `npx tsc --noEmit` after EVERY file extraction or modification. A refactoring step is NOT considered complete if there is even a single TypeScript diagnostic error.
- **Single Responsibility & Size Limits**:
  - `page.tsx`: Orchestrator target `< 130 lines`. Strictly ZERO direct `fetch()` calls, zero `useEffect()`, zero inline modals.
  - Domain Hooks: Maximum 1 primary state machine per hook. Zero JSX.
  - UI Components: Maximum 8 direct props. If more are needed, group into a typed domain config object or use local React Context.
  - Pure Utils: 100% deterministic functions with zero React or DOM dependencies.

### 3. Edge-Case Preservation Checklist
During extractions, all domain edge-case handlers MUST be preserved verbatim:
- Browser Back/Forward navigation `popstate` listeners
- WebSocket real-time update debouncing (minimum 3,000ms delay before stats recalculation)
- Safe fallback & whitelist validations on URL query parameters and local storage keys
- Visibility-aware background polling (`document.hidden` checks)
- In-place row patching for table states to preserve active sorting, pagination, and scroll positions
<!-- END:refactoring-safety-invariants -->



<!-- BEGIN TESTSPRITE AGENT SECTION (testsprite agent install codex) -->
<!-- testsprite-skill: testsprite-verify+testsprite-onboard+testsprite-ci v0.16.0 sha256:06c93c50afc8 -->
# TestSprite Verification Loop

Run relevant tests and inspect failures before reporting. Skip docs/build-config
edits; missing credentials mean unverified. Honor the user's CLI/MCP choice.

## 1. Preflight and project

```bash
testsprite --version
testsprite auth status
```

If missing, advise CLI install or `testsprite setup`. Find the project via
`$TESTSPRITE_PROJECT_ID`, `.testsprite/config.json`, then `testsprite project list
--output json`; ask if several match.

For a local app without a project:

```bash
testsprite project create --type frontend --name "<repo name>" --local <port> --local-host <host>
testsprite test create --plan-from plan.json --project <projectId>
testsprite test run <id> <id> --local <port> --local-host <host> --output json
```

Local projects need V3 (V2-only: exit 7, `local-origin-requires-v3`). Exploration
and `test plan generate` exit 6 before charge. Create plans with `test create
--plan-from` without `--run`; then run several ids with `--local`. Portal runs
are blocked free until `project update <id> --url https://…` sets a public URL.
For deployed projects use `project create --url`; empty suites can use `test plan
generate --project <id>` then `test plan accept`.

## 2. Run against the change

The CLI does not host apps. Create a deployed environment once; select it with
`--env <name>` or omit for Default. Unknown names list valid names. Use `--local
<port>` for local FE runs.

```bash
# Deployed frontend: create + run, or run an existing test
testsprite project env create <id> --name staging --url https://staging.example.com
testsprite test create --plan-from plan.json --run --wait \
  --env staging --timeout 600 --output json
testsprite test run <test-id> --env staging \
  --wait --timeout 600 --output json
# Backend Python assertion
testsprite test create --type backend --name "Login rejects empty password" \
  --project <id> --code-file /tmp/test.py --run --wait --timeout 600
# Several tests, one batch (V3 FE: 0.5 credit each)
testsprite test run <test-id> <test-id> --env staging --wait --output json
# Dependency batch; --filter <substr>, --status failed,blocked
testsprite test run --all --project <id> --env staging --wait --output json
```

- Supported backends grant existing keys `run:tunnel`; a narrowed key without it
  exits 3. Free-plan local runs work. BE cannot use `--local`.
- `--local` implies `--wait` (1200 s per run; ordinary: 600). `--local-host`:
  `localhost`, `127.0.0.1` (default), `::1`. A dead port exits 5 before charge;
  `--skip-preflight` skips the probe. Environment `--url` rejects private (non-loopback) hosts.
  `--local` selects/creates `local-<port>`; a named `--env` must be local.
  `--target-url` cannot combine with `--local`.
- Run local ids together (`test run <id> <id> … --local <port>`); `--all --project
<id> --local <port>` skips BE tests. One tunnel, 5 concurrent runs by default
  (`--max-concurrency` 1–10). Five live bindings per user; `tunnel_binding_limit`
  exits 11 without retry. Use `tunnel list` then `tunnel stop <id>` or `--all --confirm`.
- Keep early **stderr** `Run <runId>` receipts and any `Dashboard: <url>`.
  Stdout is the JSON channel.
- An **owned** local timeout, Ctrl-C, or poll failure requests cancellation and
  closes the tunnel. Before a terminal V3 FE verdict, the backend attempts a refund;
  check `refund.status`: cancellation does not guarantee a refund.
  `--no-cancel-on-interrupt` detaches, but the owned tunnel still closes.
- After an owned timeout, start a **new** `test run <test-id> --local <port>
--timeout 1800` (retain `--local-host`). `test wait` cannot reopen the tunnel;
  ordinary/adopted waits can resume with `test wait <run-id>` if reachable.
- Keep `tunnel start` alive; borrow with `--local <port> --tunnel-client <uuid>`.
  Adopted runs normally detach without cancellation or closing the owner's tunnel.
  If the owner has disappeared during a run, cancellation is requested by default;
  `--no-cancel-on-interrupt` skips it. A second connection with the same credential
  takes over; the first exits **10**.
- Loopback environments need `--local <port>`. Bare CLI runs selecting one by
  name or Default exit 6 (`tunnel-required`) before dispatch or charge. The Portal
  shows no Run; backend requests are refused free. Schedules and test lists get
  free BLOCKED results. A public `--env` or Default works regardless of earlier
  tunnel runs. V3 local runs use the agent path, never saved-code replay, and
  preserve saved code.
- `--wait` handles polling/backoff; don't wrap it in a retry loop.
- Backend Python runs top-to-bottom, not via pytest: call `test_*` functions.
  The sandbox has stdlib, `requests`, `pytest`, `numpy`, `scipy`; use HTTP,
  not project imports or uninstalled packages.
- Backend `--produces`/`--needs` are repeatable; `--category teardown` marks cleanup.
  Set dependencies with `test create` or edit with `test update`; do not delete
  and recreate. Use `test run --all` for producer → consumer → teardown ordering
  and variable passing. A BE run includes that closure and its side effects;
  `--skip-dependencies` selects only the named test. Triage failed producers before
  blaming consumers starved of their token/fixture.

## 3. Inspect and report

```bash
testsprite test artifact get <run-id> --out ./.testsprite/runs/<run-id>/
testsprite test steps <test-id> --run-id <run-id> --output json
```

Read failing steps, screenshots and root cause. Bare `test steps <test-id>`
shows the latest run; pin the receipt's id. For empty latest steps, choose an
earlier run from `test result <test-id> --history`. Report verdict and dashboard.

Exits: 0 passed; 1 failed/blocked/cancelled; 3 auth/scope; 4 not found;
5 validation; 6 conflict/precondition; 7 timeout/unsupported; 10 unavailable;
11 rate limited; 12 insufficient credits.

## Dry-run and setup

`--dry-run` works without credentials:

```bash
testsprite test run <test-id> --dry-run --output json
testsprite test create --plan-from plan.json --dry-run --output json
```

Setup: `npm install -g @testsprite/testsprite-cli`; `testsprite setup`.

**First-time setup:** if this repo has no TestSprite tests yet, seed a *broad* first suite across its main user flows — not just one test — each with a concrete, observable assertion, before reporting setup as done. Try `testsprite test plan generate --project <id>` then `test plan accept` first; author plans by hand only if generation is unavailable.

**CI gate:** to run TestSprite on every pull request, use `testsprite ci init github --project <id> --env <name>`, finish the `REPLACE ME` step for how PRs deploy (platform-deployed previews → `on: deployment_status`; the workflow deploys → keep `pull_request`), set the `TESTSPRITE_API_KEY` secret, then prove it on one real, non-draft pull request. If the GitHub App already gates the project, ask before adding a second gate.
<!-- END TESTSPRITE AGENT SECTION -->
