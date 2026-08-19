import type { FastifyInstance } from "fastify";

/**
 * The server only starts listening after the DB connection is verified,
 * migrations are applied, and partitions for incoming writes exist (see
 * index.ts). So simply being reachable here already implies "ready".
 */
export function registerHealthRoute(app: FastifyInstance): void {
  app.get("/health", async (_request, reply) => {
    reply.code(200).send({ status: "ok" });
  });
}
