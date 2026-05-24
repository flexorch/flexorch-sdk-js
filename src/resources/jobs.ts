import { Job } from "../models/job.js";
import type { Transport } from "../transport.js";

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
}
