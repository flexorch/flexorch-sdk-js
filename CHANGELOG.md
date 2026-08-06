# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.2.3] — 2026-08-06

### Added

- `Job.degraded` — `true` when the underlying pipeline execution completed but one or more non-critical steps failed (e.g. structured extraction couldn't find a table in the document). The job still succeeds — PII detection and quality scoring results are still meaningful — but the resulting dataset's records/columns may be empty. Read from the API's `execution_summary.degraded` field; defaults to `false` for jobs with no execution (e.g. `dataset_build`). `wait()` does not throw for a degraded completion.

---

## [0.2.2] — 2026-07-21

### Added

- `ConnectorsResource.create()` — `pgvector_external`, `pinecone`, `qdrant` added to the accepted connector `type` values (vector destinations for dataset indexing `push_only`/`both` modes)

---

## [0.2.1] — 2026-07-21

### Added

- `ConnectorsResource.create()` — `google_drive` added to the accepted connector `type` values (service-account based; requires `folder_id` + `credentials_json` in `config`)

---

## [0.2.0] — 2026-07-05

### Added

**RAG module (`src/rag.ts`)**
- `RAGDocument` — text chunk with `page_content` + `metadata`; duck-type compatible with LangChain `Document` and LlamaIndex `Document` (`.text` alias)
- `FlexOrchRetriever` — LangChain-compatible retriever backed by `/v1/search`; supports `qualityThreshold`, `piiMasked`, `topK`, `mode`, `documentType`, `language` options; implements `getRelevantDocuments` and `agetRelevantDocuments` shims
- `FlexOrchReader` — LlamaIndex-compatible reader backed by `/v1/datasets/{id}/chunks`; auto-paginates, supports `minQuality` and `piiMaskedOnly` filters; returns `RAGDocument[]`

**Dataset model**
- `Dataset.chunks(opts)` — paginated RAG chunk retrieval with typed response (`items`, `total`, `page`, `pageSize`); Pro+ plan required
- `hf` added to `ExportFormat` union and supported format set

**Search**
- `client.search(query, { mode, ... })` — new `mode` option (auto / hybrid / semantic / structured)

**Tests**
- `tests/rag-helpers.test.ts` — FlexOrchRetriever + FlexOrchReader unit tests via vitest

---

## [0.1.0] — 2026-05-24

### Added

- `FlexOrchClient` — main entry point, accepts API key string or options object
  - `process(file, options)` — single file upload and job creation
  - `processMany(files, options)` — batch file upload
  - `processFromS3(connectorId, keys, options)` — import from S3 via connector
  - `search(query, options)` — semantic search across indexed datasets
- `Job` model with `wait({timeout, pollInterval})` polling and `dataset()` fetch
- `Dataset` model with:
  - `export(format)` — download as Buffer (`jsonl | csv | parquet | xlsx`)
  - `exportToS3(connectorId, format, prefix)` — push export to S3
  - `index()` — trigger vector indexing
  - `indexStatus()` — poll index build status
- `Connector` model — cloud storage connector (S3, GCS, Azure Blob)
- `ConnectorsResource` — `create / list / get / delete / test`
- `JobsResource` — `get / list / cancel`
- `DatasetsResource` — `get / list / delete`
- `UsageResource` — current period snapshot
- `WebhooksResource` — `create / list / get / delete`
- Full error hierarchy: `FlexOrchError`, `AuthError`, `QuotaError`, `RateLimitError`,
  `NotFoundError`, `ValidationError`, `ServerError`, `JobFailedError`, `JobTimeoutError`
- `Transport` — native `fetch`-based HTTP layer; zero runtime dependencies
  - FetchFn injection point for testing
  - Automatic retry with exponential backoff (503 / network errors)
  - `getBytes()` for binary responses
- Dual ESM + CJS output via tsup (`dist/index.js`, `dist/index.cjs`, `dist/index.d.ts`)
- 36 vitest tests (client, jobs, resources, S3 + search)
- Examples: `basic-process.ts`, `batch-process.ts`, `s3-import.ts`
- GitHub Actions CI on Node 18 / 20 / 22
