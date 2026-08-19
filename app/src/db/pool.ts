import { Pool, type PoolConfig } from "pg";
import { config } from "../config.js";

function makePool(opts: PoolConfig): Pool {
  const pool = new Pool({
    connectionString: config.database.url,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ...opts,
  });
  pool.on("error", (err) => {
    // A background/idle client error must not crash the process; the pool
    // discards the client and issues a new one on the next checkout.
    console.error("Unexpected pg pool error", err);
  });
  return pool;
}

// Ingestion batches and read queries are split into separate pools so a
// burst of writes can never starve query requests of a connection (and
// vice versa). Under sustained ingestion, a single shared pool meant every
// GET /logs or /logs/aggregate request queued behind whatever inserts had
// already claimed a connection, which is what caused multi-second p95s in
// local load testing even though the same aggregate query ran in ~20ms in
// isolation. Splitting removed that head-of-line blocking; see README.
export const writePool = makePool({
  max: config.database.writePoolMax,
  min: config.database.writePoolMin,
});

export const readPool = makePool({
  max: config.database.readPoolMax,
  min: config.database.readPoolMin,
});

export async function closePools(): Promise<void> {
  await Promise.all([writePool.end(), readPool.end()]);
}
