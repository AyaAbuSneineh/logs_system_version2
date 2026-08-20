import { BUCKET_INTERVALS, BucketSize, GroupByField } from "../types.js";
import type { CommonFilters } from "./filters.js";
import { buildFilterConditions } from "./queryBuilder.js";

export interface AggregateQuery {
  sql: string;
  params: unknown[];
}

const GROUP_COLUMN: Record<GroupByField, string> = {
  service: "service",
  level: "level",
};

export function buildAggregateQuery(
  filters: CommonFilters,
  bucket: BucketSize,
  groupBy: GroupByField | undefined,
): AggregateQuery {
  const params: unknown[] = [];
  const conditions = buildFilterConditions(filters, params);
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const groupExpr = groupBy ? GROUP_COLUMN[groupBy] : "NULL";
  const bucketInterval = BUCKET_INTERVALS[bucket];

  const sql = `
    SELECT
      date_bin('${bucketInterval}', "timestamp", TIMESTAMPTZ '2000-01-01Z') AS bucket_start,
      ${groupExpr} AS grp,
      COUNT(*)::bigint AS count
    FROM logs
    ${where}
    GROUP BY bucket_start, grp
    ORDER BY bucket_start ASC, grp ASC NULLS FIRST
  `;

  return { sql, params };
}
