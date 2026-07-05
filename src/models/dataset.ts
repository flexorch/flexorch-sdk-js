import type { Transport } from "../transport.js";

const SUPPORTED_FORMATS = new Set([
  "json", "jsonl", "csv", "parquet", "md", "xml", "xlsx", "rag", "hf",
]);

export type ExportFormat = "json" | "jsonl" | "csv" | "parquet" | "md" | "xml" | "xlsx" | "rag" | "hf";

export class Dataset {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly status: string;
  readonly rowCount: number;
  readonly createdAt: string;
  readonly availableFormats: string[];
  private readonly _transport: Transport;

  constructor(data: {
    id: string;
    name: string;
    slug: string;
    status: string;
    rowCount: number;
    createdAt: string;
    availableFormats: string[];
    _transport: Transport;
  }) {
    this.id = data.id;
    this.name = data.name;
    this.slug = data.slug;
    this.status = data.status;
    this.rowCount = data.rowCount;
    this.createdAt = data.createdAt;
    this.availableFormats = data.availableFormats;
    this._transport = data._transport;
  }

  static fromDict(data: Record<string, unknown>, transport: Transport): Dataset {
    const fmt = (data["format_summary"] as Record<string, unknown> | undefined) ?? {};
    const files = (fmt["files"] as Record<string, unknown> | undefined) ?? {};
    return new Dataset({
      id: String(data["id"] ?? ""),
      name: String(data["name"] ?? ""),
      slug: String(data["slug"] ?? ""),
      status: String(data["status"] ?? ""),
      rowCount: Number(data["row_count"] ?? 0),
      createdAt: String(data["created_at"] ?? ""),
      availableFormats: Object.keys(files),
      _transport: transport,
    });
  }

  async export(format: ExportFormat): Promise<Uint8Array> {
    if (!SUPPORTED_FORMATS.has(format)) {
      throw new Error(`Unsupported format "${format}". Choose from: ${[...SUPPORTED_FORMATS].sort().join(", ")}`);
    }
    return this._transport.getBytes(`/datasets/${this.id}/export`, { format });
  }

  async exportToS3(
    connectorId: string,
    format: ExportFormat,
    prefix = "",
  ): Promise<{ s3Key: string; sizeBytes: number }> {
    if (!SUPPORTED_FORMATS.has(format)) {
      throw new Error(`Unsupported format "${format}". Choose from: ${[...SUPPORTED_FORMATS].sort().join(", ")}`);
    }
    const data = (await this._transport.post(`/datasets/${this.id}/export-s3`, {
      format,
      connector_id: connectorId,
      prefix,
    })) as Record<string, unknown>;
    return {
      s3Key: String(data["s3_key"] ?? ""),
      sizeBytes: Number(data["size_bytes"] ?? 0),
    };
  }

  async chunks(opts: {
    page?: number;
    pageSize?: number;
    qualityGrade?: string;
    piiMasked?: boolean;
  } = {}): Promise<{
    items: Array<{
      chunkId: string;
      chunkIndex: number;
      text: string;
      tokenCount: number;
      metadata: Record<string, unknown>;
    }>;
    total: number;
    page: number;
    pageSize: number;
  }> {
    const params: Record<string, string> = {};
    if (opts.page !== undefined) params["page"] = String(opts.page);
    if (opts.pageSize !== undefined) params["page_size"] = String(opts.pageSize);
    if (opts.qualityGrade !== undefined) params["quality_grade"] = opts.qualityGrade;
    if (opts.piiMasked !== undefined) params["pii_masked"] = String(opts.piiMasked);
    const data = ((await this._transport.get(`/datasets/${this.id}/chunks`, params)) ??
      {}) as Record<string, unknown>;
    const raw = (data["items"] as Record<string, unknown>[] | undefined) ?? [];
    return {
      items: raw.map((item) => ({
        chunkId: String(item["chunk_id"] ?? ""),
        chunkIndex: Number(item["chunk_index"] ?? 0),
        text: String(item["text"] ?? ""),
        tokenCount: Number(item["token_count"] ?? 0),
        metadata: (item["metadata"] as Record<string, unknown>) ?? {},
      })),
      total: Number(data["total"] ?? 0),
      page: Number(data["page"] ?? 1),
      pageSize: Number(data["page_size"] ?? 20),
    };
  }

  async index(): Promise<{ status: string; message: string }> {
    const data = ((await this._transport.post(`/datasets/${this.id}/index`)) ??
      {}) as Record<string, unknown>;
    return {
      status: String(data["status"] ?? ""),
      message: String(data["message"] ?? ""),
    };
  }

  async indexStatus(): Promise<{
    status: string;
    chunksIndexed: number;
    totalChunks: number;
  }> {
    const data = ((await this._transport.get(`/datasets/${this.id}/index/status`)) ??
      {}) as Record<string, unknown>;
    return {
      status: String(data["status"] ?? "not_indexed"),
      chunksIndexed: Number(data["chunks_indexed"] ?? 0),
      totalChunks: Number(data["total_chunks"] ?? 0),
    };
  }

  toString(): string {
    return `Dataset(id=${this.id}, name=${this.name}, rows=${this.rowCount}, status=${this.status})`;
  }
}
