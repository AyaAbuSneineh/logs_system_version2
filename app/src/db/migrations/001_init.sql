-- Core schema for the log ingestion/query service.
--
-- Design notes (see README for the full rationale):
--   * `logs` is RANGE-partitioned by week on `timestamp` (see
--     db/partitions.ts). This keeps each partition's indexes small (fast
--     writes, fast index-only ordered scans), turns retention into a
--     `DROP TABLE` on whole partitions instead of a row-by-row DELETE (so
--     expiry never holds a long-running lock or bloats the heap), AND
--     keeps the partition *count* low enough that query planning stays
--     cheap — Postgres evaluates every partition's range at plan time
--     regardless of pruning, so a 30-day window as ~5 weekly partitions
--     plans far faster than the same window as ~30 daily ones.
--   * `attributes` stores the arbitrary key/value payload as-is (typed
--     JSONB) so it round-trips exactly through GET /logs.
--   * `attributes_text` is a derived, write-once JSONB column where every
--     value is stringified. The API contract requires attr.<key> equality
--     to compare "as strings" regardless of the original JSON type
--     (number, boolean, string), so filtering happens against this
--     normalized copy via a GIN(jsonb_path_ops) containment index, which
--     supports exact key/value lookups efficiently even with unbounded,
--     unpredictable attribute keys.
--   * There is deliberately no index on `message` for the `q=` substring
--     filter. Measured under the container resource limits, a
--     GIN(gin_trgm_ops) trigram index roughly doubled Postgres's CPU cost
--     per insert (a ~50-char message yields dozens of trigram postings)
--     and was the dominant bottleneck keeping ingestion under the 15k/s
--     target. `q` falls back to an ILIKE scan, which is fine given it is
--     always combined with the other (indexed) filters and there is no
--     latency SLA on it, unlike the aggregate endpoint. See README.

CREATE TABLE IF NOT EXISTS logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  "timestamp" timestamptz NOT NULL,
  level text NOT NULL,
  service text NOT NULL,
  message text NOT NULL,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  attributes_text jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (id, "timestamp")
) PARTITION BY RANGE ("timestamp");

-- Catch-all partition for rows outside the pre-created weekly range (e.g.
-- historical backfills or clock skew). Kept tiny in practice because the
-- partition-maintenance job keeps real weekly partitions ahead of time.
CREATE TABLE IF NOT EXISTS logs_default PARTITION OF logs DEFAULT;

-- Primary access path: filter by time range, sorted newest-first, with a
-- deterministic tiebreaker for identical timestamps (used by keyset
-- pagination). Declared on the partitioned parent so every partition
-- (existing and future) inherits a matching local index automatically.
CREATE INDEX IF NOT EXISTS idx_logs_ts_id ON logs ("timestamp" DESC, id DESC);

-- Service/level are low-cardinality, high-selectivity filters that are
-- almost always combined with a time-ordered scan.
CREATE INDEX IF NOT EXISTS idx_logs_service_ts ON logs (service, "timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_logs_level_ts ON logs (level, "timestamp" DESC);

-- Attribute equality lookups (attr.<key>=value).
CREATE INDEX IF NOT EXISTS idx_logs_attrs_text ON logs USING gin (attributes_text jsonb_path_ops);
