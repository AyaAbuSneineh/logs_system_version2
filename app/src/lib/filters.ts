import { LOG_LEVELS, LogLevel } from "../types.js";
import { parseIsoTimestamp } from "../validation/logEntry.js";
import { badRequest } from "./errors.js";

export interface CommonFilters {
  service?: string;
  level?: LogLevel;
  since?: Date;
  until?: Date;
  attrs: Record<string, string>;
  q?: string;
}

function firstValue(value: unknown): string | undefined {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : undefined;
  return typeof value === "string" ? value : undefined;
}

/** Parses the filter parameters shared by GET /logs and GET /logs/aggregate. */
export function parseCommonFilters(query: Record<string, unknown>): CommonFilters {
  const result: CommonFilters = { attrs: {} };

  const service = firstValue(query.service);
  if (service !== undefined) {
    if (service.length === 0) throw badRequest("service must be a non-empty string");
    result.service = service;
  }

  const level = firstValue(query.level);
  if (level !== undefined) {
    if (!LOG_LEVELS.includes(level as LogLevel)) {
      throw badRequest(`invalid level: ${JSON.stringify(level)}`);
    }
    result.level = level as LogLevel;
  }

  const since = firstValue(query.since);
  if (since !== undefined) {
    const date = parseIsoTimestamp(since);
    if (!date) throw badRequest(`invalid timestamp for 'since': ${JSON.stringify(since)}`);
    result.since = date;
  }

  const until = firstValue(query.until);
  if (until !== undefined) {
    const date = parseIsoTimestamp(until);
    if (!date) throw badRequest(`invalid timestamp for 'until': ${JSON.stringify(until)}`);
    result.until = date;
  }

  if (result.since && result.until && result.until.getTime() < result.since.getTime()) {
    throw badRequest("'until' must not be earlier than 'since'");
  }

  const q = firstValue(query.q);
  if (q !== undefined && q.length > 0) {
    result.q = q;
  }

  for (const [key, value] of Object.entries(query)) {
    if (!key.startsWith("attr.")) continue;
    const attrKey = key.slice("attr.".length);
    if (attrKey.length === 0) continue;
    const attrValue = firstValue(value);
    if (attrValue !== undefined) {
      result.attrs[attrKey] = attrValue;
    }
  }

  return result;
}

export function parseLimit(query: Record<string, unknown>, defaultLimit: number, maxLimit: number): number {
  const raw = firstValue(query.limit);
  if (raw === undefined) return defaultLimit;
  if (!/^\d+$/.test(raw)) throw badRequest(`limit must be a positive integer: ${JSON.stringify(raw)}`);
  const limit = Number.parseInt(raw, 10);
  if (limit < 1 || limit > maxLimit) {
    throw badRequest(`limit must be between 1 and ${maxLimit}`);
  }
  return limit;
}
