/**
 * RAG helpers for the FlexOrch SDK.
 *
 * FlexOrchRetriever  — LangChain-compatible retriever backed by /v1/search.
 * FlexOrchReader     — LlamaIndex-compatible reader backed by /v1/datasets/{id}/chunks.
 *
 * Both classes work without LangChain or LlamaIndex installed.
 * RAGDocument is duck-type compatible with:
 *   - langchain_core.documents.Document  (pageContent + metadata)
 *   - llama_index.core.schema.Document   (.text + metadata)
 */

import type { FlexOrchClient } from "./client.js";
import type { SearchFilters } from "./models/search.js";

const GRADE_ORDER: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };

function gradeAndAbove(threshold: string): string[] {
  const t = GRADE_ORDER[threshold.toUpperCase()] ?? 3;
  return Object.entries(GRADE_ORDER)
    .filter(([, rank]) => rank <= t)
    .map(([g]) => g);
}

// ─── RAGDocument ─────────────────────────────────────────────────────────────

export class RAGDocument {
  /** Chunk text — LangChain-style attribute name. */
  readonly pageContent: string;
  readonly metadata: Record<string, unknown>;

  constructor(pageContent: string, metadata: Record<string, unknown> = {}) {
    this.pageContent = pageContent;
    this.metadata = metadata;
  }

  /** LlamaIndex-style alias for pageContent. */
  get text(): string {
    return this.pageContent;
  }

  toString(): string {
    const snippet = this.pageContent.slice(0, 60).replace(/\n/g, " ");
    return `RAGDocument(text="${snippet}", metadata=${JSON.stringify(this.metadata)})`;
  }
}

// ─── FlexOrchRetriever ───────────────────────────────────────────────────────

export interface RetrieverOptions {
  /** Minimum quality grade to return (A/B/C/D). Default: "B". */
  qualityThreshold?: string;
  /** When set, only include chunks where PII was (true) or wasn't (false) masked. */
  piiMasked?: boolean;
  /** Number of results to return. Default: 5. */
  topK?: number;
  /** Filter by document type (e.g. "invoice"). */
  documentType?: string;
  /** Filter by language code (e.g. "en", "tr"). */
  language?: string;
  /** Search mode: "auto" | "semantic" | "hybrid" | "structured". Default: "auto". */
  mode?: string;
}

export class FlexOrchRetriever {
  private readonly _client: FlexOrchClient;
  private readonly _qualityThreshold: string;
  private readonly _piiMasked: boolean | undefined;
  private readonly _topK: number;
  private readonly _documentType: string | undefined;
  private readonly _language: string | undefined;
  private readonly _mode: string;

  /**
   * LangChain-compatible retriever backed by FlexOrch's /v1/search endpoint.
   *
   * Works without LangChain installed — invoke() returns RAGDocument objects
   * that are duck-type compatible with langchain_core.documents.Document.
   *
   * @example
   * ```ts
   * const client = new FlexOrchClient("dfx_xxx");
   * const retriever = new FlexOrchRetriever(client, { qualityThreshold: "B", piiMasked: true });
   *
   * // standalone
   * const docs = await retriever.invoke("payment terms");
   *
   * // LangChain chain (TypeScript)
   * import { RetrievalQAChain } from "langchain/chains";
   * const chain = RetrievalQAChain.fromLLM(llm, retriever);
   * ```
   */
  constructor(client: FlexOrchClient, opts: RetrieverOptions = {}) {
    const threshold = (opts.qualityThreshold ?? "B").toUpperCase();
    if (!(threshold in GRADE_ORDER)) {
      throw new Error(`qualityThreshold must be A, B, C, or D — got "${opts.qualityThreshold}"`);
    }
    this._client = client;
    this._qualityThreshold = threshold;
    this._piiMasked = opts.piiMasked;
    this._topK = opts.topK ?? 5;
    this._documentType = opts.documentType;
    this._language = opts.language;
    this._mode = opts.mode ?? "auto";
  }

