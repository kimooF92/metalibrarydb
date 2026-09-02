-- Read-only report. This does not update or delete any product data.
-- Run it before deciding whether a 30-day or 90-day retention policy is appropriate.
select
  count(*) filter (where raw_extract is not null) as products_with_raw_extract,
  count(*) filter (where raw_extract is null) as products_without_raw_extract,
  coalesce(sum(pg_column_size(raw_extract)) filter (where raw_extract is not null), 0) as raw_extract_bytes,
  coalesce(avg(pg_column_size(raw_extract)) filter (where raw_extract is not null), 0)::bigint as average_raw_extract_bytes,
  coalesce(max(pg_column_size(raw_extract)) filter (where raw_extract is not null), 0) as largest_raw_extract_bytes
from scraped_products;

-- Candidate rows for a retention policy. Review the count and byte total first.
select
  count(*) as candidates,
  coalesce(sum(pg_column_size(raw_extract)), 0) as candidate_bytes
from scraped_products
where raw_extract is not null
  and coalesce(last_scraped_at, updated_at, created_at) < now() - interval '90 days';
