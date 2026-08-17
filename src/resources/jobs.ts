import { Job, type JobFeedback, jobFeedbackFromDict } from "../models/job.js";
import type { Transport } from "../transport.js";

const VALID_RATINGS = new Set(["up", "down"]);
const VALID_ISSUES = new Set([
  "wrong_doc_type", "missing_fields", "wrong_values",
  "pii_missed", "pii_over_masked", "other",
]);

export class JobsResource {
  constructor(private readonly _t: Transport) {}

  async get(jobId: string): Promise<Job> {
    const data = (await this._t.get(`/jobs/${jobId}`)) as Record<string, unknown>;
    return Job.fromDict(data, this._t);
  }

  async list(opts: { page?: number; pageSize?: number } = {}): Promise<Job[]> {
    const params: Record<string, string> = {};
    if (opts.page !== undefined) params["page"] = String(opts.page);
    if (opts.pageSize !== undefined) params["page_size"] = String(opts.pageSize);
    const data = (await this._t.get("/jobs", params)) as Record<string, unknown>;
    const items = (data["items"] as Record<string, unknown>[] | undefined) ?? [];
    return items.map((item) => Job.fromDict(item, this._t));
  }

  /**
   * Submit user feedback for a completed job. Upsert — a second call for the
   * same job replaces the previous feedback.
   *
   * @param rating "up" or "down".
   * @param opts.issue When rating="down": "wrong_doc_type" | "missing_fields" |
   *   "wrong_values" | "pii_missed" | "pii_over_masked" | "other".
   */
  async submitFeedback(
    jobId: string,
    rating: "up" | "down",
    opts: { issue?: string; notes?: string } = {},
  ): Promise<JobFeedback> {
    if (!VALID_RATINGS.has(rating)) {
      throw new Error(`Invalid rating "${rating}". Valid: ${[...VALID_RATINGS].join(", ")}`);
    }
    if (opts.issue !== undefined && !VALID_ISSUES.has(opts.issue)) {
      throw new Error(`Invalid issue "${opts.issue}". Valid: ${[...VALID_ISSUES].join(", ")}`);
    }
    const data = (await this._t.post(`/jobs/${jobId}/feedback`, {
      rating,
      issue: opts.issue ?? null,
      notes: opts.notes ?? null,
    })) as Record<string, unknown>;
    return jobFeedbackFromDict(data);
  }

  /** Existing feedback for a job, or null if none was submitted. */
  async getFeedback(jobId: string): Promise<JobFeedback | null> {
    const data = (await this._t.get(`/jobs/${jobId}/feedback`)) as Record<string, unknown> | null;
    if (!data) return null;
    return jobFeedbackFromDict(data);
  }
}
