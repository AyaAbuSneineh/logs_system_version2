import { config } from "./config.js";
import { writePool, readPool, closePools } from "./db/pool.js";
import { runMigrations } from "./db/migrate.js";
import { ensureRecentPartitions, startPartitionMaintenanceLoop } from "./db/partitions.js";
import { startRetentionLoop } from "./db/retention.js";
import { buildServer } from "./server.js";

async function main(): Promise<void> {
  console.log("Connecting to database and applying migrations...");
  await runMigrations(writePool);

  // Cover the full retention window so that any in-policy timestamp (not
  // just "recent" ones) lands in a real daily partition instead of the
  // `logs_default` catch-all. Backfills or historical test data spread
  // across the retention window still get proper partition pruning and a
  // fast, lock-free drop once they expire.
  console.log("Ensuring partitions for incoming writes...");
  await ensureRecentPartitions(writePool, config.retention.days, config.partitions.lookaheadDays);

  const stopPartitionMaintenance = startPartitionMaintenanceLoop(
    writePool,
    config.retention.days,
    config.partitions.lookaheadDays,
    config.partitions.maintenanceIntervalMs,
  );
  const stopRetention = startRetentionLoop(writePool, config.retention.days, config.retention.sweepIntervalMs);

  const app = buildServer(writePool, readPool);

  const shutdown = async (): Promise<void> => {
    console.log("Shutting down...");
    stopPartitionMaintenance();
    stopRetention();
    await app.close();
    await closePools();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  await app.listen({ host: config.host, port: config.port });
  console.log(`Listening on ${config.host}:${config.port}`);
}

main().catch((err) => {
  console.error("Fatal startup error", err);
  process.exit(1);
});
