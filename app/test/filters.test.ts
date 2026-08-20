import { describe, expect, it } from "vitest";
import { parseCommonFilters, parseLimit } from "../src/lib/filters.js";
import { ApiError } from "../src/lib/errors.js";

describe("parseCommonFilters", () => {
  it("parses service, level, time range, q, and attr.* filters", () => {
    const filters = parseCommonFilters({
      service: "checkout",
      level: "error",
      since: "2026-07-20T14:00:00Z",
      until: "2026-07-20T15:00:00Z",
      q: "declined",
      "attr.user_id": "42",
      "attr.region": "eu-west",
    });

    expect(filters.service).toBe("checkout");
    expect(filters.level).toBe("error");
    expect(filters.since?.toISOString()).toBe("2026-07-20T14:00:00.000Z");
    expect(filters.until?.toISOString()).toBe("2026-07-20T15:00:00.000Z");
    expect(filters.q).toBe("declined");
    expect(filters.attrs).toEqual({ user_id: "42", region: "eu-west" });
  });

  it("returns empty filters when nothing is provided", () => {
    const filters = parseCommonFilters({});
    expect(filters.service).toBeUndefined();
    expect(filters.level).toBeUndefined();
    expect(filters.attrs).toEqual({});
  });

  it("rejects an invalid level", () => {
    expect(() => parseCommonFilters({ level: "critical" })).toThrow(ApiError);
  });

  it("rejects an invalid since timestamp", () => {
    expect(() => parseCommonFilters({ since: "not-a-date" })).toThrow(ApiError);
  });

  it("rejects until earlier than since", () => {
    expect(() =>
      parseCommonFilters({
        since: "2026-07-20T15:00:00Z",
        until: "2026-07-20T14:00:00Z",
      }),
    ).toThrow(ApiError);
  });
});

describe("parseLimit", () => {
  it("defaults when absent", () => {
    expect(parseLimit({}, 100, 1000)).toBe(100);
  });

  it("parses a valid limit", () => {
    expect(parseLimit({ limit: "500" }, 100, 1000)).toBe(500);
  });

  it("rejects a non-numeric limit", () => {
    expect(() => parseLimit({ limit: "abc" }, 100, 1000)).toThrow(ApiError);
  });

  it("rejects a limit above the maximum", () => {
    expect(() => parseLimit({ limit: "5000" }, 100, 1000)).toThrow(ApiError);
  });

  it("rejects a limit of zero", () => {
    expect(() => parseLimit({ limit: "0" }, 100, 1000)).toThrow(ApiError);
  });
});
