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
