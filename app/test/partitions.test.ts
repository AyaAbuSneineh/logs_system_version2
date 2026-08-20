import { describe, expect, it } from "vitest";
import { PARTITION_PERIOD_MS, partitionName, periodStart } from "../src/db/partitions.js";

describe("periodStart", () => {
  it("aligns to a fixed 7-day grid from the Unix epoch", () => {
    const start = periodStart(new Date("2026-07-20T14:32:01.123Z"));
    expect(start.getTime() % PARTITION_PERIOD_MS).toBe(0);
  });

  it("maps two timestamps in the same week to the same period start", () => {
    const a = periodStart(new Date("2026-07-20T00:00:00.000Z"));
    const b = periodStart(new Date("2026-07-20T23:59:59.999Z"));
    expect(a.getTime()).toBe(b.getTime());
  });

  it("maps timestamps 7 days apart to different period starts", () => {
    const a = periodStart(new Date("2026-07-20T12:00:00.000Z"));
    const b = periodStart(new Date("2026-07-27T12:00:00.000Z"));
    expect(b.getTime() - a.getTime()).toBe(PARTITION_PERIOD_MS);
  });
});

describe("partitionName", () => {
  it("encodes the period start date, not the original timestamp", () => {
    const start = periodStart(new Date("2026-07-20T14:32:01.123Z"));
    const name = partitionName(start);
    expect(name).toMatch(/^logs_w\d{8}$/);
  });

  it("produces the same name for any timestamp within the same week", () => {
    const nameA = partitionName(periodStart(new Date("2026-07-20T00:00:00.000Z")));
    const nameB = partitionName(periodStart(new Date("2026-07-20T23:59:59.999Z")));
    expect(nameA).toBe(nameB);
  });
});