  /**
   * Retrieve the most relevant chunks for a query.
   *
   * Requests 2× topK results from the API then filters client-side by quality
   * threshold, returning at most topK final documents.
   */
  async invoke(query: string): Promise<RAGDocument[]> {
    const filters: SearchFilters = {};
    if (this._piiMasked !== undefined) filters.piiMasked = this._piiMasked;
    if (this._documentType) filters.documentType = this._documentType;
    if (this._language) filters.language = this._language;

    const raw = await this._client.search(query, {
      topK: Math.min(this._topK * 2, 50),
      mode: this._mode,
      filters: Object.keys(filters).length > 0 ? filters : undefined,
    });

    const allowedGrades = new Set(gradeAndAbove(this._qualityThreshold));
    const docs: RAGDocument[] = [];

    for (const r of raw) {
      const grade = String(r.metadata["quality_grade"] ?? "D");
      if (!allowedGrades.has(grade)) continue;
      docs.push(
        new RAGDocument(r.text, {
          chunkId: r.chunkId,
          datasetId: r.datasetId,
          score: r.score,
          qualityGrade: grade,
          piiMasked: r.metadata["pii_masked"],
          docType: r.metadata["doc_type"],
          language: r.metadata["language"],
        }),
      );
      if (docs.length >= this._topK) break;
    }
    return docs;
  }

  /** LangChain BaseRetriever compatibility shim. */
  async getRelevantDocuments(query: string): Promise<RAGDocument[]> {
    return this.invoke(query);
  }

  toString(): string {
    return `FlexOrchRetriever(qualityThreshold="${this._qualityThreshold}", topK=${this._topK}, mode="${this._mode}")`;
  }
}

// ─── FlexOrchReader ──────────────────────────────────────────────────────────

export interface ReaderLoadOptions {
  /** Minimum quality grade to include (A/B/C/D). Default: "B". */
  minQuality?: string;
  /** When true, include only chunks where PII was masked. Default: false. */
  piiMaskedOnly?: boolean;
  /** Chunks per page (max 100). Default: 100. */
  pageSize?: number;
}

export class FlexOrchReader {
  private readonly _client: FlexOrchClient;

  /**
   * LlamaIndex-compatible reader backed by FlexOrch's chunk API.
   *
   * Paginates through all RAG chunks of a processed, indexed dataset.
   * Returns RAGDocument objects duck-type compatible with llama_index Document.
   *
   * @example
   * ```ts
   * const reader = new FlexOrchReader(new FlexOrchClient("dfx_xxx"));
   * const docs = await reader.loadData("42", { minQuality: "B" });
   * ```
   */
  constructor(client: FlexOrchClient) {
    this._client = client;
  }

  /**
   * Load all qualifying chunks from a dataset, paginating automatically.
   *
   * @param datasetId  ID of the indexed dataset.
   * @param opts       Filtering and pagination options.
   */
  async loadData(
    datasetId: string | number,
    opts: ReaderLoadOptions = {},
  ): Promise<RAGDocument[]> {
    const minQuality = (opts.minQuality ?? "B").toUpperCase();
    if (!(minQuality in GRADE_ORDER)) {
      throw new Error(`minQuality must be A, B, C, or D — got "${opts.minQuality}"`);
    }

    const gradeFilter = gradeAndAbove(minQuality).join(",");
    const pageSize = opts.pageSize ?? 100;
    const allDocs: RAGDocument[] = [];
    let page = 1;

    while (true) {
      const params: Record<string, string> = {
        page: String(page),
        page_size: String(pageSize),
        quality_grade: gradeFilter,
      };
      if (opts.piiMaskedOnly) params["pii_masked"] = "true";

      const data = (
        (await (this._client as unknown as { _transport: { get: (url: string, params?: Record<string, string>) => Promise<unknown> } })
          ._transport.get(`/datasets/${datasetId}/chunks`, params)) ?? {}
      ) as Record<string, unknown>;

      const items = (data["items"] as Record<string, unknown>[] | undefined) ?? [];
      const total = Number(data["total"] ?? 0);

      for (const item of items) {
        const meta = (item["metadata"] as Record<string, unknown> | undefined) ?? {};
        allDocs.push(
          new RAGDocument(String(item["text"] ?? ""), {
            chunkId: item["chunk_id"],
            chunkIndex: item["chunk_index"],
            datasetId: String(datasetId),
            docType: meta["doc_type"],
            language: meta["language"],
            qualityGrade: meta["quality_grade"],
            qualityScore: meta["quality_score"],
            piiMasked: meta["pii_masked"],
            source: meta["source_filename"],
          }),
        );
      }

      if (allDocs.length >= total || items.length < pageSize) break;
      page++;
    }

    return allDocs;
  }

  toString(): string {
    return "FlexOrchReader()";
  }
}
