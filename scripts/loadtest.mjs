// Throwaway local load-test / seeding script used during development to
// validate throughput and query latency against the running compose stack.
// Not part of the shipped service; not copied into the Docker image.
import { setTimeout as sleep } from "node:timers/promises";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:8081";
const TOTAL_ROWS = Number(process.env.TOTAL_ROWS ?? 1_000_000);
const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? 1000);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 8);

const SERVICES = ["checkout", "auth", "search", "billing", "notifications"];
const LEVELS = ["debug", "info", "warn", "error"];
const REGIONS = ["eu-west", "us-east", "ap-south"];

// "recent" mirrors a realistic log-ingestion workload where timestamps are
// close to current time (all writes land in today's 1-2 partitions).
// "spread" scatters timestamps across the whole retention window, useful
// for exercising partition pruning and retention separately, but it
// multiplies the working set across dozens of partitions at once, which
// is not representative of a real ingestion burst.
const TIMESTAMP_MODE = process.env.TIMESTAMP_MODE ?? "recent";
const START_TIME = TIMESTAMP_MODE === "spread" ? Date.now() - 30 * 24 * 60 * 60 * 1000 : Date.now();
const SPAN_MS = TIMESTAMP_MODE === "spread" ? 30 * 24 * 60 * 60 * 1000 : 60 * 1000;

function randomEntry(i) {
  const ts = new Date(START_TIME + Math.random() * SPAN_MS).toISOString();
  return {
    timestamp: ts,
    level: LEVELS[Math.floor(Math.random() * LEVELS.length)],
    service: SERVICES[Math.floor(Math.random() * SERVICES.length)],
    message: `event ${i} something happened with code ${i % 500}`,
    attributes: {
      user_id: String(1000 + (i % 5000)),
      region: REGIONS[Math.floor(Math.random() * REGIONS.length)],
      retries: i % 4,
    },
  };
}

async function sendBatch(size, offset) {
  const logs = Array.from({ length: size }, (_, k) => randomEntry(offset + k));
  const res = await fetch(`${BASE_URL}/logs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ logs }),
  });
  if (!res.ok && res.status !== 200) {
    const text = await res.text();
    throw new Error(`batch failed: ${res.status} ${text}`);
  }
  await res.json();
}

async function worker(id, batches) {
  for (const offset of batches) {
    await sendBatch(BATCH_SIZE, offset);
  }
}

async function main() {
  const totalBatches = Math.ceil(TOTAL_ROWS / BATCH_SIZE);
  const offsets = Array.from({ length: totalBatches }, (_, i) => i * BATCH_SIZE);

  const lanes = Array.from({ length: CONCURRENCY }, () => []);
  offsets.forEach((offset, i) => lanes[i % CONCURRENCY].push(offset));

  const start = Date.now();
  let lastReport = start;
  let sent = 0;

  const reporter = setInterval(() => {
    const now = Date.now();
    const elapsed = (now - start) / 1000;
    console.log(
      `sent=${sent}/${TOTAL_ROWS} rate=${Math.round((sent / elapsed) || 0)}/s`,
    );
    lastReport = now;
  }, 2000);

  await Promise.all(
    lanes.map(async (batches) => {
      for (const offset of batches) {
        await sendBatch(BATCH_SIZE, offset);
        sent += BATCH_SIZE;
      }
    }),
  );

  clearInterval(reporter);
  const elapsed = (Date.now() - start) / 1000;
  console.log(`Done. Inserted ~${TOTAL_ROWS} rows in ${elapsed.toFixed(1)}s (${Math.round(TOTAL_ROWS / elapsed)}/s)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
