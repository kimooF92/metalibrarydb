<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:egress-and-performance-rules -->
# MANDATORY PERFORMANCE, EGRESS & QUOTA PROTECTION RULES

You MUST check and strictly adhere to these rules before implementing any feature, bug fix, or refactor. The project operates under Supabase free-tier constraints (5 GB monthly egress, 500 MB database disk limit, pooler connection limits) and tight API rate limits.

### 1. Database Egress & Projection Rules
- **No Blind `SELECT *` / Full Row Fetches**: Always specify explicit columns when querying through Drizzle or SQL (`columns: { id: true, ... }` or `.select({ id: table.id, ... })`). Never fetch entire rows for existence checks, counts, or deduplication.
- **Isolate & Truncate Heavy Columns**: Text and JSON blobs (`raw_extract`, ad `caption`, `metadata`, `storyboard_urls`, `raw_html`) must never be fetched on list queries, feeds, loops, or batch routines. If only text prefixes are needed, truncate directly in PostgreSQL (e.g. `sql<string>\`LEFT(${ads.caption}, 120)\``).
- **No Gratuitous `.returning()`**: Never append `.returning()` on `INSERT`, `UPDATE`, or `DELETE` operations unless the caller actually consumes the returned data. If only the ID is needed, return strictly `{ id: table.id }`.
- **Lean Endpoints & Guarded Subqueries**: Any route accepting large limits or exports (`/api/pages`, CSV exports) MUST support a `lean=true` mode that completely skips non-essential subqueries (sparklines, window rankings, domain maps, queue checks).
- **Time-Bound Window Queries**: Always apply date bounds on historical partitions (e.g. `scan_history.checkedAt >= NOW() - INTERVAL '30 days'`) before applying window ranking functions (`row_number() over (partition by ...)`).

### 2. Connection Pooler & Driver Health
- **Preserve `fetch_types: false`**: Never re-enable `fetch_types` in `postgres.js` configuration in `db/index.ts`. It causes 360+ catalog rows to be transferred on every connection handshake.
- **Throttled Loops & Heartbeats**: Never update database state or heartbeats unconditionally inside infinite worker/poller loops. Throttle heartbeat updates to at least 30–60 second intervals (`Date.now() - lastHeartbeat >= 30_000`).

### 3. External API & Worker Call Limits
- **Batching & Debouncing**: Never make unbounded serial API calls in loops (Meta Ad Library, Apify, Firecrawl). Use concurrency limiters, exponential backoff, and circuit breakers.
- **Prune & Compress Storage**: Ephemeral scrape payloads (`raw_extract`) must be set to `NULL` for deleted/failed records immediately, and purged within 2 days for successful scrapes.
<!-- END:egress-and-performance-rules -->

