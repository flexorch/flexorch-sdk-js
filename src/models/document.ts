import type { Transport } from "../transport.js";
import { Job } from "./job.js";

export class Document {
  readonly id: string;
  readonly filename: string;
  readonly fileExt: string;
  readonly status: string;
  readonly storagePath: string;
  readonly createdAt: string;
  readonly processingCount: number;
  readonly latestExecution: Record<string, unknown> | null;
  readonly dataset: Record<string, unknown> | null;
  readonly processingHistory: Record<string, unknown>[];
  readonly relatedDatasets: Record<string, unknown>[];
  private readonly _transport: Transport;

  constructor(data: {
    id: string;
    filename: string;
    fileExt: string;
    status: string;
    storagePath: string;
    createdAt: string;
    processingCount: number;
    latestExecution: Record<string, unknown> | null;
    dataset: Record<string, unknown> | null;
    processingHistory: Record<string, unknown>[];
    relatedDatasets: Record<string, unknown>[];
    _transport: Transport;
  }) {
    this.id = data.id;
    this.filename = data.filename;
    this.fileExt = data.fileExt;
    this.status = data.status;
    this.storagePath = data.storagePath;
    this.createdAt = data.createdAt;
    this.processingCount = data.processingCount;
    this.latestExecution = data.latestExecution;
    this.dataset = data.dataset;
    this.processingHistory = data.processingHistory;
    this.relatedDatasets = data.relatedDatasets;
    this._transport = data._transport;
  }

  static fromDict(data: Record<string, unknown>, transport: Transport): Document {
    return new Document({
      id: String(data["id"] ?? ""),
      filename: String(data["filename"] ?? ""),
      fileExt: String(data["file_ext"] ?? ""),
      status: String(data["status"] ?? ""),
      storagePath: String(data["storage_path"] ?? ""),
      createdAt: String(data["created_at"] ?? ""),
      processingCount: Number(data["processing_count"] ?? 0),
      latestExecution: (data["latest_execution"] as Record<string, unknown> | null) ?? null,
      dataset: (data["dataset"] as Record<string, unknown> | null) ?? null,
      processingHistory: (data["processing_history"] as Record<string, unknown>[] | undefined) ?? [],
      relatedDatasets: (data["related_datasets"] as Record<string, unknown>[] | undefined) ?? [],
      _transport: transport,
    });
  }

  /**
   * Re-queue this document through the processing pipeline.
   *
   * Raises (via the API): 400 DOCUMENT_FILE_NOT_AVAILABLE if the source file
   * is no longer on disk, or 400 REPROCESS_NOT_SUPPORTED for
   * connector-sourced (e.g. S3) documents.
   */
  async reprocess(pipelineConfig?: Record<string, unknown>): Promise<Job> {
    const body: Record<string, unknown> = {};
    if (pipelineConfig) body["pipeline_config"] = pipelineConfig;
    const data = (await this._transport.post(`/documents/${this.id}/reprocess`, body)) as Record<
      string,
      unknown
    >;
    return Job.fromDict(data, this._transport);
  }

  toString(): string {
    return `Document(id=${this.id}, filename=${this.filename}, status=${this.status})`;
  }
}
