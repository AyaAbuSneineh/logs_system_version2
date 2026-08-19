import type { Pool } from "pg";
import { dropPartition, listDailyPartitions } from "./partitions.js";

/**
 * Drops any daily partition whose entire range is older than
 * `retentionDays`. Because this drops whole partitions instead of
 * deleting matching rows, it runs in roughly constant time regardless of
 * how much data is expiring, and never competes with ingestion for a
 * table-wide lock or leaves dead tuples behind for autovacuum to clean up.
 */
export async function runRetentionSweep(pool: Pool, retentionDays: number): Promise<string[]> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const partitions = await listDailyPartitions(pool);
  const dropped: string[] = [];

  for (const partition of partitions) {
    if (partition.upperBound.getTime() <= cutoff.getTime()) {
      await dropPartition(pool, partition.name);
      dropped.push(partition.name);
    }
  }

  return dropped;
}

export function startRetentionLoop(
  pool: Pool,
  retentionDays: number,
  intervalMs: number,
): () => void {
  const tick = async (): Promise<void> => {
    try {
      const dropped = await runRetentionSweep(pool, retentionDays);
      if (dropped.length > 0) {
        console.log(`Retention sweep dropped partitions: ${dropped.join(", ")}`);
      }
    } catch (err) {
      console.error("Retention sweep failed", err);
    }
  };

  void tick();
  const handle = setInterval(tick, intervalMs);
  return () => clearInterval(handle);
}
