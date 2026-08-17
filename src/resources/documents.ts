import { Document } from "../models/document.js";
import type { Transport } from "../transport.js";

export class DocumentsResource {
  constructor(private readonly _t: Transport) {}

  /** Fetch a single document, including processingHistory and relatedDatasets. */
  async get(documentId: string): Promise<Document> {
    const data = (await this._t.get(`/documents/${documentId}`)) as Record<string, unknown>;
    return Document.fromDict(data, this._t);
  }

  /** List documents for the current tenant, newest first. */
  async list(opts: { page?: number; pageSize?: number } = {}): Promise<Document[]> {
    const params: Record<string, string> = {};
    if (opts.page !== undefined) params["page"] = String(opts.page);
    if (opts.pageSize !== undefined) params["page_size"] = String(opts.pageSize);
    const data = (await this._t.get("/documents", params)) as Record<string, unknown>;
    const items = (data["items"] as Record<string, unknown>[] | undefined) ?? [];
    return items.map((item) => Document.fromDict(item, this._t));
  }
}
