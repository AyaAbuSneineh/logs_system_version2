import type { Pool } from "pg";
import type { CommonFilters } from "../lib/filters.js";
import { buildAggregateQuery } from "../lib/aggregateBuilder.js";
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
  const { sql, params } = buildAggregateQuery(filters, bucket, groupBy);
  const { rows } = await pool.query<BucketRow>(sql, params);

  return rows.map((row) => ({
    start: row.bucket_start.toISOString(),
    group: row.grp,
    count: Number(row.count),
  }));
}
