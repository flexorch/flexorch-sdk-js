import { JobFailedError, JobTimeoutError } from "../errors.js";
import type { Transport } from "../transport.js";
import type { Dataset } from "./dataset.js";

export interface JobQuality {
  grade: string | null;
  score: number | null;
}

export class Job {
  readonly id: string;
  readonly status: string;
  readonly qualityGrade: string | null;
  readonly qualityScore: number | null;
  readonly documentId: string | null;
  readonly hasDataset: boolean;
  readonly failureReason: string | null;
  private readonly _transport: Transport;

  constructor(data: {
    id: string;
    status: string;
    qualityGrade: string | null;
    qualityScore: number | null;
    documentId: string | null;
    hasDataset: boolean;
    failureReason: string | null;
    _transport: Transport;
  }) {
    this.id = data.id;
    this.status = data.status;
    this.qualityGrade = data.qualityGrade;
    this.qualityScore = data.qualityScore;
    this.documentId = data.documentId;
    this.hasDataset = data.hasDataset;
    this.failureReason = data.failureReason;
    this._transport = data._transport;
  }

  static fromDict(data: Record<string, unknown>, transport: Transport): Job {
    const quality = (data["quality"] as Record<string, unknown> | undefined) ?? {};
    return new Job({
      id: String(data["job_id"] ?? data["id"] ?? ""),
      status: String(data["status"] ?? ""),
      qualityGrade: (quality["grade"] as string | null) ?? null,
      qualityScore: (quality["score"] as number | null) ?? null,
      documentId: (data["document_id"] as string | null) ?? null,
      hasDataset: Boolean(data["has_dataset"] ?? false),
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
    if (!this.hasDataset) return null;
    const data = (await this._transport.get("/datasets", {
      job_id: this.id,
    })) as Record<string, unknown>;
    const items = (data["items"] as Record<string, unknown>[] | undefined) ?? [];
    if (items.length === 0) return null;
    const { Dataset } = await import("./dataset.js");
    return Dataset.fromDict(items[0]!, this._transport);
  }

  toString(): string {
    return `Job(id=${this.id}, status=${this.status}, grade=${this.qualityGrade})`;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
