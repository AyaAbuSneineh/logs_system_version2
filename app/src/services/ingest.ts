import type { Pool, PoolClient } from "pg";
import type { AttributeMap, LogEntry } from "../types.js";
import { groupIntoRollupRows } from "../lib/rollup.js";

// Splits very large batches into smaller statements on the same
// connection. A single `INSERT ... unnest(...)` for, say, 10,000 rows
// holds the Postgres backend in one long, uninterruptible burst of CPU
// work; under the 1-CPU container limit that starves concurrent read
// queries (and can trip cgroup CPU throttling) for the whole duration.
// Chunking gives the scheduler a natural yield point between statements
// without adding a round trip per row.
const INSERT_CHUNK_SIZE = 500;

function stringifyAttributeValues(attributes: AttributeMap): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(attributes)) {
    out[key] = String(value);
  }
  return out;
}

const INSERT_SQL = `
  INSERT INTO logs ("timestamp", level, service, message, attributes, attributes_text)
  SELECT * FROM unnest(
    $1::timestamptz[],
    $2::text[],
    $3::text[],
    $4::text[],
    $5::jsonb[],
    $6::jsonb[]
  )
`;

const ROLLUP_INSERT_SQL = `
  INSERT INTO logs_rollup (bucket_start, service, level, count)
  SELECT * FROM unnest($1::timestamptz[], $2::text[], $3::text[], $4::bigint[])
`;

/**
 * Inserts one chunk's raw rows and its rollup counts in the same
 * transaction, so the two are never observably out of sync — a reader
 * never sees a raw row whose rollup contribution hasn't landed yet, or
 * vice versa. The rollup insert is a plain append (see
 * db/migrations/002_rollup.sql for why it's not an upsert): concurrent
 * chunks never lock against each other here, only against Postgres's own
 * per-statement bookkeeping.
 */
async function insertChunk(client: PoolClient, chunk: LogEntry[]): Promise<void> {
  const timestamps: Date[] = [];
  const levels: string[] = [];
  const services: string[] = [];
  const messages: string[] = [];
  const attributes: string[] = [];
  const attributesText: string[] = [];

  for (const entry of chunk) {
    timestamps.push(entry.timestamp);
    levels.push(entry.level);
    services.push(entry.service);
    messages.push(entry.message);
    attributes.push(JSON.stringify(entry.attributes));
    attributesText.push(JSON.stringify(stringifyAttributeValues(entry.attributes)));
  }

  const rollupRows = groupIntoRollupRows(chunk);

  await client.query("BEGIN");
  try {
    await client.query(INSERT_SQL, [timestamps, levels, services, messages, attributes, attributesText]);
    await client.query(ROLLUP_INSERT_SQL, [
      rollupRows.map((r) => r.bucketStart),
      rollupRows.map((r) => r.service),
      rollupRows.map((r) => r.level),
      rollupRows.map((r) => r.count),
    ]);
    await client.query("COMMIT");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Connection is likely already broken; the pool discards it on release.
    }
    throw err;
  }
}

/**
 * Inserts an already-validated batch using `INSERT ... SELECT * FROM
 * unnest(...)` in chunks of at most `INSERT_CHUNK_SIZE` rows, on a single
 * checked-out connection. Batching (rather than one INSERT per row, or
 * per-row round trips) is what makes sustaining tens of thousands of
 * rows/sec realistic on a single 0.5 CPU app container talking to a 1 CPU
 * Postgres container: the driver serializes a handful of arrays instead
 * of thousands of individual parameter sets, and Postgres plans the
 * insert once per chunk.
 */
export async function insertLogBatch(pool: Pool, entries: LogEntry[]): Promise<void> {
  if (entries.length === 0) return;

  const client = await pool.connect();
  try {
    for (let offset = 0; offset < entries.length; offset += INSERT_CHUNK_SIZE) {
      await insertChunk(client, entries.slice(offset, offset + INSERT_CHUNK_SIZE));
    }
  } finally {
    client.release();
  }
}
