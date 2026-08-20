import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor } from "../src/lib/cursor.js";

describe("cursor", () => {
  it("round-trips a cursor through encode/decode", () => {
    const cursor = { ts: "2026-07-20T14:32:01.123Z", id: "abc-123" };
    const encoded = encodeCursor(cursor);
    expect(decodeCursor(encoded)).toEqual(cursor);
  });

  it("produces an opaque, URL-safe string", () => {
    const encoded = encodeCursor({ ts: "2026-07-20T14:32:01.123Z", id: "abc-123" });
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it("rejects garbage input", () => {
    expect(() => decodeCursor("not-valid-base64!!!")).toThrow();
  });

  it("rejects a cursor missing required fields", () => {
    const bogus = Buffer.from(JSON.stringify({ ts: "2026-07-20T14:32:01.123Z" })).toString(
      "base64url",
    );
    expect(() => decodeCursor(bogus)).toThrow();
  });

  it("rejects a cursor with an invalid timestamp", () => {
    const bogus = Buffer.from(JSON.stringify({ ts: "not-a-date", id: "x" })).toString(
      "base64url",
    );
    expect(() => decodeCursor(bogus)).toThrow();
  });
});
