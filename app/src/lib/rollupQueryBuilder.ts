import { BUCKET_INTERVALS, BucketSize, GroupByField } from "../types.js";
import type { CommonFilters } from "./filters.js";
import type { AggregateQuery } from "./aggregateBuilder.js";

const GROUP_COLUMN: Record<GroupByField, string> = {
  service: "service",
  level: "level",
};

/**
 * `logs_rollup` has no attribute or message columns — it only stores
 * counts per (minute, service, level) — so it can serve an aggregate
 * query exactly if and only if that query doesn't filter on `attr.<key>`
 * or `q`. Those fall back to the raw-row query in aggregateBuilder.ts.
 */
export function isRollupEligible(filters: CommonFilters): boolean {
  return Object.keys(filters.attrs).length === 0 && filters.q === undefined;
}

/**
 * Builds the aggregate query against `logs_rollup` instead of `logs`.
 * Counting from pre-aggregated per-minute rows makes the cost
 * O(distinct minute/service/level combinations in range) instead of
 * O(matching raw log rows) — see README for why that distinction matters
 * once a query's range covers a large, growing share of the table.
 */
export function buildRollupAggregateQuery(
  filters: CommonFilters,
  bucket: BucketSize,
  groupBy: GroupByField | undefined,
): AggregateQuery {
  const params: unknown[] = [];
  const conditions: string[] = [];

  if (filters.service !== undefined) {
    params.push(filters.service);
    conditions.push(`service = $${params.length}`);
  }

  if (filters.level !== undefined) {
    params.push(filters.level);
    conditions.push(`level = $${params.length}`);
  }

  if (filters.since !== undefined) {
    params.push(filters.since);
    conditions.push(`bucket_start >= $${params.length}`);
  }

  if (filters.until !== undefined) {
    params.push(filters.until);
    conditions.push(`bucket_start < $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const groupExpr = groupBy ? GROUP_COLUMN[groupBy] : "NULL";
  const bucketInterval = BUCKET_INTERVALS[bucket];

  // GROUP BY/ORDER BY reference the output columns positionally (1, 2),
  // not by name. `logs_rollup` has a real `bucket_start` column, and
  // `GROUP BY bucket_start` resolves to that raw per-minute column
  // instead of the re-bucketed `date_bin(...)` alias that shadows it —
  // silently grouping by the wrong (finer) granularity while still
  // displaying the coarser one. Positional references are unambiguous.
  const sql = `
    SELECT
      date_bin('${bucketInterval}', bucket_start, TIMESTAMPTZ '2000-01-01Z') AS bucket_start,
      ${groupExpr} AS grp,
      SUM(count)::bigint AS count
    FROM logs_rollup
    ${where}
    GROUP BY 1, 2
    ORDER BY 1 ASC, 2 ASC NULLS FIRST
  `;

  return { sql, params };
}
