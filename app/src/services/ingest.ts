import type { Pool } from "pg";
import type { AttributeMap, LogEntry } from "../types.js";

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

async function insertChunk(
  client: Pick<Pool, "query">,
  chunk: LogEntry[],
): Promise<void> {
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

  await client.query(INSERT_SQL, [timestamps, levels, services, messages, attributes, attributesText]);
}

/**
 * Inserts an already-validated batch using `INSERT ... SELECT * FROM
 * unnest(...)` in chunks of at most `INSERT_CHUNK_SIZE` rows. Batching
 * (rather than one INSERT per row, or per-row round trips) is what makes
 * sustaining tens of thousands of rows/sec realistic on a single 0.5 CPU
 * app container talking to a 1 CPU Postgres container: the driver
 * serializes a handful of arrays instead of thousands of individual
 * parameter sets, and Postgres plans the insert once per chunk.
 */
export async function insertLogBatch(pool: Pool, entries: LogEntry[]): Promise<void> {
  if (entries.length === 0) return;

  if (entries.length <= INSERT_CHUNK_SIZE) {
    await insertChunk(pool, entries);
    return;
  }

  const client = await pool.connect();
  try {
    for (let offset = 0; offset < entries.length; offset += INSERT_CHUNK_SIZE) {
      await insertChunk(client, entries.slice(offset, offset + INSERT_CHUNK_SIZE));
    }
  } finally {
    client.release();
  }
}
