function env(name: string, fallback?: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) return fallback;
  return parsed;
}

export const config = {
  port: envInt("PORT", 8080),
  host: env("HOST", "0.0.0.0"),

  database: {
    url: env(
      "DATABASE_URL",
      "postgres://postgres:postgres@localhost:5432/logs",
    ),
    // Split so a burst of ingest batches can never starve queries of a
    // connection (and vice versa) — see db/pool.ts.
    writePoolMax: envInt("DB_WRITE_POOL_MAX", 6),
    writePoolMin: envInt("DB_WRITE_POOL_MIN", 1),
    readPoolMax: envInt("DB_READ_POOL_MAX", 6),
    readPoolMin: envInt("DB_READ_POOL_MIN", 1),
  },

  ingest: {
    maxFutureSkewMs: 5 * 60 * 1000,
    // Guards process memory only; the API contract sets no batch-size cap.
    bodyLimitBytes: envInt("BODY_LIMIT_BYTES", 64 * 1024 * 1024),
  },

  query: {
    defaultLimit: 100,
    maxLimit: 1000,
  },

  retention: {
    // Days of data to keep. Partitions entirely older than this are dropped.
    days: envInt("RETENTION_DAYS", 30),
    // How often the retention sweep runs.
    sweepIntervalMs: envInt("RETENTION_SWEEP_INTERVAL_MS", 60 * 60 * 1000),
  },

  partitions: {
    // How many days of future partitions to keep pre-created at all times.
    lookaheadDays: envInt("PARTITION_LOOKAHEAD_DAYS", 3),
    maintenanceIntervalMs: envInt(
      "PARTITION_MAINTENANCE_INTERVAL_MS",
      15 * 60 * 1000,
    ),
  },
} as const;
