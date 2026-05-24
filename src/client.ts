import { Transport, type FetchFn } from "./transport.js";
import { Job } from "./models/job.js";
import { SearchResult, type SearchFilters } from "./models/search.js";
import { JobsResource } from "./resources/jobs.js";
import { DatasetsResource } from "./resources/datasets.js";
import { UsageResource } from "./resources/usage.js";
import { WebhooksResource } from "./resources/webhooks.js";
import { ConnectorsResource } from "./resources/connectors.js";

const DEFAULT_BASE_URL = "https://api.flexorch.com/v1";

export interface FlexOrchClientOptions {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  /** @internal — override fetch for testing */
  _fetch?: FetchFn;
}

export class FlexOrchClient {
  readonly jobs: JobsResource;
  readonly datasets: DatasetsResource;
  readonly usage: UsageResource;
  readonly webhooks: WebhooksResource;
  readonly connectors: ConnectorsResource;

  private readonly _transport: Transport;

  constructor(apiKeyOrOptions: string | FlexOrchClientOptions = {}) {
    const opts: FlexOrchClientOptions =
      typeof apiKeyOrOptions === "string" ? { apiKey: apiKeyOrOptions } : apiKeyOrOptions;

    const apiKey = opts.apiKey ?? process.env["FLEXORCH_API_KEY"] ?? "";
    if (!apiKey) {
      throw new Error(
        "No API key provided. Pass apiKey or set the FLEXORCH_API_KEY environment variable.",
      );
    }

    this._transport = new Transport(
      apiKey,
      opts.baseUrl ?? DEFAULT_BASE_URL,
      opts.timeout ?? 30,
      opts.maxRetries ?? 3,
      opts._fetch,
    );

    this.jobs = new JobsResource(this._transport);
    this.datasets = new DatasetsResource(this._transport);
    this.usage = new UsageResource(this._transport);
    this.webhooks = new WebhooksResource(this._transport);
    this.connectors = new ConnectorsResource(this._transport);
  }

  async process(
    filePath: string,
    opts: {
      locale?: string;
      pipelineConfig?: Record<string, unknown>;
    } = {},
  ): Promise<Job> {
    const { createReadStream, statSync } = await import("node:fs");
    const { basename } = await import("node:path");

    if (!statSync(filePath, { throwIfNoEntry: false })) {
      throw new Error(`File not found: ${filePath}`);
    }

    const form = new FormData();
    const stream = createReadStream(filePath);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
    }
    const blob = new Blob([Buffer.concat(chunks)], { type: "application/octet-stream" });
    form.append("file", blob, basename(filePath));
    form.append("locale", opts.locale ?? "und");
    if (opts.pipelineConfig) {
      form.append("pipeline_config", JSON.stringify(opts.pipelineConfig));
    }

    const data = (await this._transport.postForm("/data-process/async", form)) as Record<
      string,
      unknown
    >;
    return Job.fromDict(data, this._transport);
  }

  async processMany(
    filePaths: string[],
    opts: { locale?: string } = {},
  ): Promise<Job[]> {
    const jobs: Job[] = [];
    for (const fp of filePaths) {
      jobs.push(await this.process(fp, opts));
    }
    return jobs;
  }

  async processFromS3(
    connectorId: string,
    keys: string[],
    opts: { locale?: string; pipelineConfig?: Record<string, unknown> } = {},
  ): Promise<Job[]> {
    const jobs: Job[] = [];
    for (const key of keys) {
      const form = new FormData();
      form.append("locale", opts.locale ?? "und");
      form.append("source", JSON.stringify({ connector_id: connectorId, keys: [key] }));
      if (opts.pipelineConfig) {
        form.append("pipeline_config", JSON.stringify(opts.pipelineConfig));
      }
      const data = (await this._transport.postForm("/data-process/async", form)) as Record<
        string,
        unknown
      >;
      jobs.push(Job.fromDict(data, this._transport));
    }
    return jobs;
  }

  async search(
    query: string,
    opts: { topK?: number; filters?: SearchFilters } = {},
  ): Promise<SearchResult[]> {
    const body: Record<string, unknown> = {
      query,
      top_k: opts.topK ?? 10,
    };
    if (opts.filters) {
      const f = opts.filters;
      const mapped: Record<string, unknown> = {};
      if (f.documentType !== undefined) mapped["document_type"] = f.documentType;
      if (f.language !== undefined) mapped["language"] = f.language;
      if (f.piiMasked !== undefined) mapped["pii_masked"] = f.piiMasked;
      if (f.qualityGrade !== undefined) mapped["quality_grade"] = f.qualityGrade;
      body["filters"] = mapped;
    }
    const data = ((await this._transport.post("/search", body)) ?? {}) as Record<string, unknown>;
    const results = (data["results"] as Record<string, unknown>[] | undefined) ?? [];
    return results.map(SearchResult.fromDict);
  }

  toString(): string {
    return `FlexOrchClient(baseUrl=${DEFAULT_BASE_URL})`;
  }
}
