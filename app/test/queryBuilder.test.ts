import { describe, expect, it } from "vitest";
import { buildLogsQuery } from "../src/lib/queryBuilder.js";
import { buildAggregateQuery } from "../src/lib/aggregateBuilder.js";
import type { CommonFilters } from "../src/lib/filters.js";

function emptyFilters(): CommonFilters {
  return { attrs: {} };
}

describe("buildLogsQuery", () => {
  it("builds an unfiltered query with only a limit param", () => {
    const { sql, params } = buildLogsQuery(emptyFilters(), undefined, 100);
    expect(sql).not.toContain("WHERE");
    expect(sql).toContain("ORDER BY \"timestamp\" DESC, id DESC");
    expect(params).toEqual([100]);
  });

  it("parameterizes service, level, time range, and q — never interpolates them", () => {
    const filters: CommonFilters = {
      service: "checkout",
      level: "error",
      since: new Date("2026-07-20T14:00:00Z"),
      until: new Date("2026-07-20T15:00:00Z"),
      q: "'; DROP TABLE logs; --",
      attrs: { user_id: "42" },
    };
    const { sql, params } = buildLogsQuery(filters, undefined, 50);

    expect(sql).not.toContain("DROP TABLE");
    expect(sql).toContain("service = $1");
    expect(sql).toContain("level = $2");
    expect(sql).toContain('"timestamp" >= $3');
    expect(sql).toContain('"timestamp" < $4');
    expect(sql).toContain("message ILIKE");
    expect(sql).toContain("attributes_text @>");
    expect(params).toEqual([
      "checkout",
      "error",
      filters.since,
      filters.until,
      "'; DROP TABLE logs; --",
      JSON.stringify({ user_id: "42" }),
      50,
    ]);
  });

  it("adds a keyset condition when a cursor is supplied", () => {
    const { sql, params } = buildLogsQuery(emptyFilters(), { ts: "2026-07-20T14:00:00Z", id: "abc" }, 100);
    expect(sql).toContain('("timestamp", id) <');
    expect(params).toEqual(["2026-07-20T14:00:00Z", "abc", 100]);
  });
});

describe("buildAggregateQuery", () => {
  it("groups by bucket only when group_by is absent", () => {
    const { sql } = buildAggregateQuery(emptyFilters(), "1m", undefined);
    expect(sql).toContain("NULL AS grp");
    expect(sql).toContain("date_bin('1 minute'");
  });

  it("groups by the requested dimension", () => {
    const { sql } = buildAggregateQuery(emptyFilters(), "1h", "service");
    expect(sql).toContain("service AS grp");
    expect(sql).toContain("date_bin('1 hour'");
  });

  it("still applies filters to the aggregate query", () => {
    const filters: CommonFilters = { service: "checkout", attrs: {} };
    const { sql, params } = buildAggregateQuery(filters, "5m", "level");
    expect(sql).toContain("WHERE service = $1");
    expect(params).toEqual(["checkout"]);
  });
});
