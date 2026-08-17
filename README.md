# flexorch-sdk

[![npm version](https://img.shields.io/npm/v/flexorch-sdk)](https://www.npmjs.com/package/flexorch-sdk)
[![CI](https://github.com/flexorch/flexorch-sdk-js/actions/workflows/ci.yml/badge.svg)](https://github.com/flexorch/flexorch-sdk-js/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node >=18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

TypeScript/JavaScript SDK for the [FlexOrch](https://flexorch.com) API.  
Turn unstructured documents (PDF, DOCX, TXT, …) into LLM-ready structured datasets.

**Zero runtime dependencies** — uses native `fetch` and `FormData`.

---

## Install

```bash
npm install flexorch-sdk
```

---

## Quick start

```typescript
import { FlexOrchClient } from "flexorch-sdk";
import * as fs from "node:fs/promises";

const client = new FlexOrchClient(process.env.FLEXORCH_API_KEY);

const job = await client.process("contract.pdf", { locale: "tr" });
const done = await job.wait();

console.log(`Grade: ${done.qualityGrade}  Score: ${done.qualityScore}`);

// Building a dataset is a separate, explicit step — a completed job doesn't
// have one until you build it (lets you build one dataset from several jobs,
// or re-run with forceRebuild: true).
const built = await done.buildDataset();
const dataset = await (await built.wait()).dataset();
if (dataset) {
  const bytes = await dataset.export("jsonl");
  await fs.writeFile("output.jsonl", bytes);
  console.log(`${dataset.rowCount} rows → output.jsonl`);
}
```

The API key is read from `FLEXORCH_API_KEY` if not passed explicitly.

---

## Input formats

| Format | Extension |
|--------|-----------|
| PDF | `.pdf` |
| Word | `.docx` |
| Plain text | `.txt` |
| Markdown | `.md` |
| Spreadsheets | `.xlsx` |
| Email | `.eml`, `.msg` |
| Images (OCR) | `.jpg`, `.png`, `.tiff` |
| Web | `.html`, `.htm` |

---

## Export formats

`"json"` · `"jsonl"` · `"csv"` · `"parquet"` · `"md"` · `"xml"` · `"xlsx"` · `"rag"` · `"hf"`

```typescript
const bytes = await dataset.export("jsonl");
await fs.writeFile("output.jsonl", bytes);

// rag chunks, only A/B-grade
const chunks = await dataset.export("rag", { minQuality: "B" });
```

The `"rag"` format produces LlamaIndex/LangChain-compatible chunks with metadata.
The `"hf"` format is a zip archive readable with `datasets.load_from_disk()`.

---

## API reference

### `new FlexOrchClient(apiKeyOrOptions?)`

```typescript
const client = new FlexOrchClient("dfx_...");
// or
const client = new FlexOrchClient({
  apiKey: "dfx_...",
  baseUrl: "https://api.flexorch.com/v1",  // default
  timeout: 30,                              // seconds, default 30
  maxRetries: 3,                            // default 3
});
```

### `client.process(file, options?)`

Upload a single file and create a processing job.

```typescript
const job = await client.process("invoice.pdf", {
  locale: "tr",          // BCP-47 locale hint; "und" = all PII detectors (default)
  pipelineConfig: {},    // optional pipeline overrides
});
```

Returns a `Job` instance.

### `client.processMany(files, options?)`

Batch-process multiple files sequentially. Returns `Job[]`.

```typescript
const jobs = await client.processMany(["a.pdf", "b.pdf"], { locale: "en" });
```

### `client.processFromS3(connectorId, keys, options?)`

Import files from a registered S3 connector. Returns `Job[]`.

```typescript
const jobs = await client.processFromS3(conn.id, ["folder/doc.pdf"], { locale: "de" });
```

### `client.search(query, options?)`

Semantic search across all indexed datasets (Pro+ plan required).

```typescript
const results = await client.search("net payment terms", {
  topK: 5,
  mode: "auto",  // "auto" | "semantic" | "hybrid" | "structured"
  filters: { documentType: "invoice", language: "de", qualityGrade: "A", piiMasked: true },
});
for (const r of results) {
  console.log(r.score, r.datasetId, r.text);
}
```

---

### `Job`

| Method | Description |
|--------|-------------|
| `job.wait(options?)` | Poll until done. Resolves with a completed `Job`. |
| `job.dataset()` | Fetch the dataset built from this job (`null` if none built yet). |
| `job.buildDataset(options?)` | Build a dataset from this job's execution. Returns a `dataset_build` `Job` — `wait()` it, then call `.dataset()`. |

`wait` options: `{ timeout?: number (seconds), pollInterval?: number (seconds) }`

`buildDataset` options: `{ name?, description?, slug?, forceRebuild?: boolean, replaceExisting?: boolean }`. Throws if the job has no `executionId` (e.g. it failed, or is itself a `dataset_build` job).

Throws `JobFailedError` if the job fails, `JobTimeoutError` if timeout is exceeded.

Key properties: `id`, `status`, `qualityGrade`, `qualityScore`, `documentId`, `executionId`, `hasDataset`, `degraded`, `failureReason`.

`degraded` is `true` when the underlying pipeline execution completed but one or more non-critical steps failed (e.g. structured extraction couldn't find a table in the document). The job still succeeds — PII detection and quality scoring results are still meaningful — but the resulting dataset's records/columns may be empty. `wait()` does not throw for a degraded completion.

---

### `Dataset`

| Method | Description |
|--------|-------------|
| `dataset.export(format, options?)` | Download dataset as `Uint8Array`. `options.minQuality` only applies to `format="rag"`. |
| `dataset.exportToS3(connectorId, format, prefix?)` | Push export directly to S3. |
| `dataset.rows(options?)` | Preview rows — `{ page?, pageSize?, q? }`. |
| `dataset.profile()` | Quality/privacy profile (grade distribution, PII findings). |
| `dataset.complianceReport(format?)` | KVKK/GDPR transparency report (Pro+ required). `"json"` (default) or `"pdf"`. |
| `dataset.index()` | Trigger semantic indexing (Pro+ required). |
| `dataset.indexStatus()` | Poll index build status. |
| `dataset.chunks(options?)` | List RAG chunks (Pro+ required). |

Key properties: `id`, `name`, `slug`, `status`, `rowCount`, `createdAt`, `availableFormats`.

---

### `client.documents`

```typescript
await client.documents.list({ page: 1, pageSize: 20 });
const doc = await client.documents.get(id);  // includes processingHistory, relatedDatasets
const job = await doc.reprocess();           // re-queue through the pipeline
```

---

### `client.connectors`

```typescript
const conn = await client.connectors.create("Prod S3", "s3", {
  bucket: "my-bucket",
  region: "eu-central-1",
  accessKeyId: "...",
  secretAccessKey: "...",
});

const result = await client.connectors.test(conn.id);
// { success: true, latencyMs: 42, message: "OK" }

await client.connectors.list();
await client.connectors.get(id);
await client.connectors.delete(id);
```

Connector types: `"s3"` · `"gcs"` · `"azure_blob"` · `"google_drive"` (file sources) and `"pgvector_external"` · `"pinecone"` · `"qdrant"` (vector destinations for dataset indexing).

#### Scheduled sync (Pro+)

```typescript
const schedule = await client.connectors.createSchedule(conn.id, "0 2 * * *", "invoices/");
await client.connectors.listSchedules(conn.id);
await client.connectors.triggerSchedule(conn.id, schedule.id);  // run now
await client.connectors.scheduleLogs(conn.id, schedule.id);
await client.connectors.deleteSchedule(conn.id, schedule.id);
```

---

### `client.jobs` / `client.datasets` / `client.usage` / `client.webhooks`

```typescript
await client.jobs.list({ page: 1, pageSize: 20 });
await client.jobs.get(id);
await client.jobs.submitFeedback(id, "down", { issue: "missing_fields", notes: "PO number not extracted" });
await client.jobs.getFeedback(id);  // null if not submitted

await client.datasets.list();
await client.datasets.get(id);
await client.datasets.buildFromExecution(executionId, { name: "my-dataset" });  // prefer job.buildDataset() if you have a Job

const usage = await client.usage.current();
console.log(`${usage.creditsUsed} / ${usage.creditsLimit} credits used (plan: ${usage.plan})`);
if (usage.isTrial) console.log(`${usage.trialDaysRemaining} trial days left`);

await client.usage.history("30d");       // daily credits + job counts
await client.usage.qualityTrend("30d");  // daily avg quality score
await client.usage.rateLimits();         // current window usage, doesn't consume a slot

await client.webhooks.register("https://example.com/hook", ["dataset.ready"]);
await client.webhooks.list();
await client.webhooks.delete(id);
```

---

## Error handling

```typescript
import {
  FlexOrchError,
  AuthError,
  QuotaError,
  RateLimitError,
  NotFoundError,
  ValidationError,
  ServerError,
  JobFailedError,
  JobTimeoutError,
} from "flexorch-sdk";

try {
  const done = await job.wait({ timeout: 120 });
} catch (err) {
  if (err instanceof JobFailedError) {
    console.error(`Job ${err.jobId} failed: ${err.failureReason}`);
  } else if (err instanceof QuotaError) {
    console.error("Credit limit reached or trial expired");
  } else if (err instanceof RateLimitError) {
    console.error(`Rate limited — retry after ${err.retryAfter}s`);
  } else {
    throw err;
  }
}
```

All SDK errors extend `FlexOrchError`. HTTP 4xx/5xx responses map to typed error classes automatically. `429`/`5xx` are retried with exponential backoff (up to `maxRetries` attempts).

---

## Configuration

| Option | Env var | Default |
|--------|---------|---------|
| `apiKey` | `FLEXORCH_API_KEY` | — |
| `baseUrl` | — | `https://api.flexorch.com/v1` |
| `timeout` | — | `30` seconds |
| `maxRetries` | — | `3` |

---

## Examples

| File | Description |
|------|-------------|
| [basic-process.ts](examples/basic-process.ts) | Process a single PDF, build a dataset, export JSONL |
| [batch-process.ts](examples/batch-process.ts) | Process a directory, collect datasets |
| [s3-import.ts](examples/s3-import.ts) | Register S3 connector, import, export back |

---

## Development

```bash
npm install
npm run build     # ESM + CJS + .d.ts
npm test          # vitest
npm run typecheck # tsc --noEmit
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

---

## License

[MIT](LICENSE) — Flexorch Technology 2026
