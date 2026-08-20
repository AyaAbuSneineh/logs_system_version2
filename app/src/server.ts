import Fastify, { type FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { config } from "./config.js";
import { ApiError } from "./lib/errors.js";
import { registerHealthRoute } from "./routes/health.js";
import { registerIngestRoute } from "./routes/ingest.js";
import { registerQueryRoute } from "./routes/query.js";
import { registerAggregateRoute } from "./routes/aggregate.js";

export function buildServer(writePool: Pool, readPool: Pool): FastifyInstance {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "error",
    },
    disableRequestLogging: true,
    bodyLimit: config.ingest.bodyLimitBytes,
  });

  registerHealthRoute(app);
  registerIngestRoute(app, writePool);
  registerQueryRoute(app, readPool);
  registerAggregateRoute(app, readPool);

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      reply.code(error.statusCode).send({ error: error.message });
      return;
    }

    // Malformed JSON and other body-parsing failures raised by Fastify
    // itself before a route handler runs.
    if ("statusCode" in error && typeof error.statusCode === "number" && error.statusCode === 400) {
      reply.code(400).send({ error: "malformed request body" });
      return;
    }

    request.log.error(error);
    reply.code(500).send({ error: "internal server error" });
  });

  return app;
}
