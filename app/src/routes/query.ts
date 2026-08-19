import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { parseCommonFilters, parseLimit } from "../lib/filters.js";
import { queryLogs } from "../services/query.js";

export function registerQueryRoute(app: FastifyInstance, pool: Pool): void {
  app.get("/logs", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const filters = parseCommonFilters(query);
    const limit = parseLimit(query, 100, 1000);
    const cursor = typeof query.cursor === "string" ? query.cursor : undefined;

    const page = await queryLogs(pool, filters, limit, cursor);
    reply.code(200).send(page);
  });
}
