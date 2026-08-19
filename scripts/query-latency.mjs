// Fires GET /logs/aggregate (and a couple of GET /logs variants) once per
// second against the running stack and records latency percentiles.
// Development-only tool, not part of the shipped service.
const BASE_URL = process.env.BASE_URL ?? "http://localhost:8081";
const DURATION_SEC = Number(process.env.DURATION_SEC ?? 30);

const samples = { aggregate: [], logsFiltered: [], logsAttr: [] };

function since24hAgoIso() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

async function timeit(label, url) {
  const start = performance.now();
  const res = await fetch(url);
  await res.json();
  const elapsed = performance.now() - start;
  samples[label].push(elapsed);
  if (!res.ok) console.error(`${label} -> ${res.status}`);
}

function percentile(arr, p) {
  if (arr.length === 0) return NaN;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

async function main() {
  const end = Date.now() + DURATION_SEC * 1000;
  const since = since24hAgoIso();
  const until = new Date().toISOString();

  const mode = process.env.MODE ?? "spec"; // "spec" = 1 aggregate req/s per contract; "stress" = 3 concurrent req/s

  while (Date.now() < end) {
    const loopStart = Date.now();
    if (mode === "spec") {
      await timeit(
        "aggregate",
        `${BASE_URL}/logs/aggregate?since=${since}&until=${until}&bucket=1h&group_by=service`,
      );
    } else {
      await Promise.all([
        timeit(
          "aggregate",
          `${BASE_URL}/logs/aggregate?since=${since}&until=${until}&bucket=1h&group_by=service`,
        ),
        timeit("logsFiltered", `${BASE_URL}/logs?service=checkout&level=error&limit=100`),
        timeit("logsAttr", `${BASE_URL}/logs?attr.region=eu-west&limit=100`),
      ]);
    }
    const remaining = 1000 - (Date.now() - loopStart);
    if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
  }

  for (const [label, arr] of Object.entries(samples)) {
    console.log(
      `${label}: n=${arr.length} p50=${percentile(arr, 50).toFixed(1)}ms p95=${percentile(arr, 95).toFixed(1)}ms p99=${percentile(arr, 99).toFixed(1)}ms max=${Math.max(...arr).toFixed(1)}ms`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
