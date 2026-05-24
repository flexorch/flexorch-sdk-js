# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
