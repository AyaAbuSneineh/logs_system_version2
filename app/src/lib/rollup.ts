import type { LogEntry } from "../types.js";

// Matches the grain `logs_rollup` stores at, and must stay in lockstep
// with the `date_bin('1 minute', ...)` used when reading it back — see
// rollupQueryBuilder.ts. 2000-01-01T00:00:00Z (the origin used there) is
// itself an exact multiple of one minute since the Unix epoch, so flooring
// against the epoch directly produces identical bucket boundaries to
// Postgres's date_bin with that origin.
export const ROLLUP_BUCKET_MS = 60_000;

export function floorToMinute(date: Date): Date {
  return new Date(Math.floor(date.getTime() / ROLLUP_BUCKET_MS) * ROLLUP_BUCKET_MS);
}

export interface RollupRow {
  bucketStart: Date;
  service: string;
  level: string;
  count: number;
}

/**
 * Collapses a batch of log entries into per-(minute, service, level)
 * counts at this chunk's own grain — the same one `logs_rollup` stores.
 * Merging within the chunk first means at most one inserted row per
 * distinct combination reaches Postgres per chunk, not one per log line;
 * see services/ingest.ts for why the table then stays append-only rather
 * than merging further via an upsert.
 */
export function groupIntoRollupRows(entries: readonly LogEntry[]): RollupRow[] {
  const rows = new Map<string, RollupRow>();

  for (const entry of entries) {
    const bucketStart = floorToMinute(entry.timestamp);
    const key = `${bucketStart.getTime()}|${entry.service}|${entry.level}`;
    const existing = rows.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      rows.set(key, { bucketStart, service: entry.service, level: entry.level, count: 1 });
    }
  }

  return [...rows.values()];
}
