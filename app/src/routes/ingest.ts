import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { validateBatch } from "../validation/logEntry.js";
import { insertLogBatch } from "../services/ingest.js";
import type { IngestResult } from "../types.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function registerIngestRoute(app: FastifyInstance, pool: Pool): void {
  app.post("/logs", async (request, reply) => {
    const body = request.body;

    if (!isPlainObject(body) || !Array.isArray(body.logs)) {
      reply.code(400).send({ error: "request body must be an object with a 'logs' array" });
      return;
    }

    const { accepted, rejected } = validateBatch(body.logs);

    if (accepted.length === 0) {
      const result: IngestResult = { accepted: 0, rejected };
      reply.code(400).send(result);
      return;
    }

    await insertLogBatch(pool, accepted);

    const result: IngestResult = { accepted: accepted.length, rejected };
    reply.code(200).send(result);
  });
}
