import { Dataset } from "../models/dataset.js";
import type { Transport } from "../transport.js";

export class DatasetsResource {
  constructor(private readonly _t: Transport) {}

  async get(datasetId: string): Promise<Dataset> {
    const data = (await this._t.get(`/datasets/${datasetId}`)) as Record<string, unknown>;
    return Dataset.fromDict(data, this._t);
  }

  async list(opts: { page?: number; pageSize?: number } = {}): Promise<Dataset[]> {
    const params: Record<string, string> = {};
    if (opts.page !== undefined) params["page"] = String(opts.page);
    if (opts.pageSize !== undefined) params["page_size"] = String(opts.pageSize);
    const data = (await this._t.get("/datasets", params)) as Record<string, unknown>;
    const items = (data["items"] as Record<string, unknown>[] | undefined) ?? [];
    return items.map((item) => Dataset.fromDict(item, this._t));
  }
}
