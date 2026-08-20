import type { Pool } from "pg";
import type { CommonFilters } from "../lib/filters.js";
import { buildAggregateQuery } from "../lib/aggregateBuilder.js";
import { buildRollupAggregateQuery, isRollupEligible } from "../lib/rollupQueryBuilder.js";
import type { AggregateBucket, BucketSize, GroupByField } from "../types.js";

interface BucketRow {
  bucket_start: Date;
  grp: string | null;
  count: string;
}

export async function queryAggregate(
  pool: Pool,
  filters: CommonFilters,
  bucket: BucketSize,
  groupBy: GroupByField | undefined,
): Promise<AggregateBucket[]> {
  // `attr.<key>`/`q` filters can't be answered from the rollup (it only
  // stores per-minute/service/level counts), so those fall back to
  // counting raw rows directly. Everything else is served from the
  // rollup, whose cost doesn't grow with total ingested volume.
  const { sql, params } = isRollupEligible(filters)
    ? buildRollupAggregateQuery(filters, bucket, groupBy)
    : buildAggregateQuery(filters, bucket, groupBy);
  const { rows } = await pool.query<BucketRow>(sql, params);

  return rows.map((row) => ({
    start: row.bucket_start.toISOString(),
    group: row.grp,
    count: Number(row.count),
  }));
}
