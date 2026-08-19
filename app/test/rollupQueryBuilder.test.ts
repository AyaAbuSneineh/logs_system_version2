import { describe, expect, it } from "vitest";
import { buildRollupAggregateQuery, isRollupEligible } from "../src/lib/rollupQueryBuilder.js";
import type { CommonFilters } from "../src/lib/filters.js";

function emptyFilters(): CommonFilters {
  return { attrs: {} };
}

describe("isRollupEligible", () => {
  it("is eligible with no attr/q filters", () => {
    expect(isRollupEligible(emptyFilters())).toBe(true);
    expect(isRollupEligible({ service: "checkout", level: "error", attrs: {} })).toBe(true);
  });

  it("is ineligible when an attribute filter is present", () => {
    expect(isRollupEligible({ attrs: { user_id: "42" } })).toBe(false);
  });

  it("is ineligible when a message filter is present", () => {
    expect(isRollupEligible({ attrs: {}, q: "declined" })).toBe(false);
  });
});

describe("buildRollupAggregateQuery", () => {
  it("queries logs_rollup and sums counts", () => {
    const { sql } = buildRollupAggregateQuery(emptyFilters(), "1m", undefined);
    expect(sql).toContain("FROM logs_rollup");
    expect(sql).toContain("SUM(count)");
    expect(sql).toContain("NULL AS grp");
    expect(sql).toContain("date_bin('1 minute'");
  });

  it("groups and orders positionally, not by the shadowed bucket_start column name", () => {
    // logs_rollup has a real `bucket_start` column that a *named*
    // `GROUP BY bucket_start` would silently resolve to instead of the
    // `date_bin(...) AS bucket_start` alias — grouping by the raw minute
    // instead of the requested (coarser) bucket. Verified against a live
    // Postgres to actually collapse same-hour rows from different
    // minutes; see git history for the reproduction.
    const { sql } = buildRollupAggregateQuery(emptyFilters(), "1h", undefined);
    expect(sql).toContain("GROUP BY 1, 2");
    expect(sql).toContain("ORDER BY 1 ASC, 2 ASC NULLS FIRST");
  });

  it("groups by the requested dimension", () => {
    const { sql } = buildRollupAggregateQuery(emptyFilters(), "1d", "service");
    expect(sql).toContain("service AS grp");
    expect(sql).toContain("date_bin('1 day'");
  });

  it("parameterizes service, level, and time range against bucket_start", () => {
    const filters: CommonFilters = {
      service: "checkout",
      level: "error",
      since: new Date("2026-07-20T14:00:00Z"),
      until: new Date("2026-07-20T15:00:00Z"),
      attrs: {},
    };
    const { sql, params } = buildRollupAggregateQuery(filters, "5m", "level");

    expect(sql).toContain("service = $1");
    expect(sql).toContain("level = $2");
    expect(sql).toContain("bucket_start >= $3");
    expect(sql).toContain("bucket_start < $4");
    expect(params).toEqual(["checkout", "error", filters.since, filters.until]);
  });
});
