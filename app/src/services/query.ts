import type { Pool } from "pg";
import { decodeCursor, encodeCursor } from "../lib/cursor.js";
import type { CommonFilters } from "../lib/filters.js";
import { buildLogsQuery } from "../lib/queryBuilder.js";
import { badRequest } from "../lib/errors.js";
import type { AttributeMap, StoredLog } from "../types.js";

interface LogRow {
  id: string;
  timestamp: Date;
  level: string;
  service: string;
  message: string;
  attributes: AttributeMap;
}

export interface LogsPage {
  logs: StoredLog[];
  next_cursor: string | null;
}

export async function queryLogs(
  pool: Pool,
  filters: CommonFilters,
  limit: number,
  cursorParam: string | undefined,
): Promise<LogsPage> {
  const cursor = cursorParam !== undefined ? decodeCursorOrThrow(cursorParam) : undefined;
  const { sql, params } = buildLogsQuery(filters, cursor, limit);

  const { rows } = await pool.query<LogRow>(sql, params);

  const logs: StoredLog[] = rows.map((row) => ({
    id: row.id,
    timestamp: row.timestamp.toISOString(),
    level: row.level as StoredLog["level"],
    service: row.service,
    message: row.message,
    attributes: row.attributes,
  }));

  const last = rows[rows.length - 1];
  const next_cursor =
    rows.length === limit && last
      ? encodeCursor({ ts: last.timestamp.toISOString(), id: last.id })
      : null;

  return { logs, next_cursor };
}

function decodeCursorOrThrow(raw: string): { ts: string; id: string } {
  try {
    return decodeCursor(raw);
  } catch {
    throw badRequest("invalid cursor");
  }
}
