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

const client = new FlexOrchClient(process.env.FLEXORCH_API_KEY);

const job = await client.process("contract.pdf", { locale: "tr" });
const done = await job.wait();

console.log(`Grade: ${done.qualityGrade}  Score: ${done.qualityScore}`);

const dataset = await done.dataset();
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

---

## Export formats

| Format | Value |
|--------|-------|
| JSON Lines | `"jsonl"` |
| CSV | `"csv"` |
| Parquet | `"parquet"` |
| Excel | `"xlsx"` |

---

## API reference

### `new FlexOrchClient(apiKeyOrOptions?)`

```typescript
const client = new FlexOrchClient("sk-...");
// or
const client = new FlexOrchClient({
  apiKey: "sk-...",
  baseUrl: "https://api.flexorch.com",  // default
  timeout: 30_000,                       // ms, default 30 s
  maxRetries: 3,                         // default 3
});
```

### `client.process(file, options?)`

Upload a single file and create a processing job.

```typescript
const job = await client.process("invoice.pdf", {
  locale: "tr",          // BCP-47 locale hint
  pipelineConfig: {},    // optional pipeline overrides
});
```

Returns a `Job` instance.

### `client.processMany(files, options?)`

Batch-process multiple files. Returns `Job[]`.

```typescript
const jobs = await client.processMany(["a.pdf", "b.pdf"], { locale: "en" });
```

### `client.processFromS3(connectorId, keys, options?)`

Import files from S3 via a registered connector. Returns `Job[]`.

```typescript
const jobs = await client.processFromS3(conn.id, ["folder/doc.pdf"], { locale: "de" });
```

### `client.search(query, options?)`

Semantic search across all indexed datasets.

```typescript
const results = await client.search("net payment terms", { topK: 5 });
for (const r of results) {
  console.log(r.score, r.text);
}
```

---

### `Job`

| Method | Description |
|--------|-------------|
| `job.wait(options?)` | Poll until done. Resolves with a completed `Job`. |
| `job.dataset()` | Fetch the resulting `Dataset` (null if none). |

`wait` options: `{ timeout?: number (seconds), pollInterval?: number (ms) }`

Throws `JobFailedError` if the job fails, `JobTimeoutError` if timeout is exceeded.

---

### `Dataset`

| Method | Description |
|--------|-------------|
| `dataset.export(format)` | Download dataset as `Buffer`. |
| `dataset.exportToS3(connectorId, format, prefix?)` | Push export to S3. |
| `dataset.index()` | Trigger vector indexing. |
| `dataset.indexStatus()` | Poll index build status. |

Key properties: `id`, `name`, `slug`, `rowCount`, `status`, `qualityGrade`, `qualityScore`, `piiCount`, `createdAt`.

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

Supported connector types: `"s3"`. (`"gcs"` and `"azure_blob"` coming in a future release.)

---

### `client.jobs` / `client.datasets` / `client.usage` / `client.webhooks`

```typescript
await client.jobs.list();
await client.jobs.get(id);
await client.jobs.cancel(id);

await client.datasets.list();
await client.datasets.get(id);
await client.datasets.delete(id);

const snap = await client.usage.current();
// { periodStart, periodEnd, documentsProcessed, documentsLimit, planTier }

await client.webhooks.create("https://example.com/hook", ["job.completed"]);
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
    console.error("Monthly document quota exceeded");
  } else if (err instanceof RateLimitError) {
    console.error(`Rate limited — retry after ${err.retryAfter}s`);
  } else {
    throw err;
  }
}
```

All SDK errors extend `FlexOrchError`. HTTP 4xx/5xx responses map to typed error classes automatically.

---

## Configuration

| Option | Env var | Default |
|--------|---------|---------|
| `apiKey` | `FLEXORCH_API_KEY` | — |
| `baseUrl` | `FLEXORCH_BASE_URL` | `https://api.flexorch.com` |
| `timeout` | — | `30000` ms |
| `maxRetries` | — | `3` |

---

## Examples

| File | Description |
|------|-------------|
| [basic-process.ts](examples/basic-process.ts) | Process a single PDF, export JSONL |
| [batch-process.ts](examples/batch-process.ts) | Process a directory, collect datasets |
| [s3-import.ts](examples/s3-import.ts) | Register S3 connector, import, export back |

---

## Development

```bash
npm install
npm run build     # ESM + CJS + .d.ts
npm test          # 36 tests via vitest
npm run typecheck # tsc --noEmit
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

---

## License

[MIT](LICENSE) — Flexorch Technology 2026
