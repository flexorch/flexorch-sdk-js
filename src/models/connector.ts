export class Connector {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly active: boolean;
  readonly lastTestedAt: string | null;
  readonly lastUsedAt: string | null;
  readonly createdAt: string;

  constructor(data: {
    id: string;
    name: string;
    type: string;
    active: boolean;
    lastTestedAt: string | null;
    lastUsedAt: string | null;
    createdAt: string;
  }) {
    this.id = data.id;
    this.name = data.name;
    this.type = data.type;
    this.active = data.active;
    this.lastTestedAt = data.lastTestedAt;
    this.lastUsedAt = data.lastUsedAt;
    this.createdAt = data.createdAt;
  }

  static fromDict(data: Record<string, unknown>): Connector {
    return new Connector({
      id: String(data["id"] ?? ""),
      name: String(data["name"] ?? ""),
      type: String(data["type"] ?? ""),
      active: Boolean(data["active"] ?? true),
      lastTestedAt: (data["last_tested_at"] as string | null) ?? null,
      lastUsedAt: (data["last_used_at"] as string | null) ?? null,
      createdAt: String(data["created_at"] ?? ""),
    });
  }

  toString(): string {
    return `Connector(id=${this.id}, name=${this.name}, type=${this.type})`;
  }
}

export interface ConnectorTestResult {
  success: boolean;
  latencyMs: number | null;
  message: string;
}

export type ConnectorType =
  | "s3" | "gcs" | "azure_blob" | "google_drive"
  | "pgvector_external" | "pinecone" | "qdrant";

export interface S3ConnectorConfig {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix?: string;
}

export interface SyncSchedule {
  id: string;
  connectorId: string;
  cronExpression: string;
  prefixFilter: string | null;
  isActive: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
}

export function syncScheduleFromDict(data: Record<string, unknown>): SyncSchedule {
  return {
    id: String(data["id"] ?? ""),
    connectorId: String(data["connector_id"] ?? ""),
    cronExpression: String(data["cron_expression"] ?? ""),
    prefixFilter: (data["prefix_filter"] as string | null) ?? null,
    isActive: Boolean(data["is_active"] ?? true),
    lastRunAt: (data["last_run_at"] as string | null) ?? null,
    nextRunAt: (data["next_run_at"] as string | null) ?? null,
    createdAt: String(data["created_at"] ?? ""),
  };
}

export interface SyncLog {
  id: string;
  scheduleId: string;
  startedAt: string;
  completedAt: string | null;
  filesFound: number;
  filesNew: number;
  filesSkipped: number;
  filesFailed: number;
  status: string;
  errorMessage: string | null;
}

export function syncLogFromDict(data: Record<string, unknown>): SyncLog {
  return {
    id: String(data["id"] ?? ""),
    scheduleId: String(data["schedule_id"] ?? ""),
    startedAt: String(data["started_at"] ?? ""),
    completedAt: (data["completed_at"] as string | null) ?? null,
    filesFound: Number(data["files_found"] ?? 0),
    filesNew: Number(data["files_new"] ?? 0),
    filesSkipped: Number(data["files_skipped"] ?? 0),
    filesFailed: Number(data["files_failed"] ?? 0),
    status: String(data["status"] ?? ""),
    errorMessage: (data["error_message"] as string | null) ?? null,
  };
}
