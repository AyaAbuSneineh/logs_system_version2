import { describe, expect, it } from "vitest";
import { validateBatch, validateLogEntry } from "../src/validation/logEntry.js";

const validEntry = {
  timestamp: new Date().toISOString(),
  level: "info",
  service: "checkout",
  message: "payment declined",
  attributes: { user_id: "42", region: "eu-west", retries: 3, active: true },
};

describe("validateLogEntry", () => {
  it("accepts a well-formed entry", () => {
    const result = validateLogEntry(validEntry);
    expect(result.ok).toBe(true);
  });

  it("accepts an entry without attributes", () => {
    const { attributes, ...rest } = validEntry;
    const result = validateLogEntry(rest);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.entry.attributes).toEqual({});
  });

  it("rejects a missing timestamp", () => {
    const { timestamp, ...rest } = validEntry;
    const result = validateLogEntry(rest);
    expect(result.ok).toBe(false);
  });

  it("rejects a malformed timestamp", () => {
    const result = validateLogEntry({ ...validEntry, timestamp: "not-a-date" });
    expect(result.ok).toBe(false);
  });

  it("rejects a timestamp more than 5 minutes in the future", () => {
    const future = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const result = validateLogEntry({ ...validEntry, timestamp: future });
    expect(result.ok).toBe(false);
  });

  it("accepts a timestamp slightly in the future (clock skew tolerance)", () => {
    const future = new Date(Date.now() + 60 * 1000).toISOString();
    const result = validateLogEntry({ ...validEntry, timestamp: future });
    expect(result.ok).toBe(true);
  });

  it("rejects an invalid level", () => {
    const result = validateLogEntry({ ...validEntry, level: "critical" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("critical");
  });

  it("rejects an empty service", () => {
    const result = validateLogEntry({ ...validEntry, service: "" });
    expect(result.ok).toBe(false);
  });

  it("rejects a missing message", () => {
    const { message, ...rest } = validEntry;
    const result = validateLogEntry(rest);
    expect(result.ok).toBe(false);
  });

  it("rejects nested objects in attributes", () => {
    const result = validateLogEntry({
      ...validEntry,
      attributes: { nested: { a: 1 } },
    });
    expect(result.ok).toBe(false);
  });

  it("rejects arrays in attributes", () => {
    const result = validateLogEntry({ ...validEntry, attributes: { tags: [1, 2] } });
    expect(result.ok).toBe(false);
  });

  it("rejects a non-object attributes value", () => {
    const result = validateLogEntry({ ...validEntry, attributes: "oops" });
    expect(result.ok).toBe(false);
  });

  it("rejects a non-object entry", () => {
    const result = validateLogEntry("not an object");
    expect(result.ok).toBe(false);
  });
});

describe("validateBatch", () => {
  it("accepts valid entries and reports rejected ones by index with a reason", () => {
    const batch = [
      validEntry,
      { ...validEntry, level: "critical" },
      { ...validEntry, service: "" },
      validEntry,
    ];
    const { accepted, rejected } = validateBatch(batch);
    expect(accepted).toHaveLength(2);
    expect(rejected).toEqual([
      { index: 1, reason: expect.stringContaining("critical") },
      { index: 2, reason: expect.any(String) },
    ]);
  });

  it("does not fail the whole batch when one entry is invalid", () => {
    const batch = [validEntry, { ...validEntry, timestamp: "bad" }];
    const { accepted, rejected } = validateBatch(batch);
    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });
});
