import { describe, expect, it } from "vitest";
import { floorToMinute, groupIntoRollupRows } from "../src/lib/rollup.js";
import type { LogEntry } from "../src/types.js";

function entry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    timestamp: new Date("2026-07-20T14:32:01.123Z"),
    level: "info",
    service: "checkout",
    message: "ok",
    attributes: {},
    ...overrides,
  };
}

describe("floorToMinute", () => {
  it("truncates seconds and milliseconds", () => {
    expect(floorToMinute(new Date("2026-07-20T14:32:59.999Z")).toISOString()).toBe(
      "2026-07-20T14:32:00.000Z",
    );
  });

  it("leaves an already minute-aligned timestamp unchanged", () => {
    expect(floorToMinute(new Date("2026-07-20T14:32:00.000Z")).toISOString()).toBe(
      "2026-07-20T14:32:00.000Z",
    );
  });
});

describe("groupIntoRollupRows", () => {
  it("collapses same-minute/service/level entries into one counted row", () => {
    const rows = groupIntoRollupRows([
      entry({ timestamp: new Date("2026-07-20T14:32:00.100Z") }),
      entry({ timestamp: new Date("2026-07-20T14:32:59.900Z") }),
      entry({ timestamp: new Date("2026-07-20T14:32:30.000Z") }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ service: "checkout", level: "info", count: 3 });
    expect(rows[0]?.bucketStart.toISOString()).toBe("2026-07-20T14:32:00.000Z");
  });

  it("keeps distinct minute/service/level combinations separate", () => {
    const rows = groupIntoRollupRows([
      entry({ timestamp: new Date("2026-07-20T14:32:00.000Z"), service: "checkout", level: "info" }),
      entry({ timestamp: new Date("2026-07-20T14:33:00.000Z"), service: "checkout", level: "info" }),
      entry({ timestamp: new Date("2026-07-20T14:32:00.000Z"), service: "auth", level: "info" }),
      entry({ timestamp: new Date("2026-07-20T14:32:00.000Z"), service: "checkout", level: "error" }),
    ]);

    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.count === 1)).toBe(true);
  });

  it("returns an empty array for an empty batch", () => {
    expect(groupIntoRollupRows([])).toEqual([]);
  });
});
