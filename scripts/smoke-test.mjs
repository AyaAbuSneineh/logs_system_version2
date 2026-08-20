// Contract smoke test used by CI (and locally) against a running stack.
// Exercises all four required endpoints and checks response shapes and
// status codes match the API contract. Exits non-zero on any failure.
const BASE_URL = process.env.BASE_URL ?? "http://localhost:8080";

let failures = 0;

function check(condition, message) {
  if (!condition) {
    failures++;
    console.error(`FAIL: ${message}`);
  } else {
    console.log(`OK:   ${message}`);
  }
}

async function main() {
  // --- GET /health ---
  {
    const res = await fetch(`${BASE_URL}/health`);
    check(res.status === 200, "GET /health returns 200");
  }

  // --- POST /logs: mixed valid/invalid batch ---
  const now = new Date().toISOString();
  let ingestBody;
  {
    const res = await fetch(`${BASE_URL}/logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        logs: [
          {
            timestamp: now,
            level: "error",
            service: "smoke-test",
            message: "payment declined",
            attributes: { user_id: "42", region: "eu-west", retries: 3 },
          },
          { timestamp: now, level: "info", service: "smoke-test", message: "order placed" },
          { timestamp: now, level: "critical", service: "smoke-test", message: "bad level" },
        ],
      }),
    });
    ingestBody = await res.json();
    check(res.status === 200, "POST /logs returns 200 for a partially-valid batch");
    check(ingestBody.accepted === 2, "POST /logs accepts the 2 valid entries");
    check(
      Array.isArray(ingestBody.rejected) &&
        ingestBody.rejected.length === 1 &&
        ingestBody.rejected[0].index === 2,
      "POST /logs reports the rejected entry by index",
    );
  }

  // --- POST /logs: all-invalid batch -> 400 ---
  {
    const res = await fetch(`${BASE_URL}/logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logs: [{ timestamp: "not-a-date" }] }),
    });
    check(res.status === 400, "POST /logs returns 400 when every entry is rejected");
  }

  // --- POST /logs: malformed JSON -> 400 ---
  {
    const res = await fetch(`${BASE_URL}/logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    check(res.status === 400, "POST /logs returns 400 for malformed JSON");
  }

  // --- GET /logs ---
  {
    const res = await fetch(`${BASE_URL}/logs?service=smoke-test&limit=10`);
    const body = await res.json();
    check(res.status === 200, "GET /logs returns 200");
    check(Array.isArray(body.logs) && body.logs.length >= 2, "GET /logs returns ingested entries");
    check("next_cursor" in body, "GET /logs response has next_cursor");
  }

  // --- GET /logs: attribute filter ---
  {
    const res = await fetch(`${BASE_URL}/logs?attr.user_id=42`);
    const body = await res.json();
    check(
      res.status === 200 && body.logs.some((l) => l.attributes.user_id === "42"),
      "GET /logs filters by attr.<key>",
    );
  }

  // --- GET /logs: invalid params -> 400 ---
  {
    const res = await fetch(`${BASE_URL}/logs?level=bogus`);
    const body = await res.json();
    check(res.status === 400 && typeof body.error === "string", "GET /logs returns 400 for an invalid level");
  }

  // --- GET /logs/aggregate ---
  {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const until = new Date(Date.now() + 60 * 1000).toISOString();
    const res = await fetch(
      `${BASE_URL}/logs/aggregate?service=smoke-test&since=${since}&until=${until}&bucket=1m&group_by=level`,
    );
    const body = await res.json();
    check(res.status === 200, "GET /logs/aggregate returns 200");
    check(Array.isArray(body.buckets) && body.buckets.length > 0, "GET /logs/aggregate returns buckets");
  }

  // --- GET /logs/aggregate: missing required param -> 400 ---
  {
    const res = await fetch(`${BASE_URL}/logs/aggregate?bucket=1m`);
    check(res.status === 400, "GET /logs/aggregate returns 400 when since/until are missing");
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll contract smoke checks passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
