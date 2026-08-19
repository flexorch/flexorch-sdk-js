import { JobFailedError, JobTimeoutError } from "../errors.js";
import type { Transport } from "../transport.js";
import type { Dataset } from "./dataset.js";

export interface JobQuality {
  grade: string | null;
  score: number | null;
}

export interface JobFeedback {
  id: string;
  jobId: string;
  rating: string;
  issue: string | null;
  notes: string | null;
  createdAt: string;
}

export function jobFeedbackFromDict(data: Record<string, unknown>): JobFeedback {
  return {
    id: String(data["id"] ?? ""),
    jobId: String(data["job_id"] ?? ""),
    rating: String(data["rating"] ?? ""),
    issue: (data["issue"] as string | null) ?? null,
    notes: (data["notes"] as string | null) ?? null,
    createdAt: String(data["created_at"] ?? ""),
  };
}

export class Job {
  readonly id: string;
  readonly status: string;
  readonly qualityGrade: string | null;
  readonly qualityScore: number | null;
  readonly documentId: string | null;
  /** Needed by buildDataset() — POST /datasets/build-from-execution/{executionId}. */
  readonly executionId: number | null;
  readonly hasDataset: boolean;
  /** Set from `dataset_summary.dataset_id` on a completed dataset_build job's response. */
  readonly datasetId: number | null;
  /**
   * True when the underlying pipeline execution completed but one or more
   * non-critical steps failed (e.g. structured extraction couldn't find a
   * table in the document). The job still succeeds — PII detection and
   * quality scoring results are still meaningful — but `records`/columns
   * may be empty. Read from `execution_summary.degraded`; false for jobs
   * with no execution (e.g. dataset_build). wait() does not throw for a
   * degraded completion.
   */
  readonly degraded: boolean;
  readonly failureReason: string | null;
  private readonly _transport: Transport;

  constructor(data: {
    id: string;
    status: string;
    qualityGrade: string | null;
    qualityScore: number | null;
    documentId: string | null;
    executionId: number | null;
    hasDataset: boolean;
    datasetId: number | null;
    degraded: boolean;
    failureReason: string | null;
    _transport: Transport;
  }) {
    this.id = data.id;
    this.status = data.status;
    this.qualityGrade = data.qualityGrade;
    this.qualityScore = data.qualityScore;
    this.documentId = data.documentId;
    this.executionId = data.executionId;
    this.hasDataset = data.hasDataset;
    this.datasetId = data.datasetId;
    this.degraded = data.degraded;
    this.failureReason = data.failureReason;
    this._transport = data._transport;
  }

  static fromDict(data: Record<string, unknown>, transport: Transport): Job {
    const executionSummary = data["execution_summary"] as Record<string, unknown> | null | undefined;
    const processingSummary = data["processing_summary"] as Record<string, unknown> | null | undefined;
    const datasetSummary = data["dataset_summary"] as Record<string, unknown> | null | undefined;
    let quality = data["quality"] as Record<string, unknown> | undefined;
    if (!quality && processingSummary) {
      quality = processingSummary["quality"] as Record<string, unknown> | undefined;
    }
    quality = quality ?? {};
    const executionId =
      (executionSummary?.["execution_id"] as number | undefined) ??
      (processingSummary?.["execution_id"] as number | undefined) ??
      (data["execution_id"] as number | undefined) ??
      null;
    return new Job({
      id: String(data["job_id"] ?? data["id"] ?? ""),
      status: String(data["status"] ?? ""),
      qualityGrade: (quality["grade"] as string | null) ?? null,
      qualityScore: (quality["score"] as number | null) ?? null,
      documentId: (data["document_id"] as string | null) ?? null,
      executionId,
      // dataset_summary is only present on a completed dataset_build job's
      // response — neither has_dataset nor processing_summary is ever set
      // for that job type, so without this .dataset() always returned null
      // for the job.buildDataset().wait().dataset() chain even though the
      // dataset had been built successfully.
      hasDataset: Boolean(data["has_dataset"] ?? processingSummary?.["has_dataset"] ?? Boolean(datasetSummary) ?? false),
      datasetId: (datasetSummary?.["dataset_id"] as number | undefined) ?? null,
      degraded: Boolean(executionSummary?.["degraded"] ?? false),
      failureReason: (data["failure_reason"] as string | null) ?? null,
      _transport: transport,
    });
  }

  async wait(opts: { timeout?: number; pollInterval?: number } = {}): Promise<Job> {
    const timeout = opts.timeout ?? 300;
    const pollInterval = opts.pollInterval ?? 2;
    const deadline = Date.now() + timeout * 1000;

    if (this.status === "completed" || this.status === "failed") {
      if (this.status === "failed") {
        throw new JobFailedError(this.id, this.failureReason ?? "unknown");
      }
      return this;
    }

    while (Date.now() < deadline) {
      await sleep(pollInterval * 1000);
      const data = (await this._transport.get(`/jobs/${this.id}`)) as Record<string, unknown>;
      const updated = Job.fromDict(data, this._transport);
      if (updated.status === "completed") return updated;
      if (updated.status === "failed") {
        throw new JobFailedError(updated.id, updated.failureReason ?? "unknown");
      }
    }
    throw new JobTimeoutError(this.id, timeout);
  }

  async dataset(): Promise<Dataset | null> {
    const { Dataset } = await import("./dataset.js");

    if (this.datasetId !== null) {
      const data = (await this._transport.get(`/datasets/${this.datasetId}`)) as Record<string, unknown>;
      return Dataset.fromDict(data, this._transport);
    }

    if (!this.hasDataset) return null;
    const data = (await this._transport.get("/datasets", {
      job_id: this.id,
    })) as Record<string, unknown>;
    const items = (data["items"] as Record<string, unknown>[] | undefined) ?? [];
    if (items.length === 0) return null;
    return Dataset.fromDict(items[0]!, this._transport);
  }

  /**
   * Build a dataset from this job's execution.
   *
   * A completed data_process job does not have a dataset yet — building one
   * is a separate, explicit step (`POST
   * /datasets/build-from-execution/{executionId}`). Call this after
   * `.wait()`, then `.wait()` again on the returned dataset_build Job before
   * calling `.dataset()`:
   *
   * ```ts
   * const job = await client.process("invoice.pdf");
   * const done = await job.wait();
   * const dataset = await (await done.buildDataset()).wait().then(j => j.dataset());
   * ```
   *
   * @throws {Error} If this job has no executionId to build a dataset from
   *   (e.g. it failed, or is itself a dataset_build job).
   */
  async buildDataset(opts: {
    name?: string;
    description?: string;
    slug?: string;
    forceRebuild?: boolean;
    replaceExisting?: boolean;
  } = {}): Promise<Job> {
    if (!this.executionId) {
      throw new Error(
        `Job ${this.id} has no executionId to build a dataset from (job must be a completed data_process job).`,
      );
    }
    const body: Record<string, unknown> = {
      force_rebuild: opts.forceRebuild ?? false,
      replace_existing: opts.replaceExisting ?? false,
    };
    if (opts.name !== undefined) body["name"] = opts.name;
    if (opts.description !== undefined) body["description"] = opts.description;
    if (opts.slug !== undefined) body["slug"] = opts.slug;
    const data = (await this._transport.post(
      `/datasets/build-from-execution/${this.executionId}`,
      body,
    )) as Record<string, unknown>;
    return Job.fromDict(data, this._transport);
  }

  toString(): string {
    return `Job(id=${this.id}, status=${this.status}, grade=${this.qualityGrade})`;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
