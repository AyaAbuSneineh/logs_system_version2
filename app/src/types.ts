export type LogLevel = "debug" | "info" | "warn" | "error";

export const LOG_LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"];

export type AttributeValue = string | number | boolean;

export type AttributeMap = Record<string, AttributeValue>;

export interface RawLogEntry {
  timestamp?: unknown;
  level?: unknown;
  service?: unknown;
  message?: unknown;
  attributes?: unknown;
}

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  service: string;
  message: string;
  attributes: AttributeMap;
}

export interface StoredLog {
  id: string;
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  attributes: AttributeMap;
}

export interface RejectedEntry {
  index: number;
  reason: string;
}

export interface IngestResult {
  accepted: number;
  rejected: RejectedEntry[];
}

export interface Cursor {
  ts: string;
  id: string;
}

export type BucketSize = "1m" | "5m" | "1h" | "1d";

export const BUCKET_INTERVALS: Record<BucketSize, string> = {
  "1m": "1 minute",
  "5m": "5 minutes",
  "1h": "1 hour",
  "1d": "1 day",
};

export type GroupByField = "service" | "level";

export interface AggregateBucket {
  start: string;
  group: string | null;
  count: number;
}
