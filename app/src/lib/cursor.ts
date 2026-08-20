import type { Cursor } from "../types.js";

/**
 * Cursors are an opaque, base64-encoded JSON pair of (timestamp, id) — the
 * exact keyset needed to resume a `timestamp DESC, id DESC` scan. The
 * format is implementation-defined per the API contract; callers must
 * treat it as opaque and pass it back unchanged.
 */
export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeCursor(raw: string): Cursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    throw new Error("invalid cursor");
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as Cursor).ts !== "string" ||
    typeof (parsed as Cursor).id !== "string" ||
    Number.isNaN(new Date((parsed as Cursor).ts).getTime())
  ) {
    throw new Error("invalid cursor");
  }
  return parsed as Cursor;
}
