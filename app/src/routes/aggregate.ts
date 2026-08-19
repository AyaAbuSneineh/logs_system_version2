import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { parseCommonFilters } from "../lib/filters.js";
import { badRequest } from "../lib/errors.js";
import { queryAggregate } from "../services/aggregate.js";
import { BUCKET_INTERVALS, BucketSize, GroupByField } from "../types.js";

const VALID_BUCKETS = Object.keys(BUCKET_INTERVALS) as BucketSize[];
const VALID_GROUP_BY: GroupByField[] = ["service", "level"];

function parseBucket(value: unknown): BucketSize {
  if (typeof value !== "string" || !VALID_BUCKETS.includes(value as BucketSize)) {
    throw badRequest(
      `invalid bucket: ${JSON.stringify(value)} (must be one of ${VALID_BUCKETS.join(", ")})`,
    );
  }
  return value as BucketSize;
}

function parseGroupBy(value: unknown): GroupByField | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !VALID_GROUP_BY.includes(value as GroupByField)) {
    throw badRequest(
      `invalid group_by: ${JSON.stringify(value)} (must be one of ${VALID_GROUP_BY.join(", ")})`,
    );
  }
  return value as GroupByField;
}

export function registerAggregateRoute(app: FastifyInstance, pool: Pool): void {
  app.get("/logs/aggregate", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const filters = parseCommonFilters(query);

    if (filters.since === undefined) throw badRequest("'since' is required");
    if (filters.until === undefined) throw badRequest("'until' is required");

    const bucket = parseBucket(query.bucket);
    const groupBy = parseGroupBy(query.group_by);

    const buckets = await queryAggregate(pool, filters, bucket, groupBy);
    reply.code(200).send({ buckets });
  });
}
