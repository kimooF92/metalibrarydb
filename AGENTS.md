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


