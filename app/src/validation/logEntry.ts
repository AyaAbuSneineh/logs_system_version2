import { config } from "../config.js";
import {
  AttributeMap,
  AttributeValue,
  LOG_LEVELS,
  LogEntry,
  LogLevel,
  RawLogEntry,
} from "../types.js";

export type ValidationResult =
  | { ok: true; entry: LogEntry }
  | { ok: false; reason: string };

const ISO_8601_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export function parseIsoTimestamp(value: string): Date | null {
  if (!ISO_8601_RE.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function validateTimestamp(value: unknown): { ok: true; date: Date } | { ok: false; reason: string } {
  const date = typeof value === "string" ? parseIsoTimestamp(value) : null;
  if (!date) {
    return { ok: false, reason: `invalid timestamp: ${JSON.stringify(value)}` };
  }
  if (date.getTime() > Date.now() + config.ingest.maxFutureSkewMs) {
    return { ok: false, reason: "timestamp is more than five minutes in the future" };
  }
  return { ok: true, date };
}

function validateLevel(value: unknown): { ok: true; level: LogLevel } | { ok: false; reason: string } {
  if (typeof value !== "string" || !LOG_LEVELS.includes(value as LogLevel)) {
    return { ok: false, reason: `invalid level: ${JSON.stringify(value)}` };
  }
  return { ok: true, level: value as LogLevel };
}

function validateNonEmptyString(
  value: unknown,
  field: string,
): { ok: true; value: string } | { ok: false; reason: string } {
  if (typeof value !== "string" || value.length === 0) {
    return { ok: false, reason: `${field} must be a non-empty string` };
  }
  return { ok: true, value };
}

function validateAttributes(
  value: unknown,
): { ok: true; attributes: AttributeMap } | { ok: false; reason: string } {
  if (value === undefined || value === null) {
    return { ok: true, attributes: {} };
  }
  if (!isPlainObject(value)) {
    return { ok: false, reason: "attributes must be a flat object" };
  }
  const attributes: AttributeMap = {};
  for (const [key, raw] of Object.entries(value)) {
    if (raw === null) continue;
    const type = typeof raw;
    if (type !== "string" && type !== "number" && type !== "boolean") {
      return {
        ok: false,
        reason: `attribute '${key}' must be a string, number, or boolean`,
      };
    }
    if (Array.isArray(raw) || isPlainObject(raw)) {
      return {
        ok: false,
        reason: `attribute '${key}' must not be a nested object or array`,
      };
    }
    attributes[key] = raw as AttributeValue;
  }
  return { ok: true, attributes };
}

export function validateLogEntry(raw: unknown): ValidationResult {
  if (!isPlainObject(raw)) {
    return { ok: false, reason: "log entry must be an object" };
  }
  const entry = raw as RawLogEntry;

  const ts = validateTimestamp(entry.timestamp);
  if (!ts.ok) return ts;

  const level = validateLevel(entry.level);
  if (!level.ok) return level;

  const service = validateNonEmptyString(entry.service, "service");
  if (!service.ok) return service;

  const message = validateNonEmptyString(entry.message, "message");
  if (!message.ok) return message;

  const attributes = validateAttributes(entry.attributes);
  if (!attributes.ok) return attributes;

  return {
    ok: true,
    entry: {
      timestamp: ts.date,
      level: level.level,
      service: service.value,
      message: message.value,
      attributes: attributes.attributes,
    },
  };
}

export function validateBatch(rawLogs: unknown[]): {
  accepted: LogEntry[];
  rejected: { index: number; reason: string }[];
} {
  const accepted: LogEntry[] = [];
  const rejected: { index: number; reason: string }[] = [];

  rawLogs.forEach((raw, index) => {
    const result = validateLogEntry(raw);
    if (result.ok) {
      accepted.push(result.entry);
    } else {
      rejected.push({ index, reason: result.reason });
    }
  });

  return { accepted, rejected };
}
