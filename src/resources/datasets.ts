import { Dataset } from "../models/dataset.js";
import { Job } from "../models/job.js";
import type { Transport } from "../transport.js";

export class DatasetsResource {
  constructor(private readonly _t: Transport) {}

  async get(datasetId: string): Promise<Dataset> {
    const data = (await this._t.get(`/datasets/${datasetId}`)) as Record<string, unknown>;
    return Dataset.fromDict(data, this._t);
  }

  async list(opts: {
    page?: number;
    pageSize?: number;
    status?: string;
    sourceExecutionId?: number;
    sourceDocumentId?: number;
    q?: string;
  } = {}): Promise<Dataset[]> {
    const params: Record<string, string> = {};
    if (opts.page !== undefined) params["page"] = String(opts.page);
    if (opts.pageSize !== undefined) params["page_size"] = String(opts.pageSize);
    if (opts.status !== undefined) params["status"] = opts.status;
    if (opts.sourceExecutionId !== undefined) params["source_execution_id"] = String(opts.sourceExecutionId);
    if (opts.sourceDocumentId !== undefined) params["source_document_id"] = String(opts.sourceDocumentId);
    if (opts.q !== undefined) params["q"] = opts.q;
    const data = (await this._t.get("/datasets", params)) as Record<string, unknown>;
    const items = (data["items"] as Record<string, unknown>[] | undefined) ?? [];
    return items.map((item) => Dataset.fromDict(item, this._t));
  }

  /**
   * Build a dataset from a completed execution.
   *
   * Prefer `Job.buildDataset()` when you already have a Job object — this is
   * the lower-level call for when you only have an executionId (e.g. from
   * `Document.latestExecution`).
   *
   * @returns A dataset_build Job — call `.wait()` then `.dataset()`.
   */
  async buildFromExecution(
    executionId: number,
    opts: {
      name?: string;
      description?: string;
      slug?: string;
      forceRebuild?: boolean;
      replaceExisting?: boolean;
    } = {},
  ): Promise<Job> {
    const body: Record<string, unknown> = {
      force_rebuild: opts.forceRebuild ?? false,
      replace_existing: opts.replaceExisting ?? false,
    };
    if (opts.name !== undefined) body["name"] = opts.name;
    if (opts.description !== undefined) body["description"] = opts.description;
    if (opts.slug !== undefined) body["slug"] = opts.slug;
    const data = (await this._t.post(
      `/datasets/build-from-execution/${executionId}`,
      body,
    )) as Record<string, unknown>;
    return Job.fromDict(data, this._t);
  }
}
