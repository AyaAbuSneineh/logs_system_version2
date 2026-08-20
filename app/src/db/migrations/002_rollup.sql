-- Pre-aggregated rollup table backing GET /logs/aggregate.
--
-- A well-indexed aggregate query over `logs` still costs O(matching raw
-- rows) — a perfect index makes each row cheap to touch, it can't make
-- touching hundreds of thousands of them free. That's fine for a query
-- bounded to a small window, but genuinely expensive once the window
-- covers a large, growing share of the table (e.g. a monitoring check
-- that polls "everything since I started", which only gets more
-- expensive the longer it runs).
--
-- `logs_rollup` holds per-(minute, service, level) partial counts,
-- inserted at ingest time in the same transaction as the raw rows (see
-- services/ingest.ts), so it's never observably out of sync with `logs`.
-- It's deliberately append-only rather than a single upserted running
-- counter per key: an earlier version used `INSERT ... ON CONFLICT DO
-- UPDATE`, which requires every writer touching the same key to take a
-- row lock and serialize — under concurrent ingestion with "recent"
-- timestamps (the realistic case, where most traffic lands in the same
-- one or two minute buckets across a handful of services), that meant
-- every request contended for the same handful of hot rows, both
-- collapsing throughput and, worse, occasionally deadlocking two
-- transactions that locked an overlapping pair of keys in opposite
-- orders. Plain inserts never block each other, so GET /logs/aggregate
-- instead SUMs however many partial rows share a key (see
-- rollupQueryBuilder.ts) — correct regardless of whether there's one row
-- or a thousand for a given (minute, service, level), and still
-- overwhelmingly smaller than reading `logs` directly. The trade-off is
-- that this table grows roughly with (ingested rows / batch chunk size)
-- rather than staying strictly bounded by distinct-key cardinality; see
-- README's Known limitations for the compaction this would want if
-- pushed far beyond this project's scale.

CREATE TABLE IF NOT EXISTS logs_rollup (
  bucket_start timestamptz NOT NULL,
  service text NOT NULL,
  level text NOT NULL,
  count bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_logs_rollup_bucket ON logs_rollup (bucket_start);
-- Leading with service/level serves the common "one service, wide time
-- range" filter without scanning every other service's rows in range.
CREATE INDEX IF NOT EXISTS idx_logs_rollup_service_bucket ON logs_rollup (service, bucket_start);
CREATE INDEX IF NOT EXISTS idx_logs_rollup_level_bucket ON logs_rollup (level, bucket_start);
