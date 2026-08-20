import type { CommonFilters } from "./filters.js";

/**
 * Appends `filters` as parameterized SQL conditions to `params` and
 * returns the matching WHERE-clause fragments. Shared by GET /logs and
 * GET /logs/aggregate so both endpoints filter identically.
 *
 * All values are bound as query parameters — never string-interpolated —
 * so this is safe against SQL injection regardless of what a caller sends
 * as a service name, message substring, or attribute value.
 */
export function buildFilterConditions(filters: CommonFilters, params: unknown[]): string[] {
  const conditions: string[] = [];

  if (filters.service !== undefined) {
    params.push(filters.service);
    conditions.push(`service = $${params.length}`);
  }

  if (filters.level !== undefined) {
    params.push(filters.level);
    conditions.push(`level = $${params.length}`);
  }

  if (filters.since !== undefined) {
    params.push(filters.since);
    conditions.push(`"timestamp" >= $${params.length}`);
  }

  if (filters.until !== undefined) {
    params.push(filters.until);
    conditions.push(`"timestamp" < $${params.length}`);
  }

  if (filters.q !== undefined) {
    params.push(filters.q);
    conditions.push(`message ILIKE ('%' || $${params.length} || '%')`);
  }

  // Attribute equality is stored twice: `attributes` keeps the original
  // JSON types for round-tripping in responses, `attributes_text` has
  // every value stringified so `attr.<key>=value` can match "as strings"
  // regardless of whether the stored value is a number, boolean, or
  // string. Containment against attributes_text uses the
  // GIN(jsonb_path_ops) index for an exact key/value lookup.
  for (const [key, value] of Object.entries(filters.attrs)) {
    params.push(JSON.stringify({ [key]: value }));
    conditions.push(`attributes_text @> $${params.length}::jsonb`);
  }

  return conditions;
}

export interface LogsQuery {
  sql: string;
  params: unknown[];
}

export function buildLogsQuery(
  filters: CommonFilters,
  cursor: { ts: string; id: string } | undefined,
  limit: number,
): LogsQuery {
  const params: unknown[] = [];
  const conditions = buildFilterConditions(filters, params);

  if (cursor) {
    params.push(cursor.ts, cursor.id);
    conditions.push(`("timestamp", id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(limit);

  const sql = `
    SELECT id, "timestamp", level, service, message, attributes
    FROM logs
    ${where}
    ORDER BY "timestamp" DESC, id DESC
    LIMIT $${params.length}
  `;

  return { sql, params };
}
