import { describe, it, expect } from "vitest";
import { FlexOrchClient } from "../src/index.js";
import { Dataset } from "../src/models/dataset.js";
import { Transport } from "../src/transport.js";
import { mockFetch, envelope, accepted } from "./helpers.js";

function makeClient(fetch: ReturnType<typeof mockFetch>) {
  return new FlexOrchClient({ apiKey: "fx_test", maxRetries: 1, _fetch: fetch });
}

describe("ConnectorsResource", () => {
  it("creates a connector", async () => {
    const client = makeClient(
      mockFetch(201, envelope({ id: "c1", name: "Prod S3", type: "s3", active: true, created_at: "" })),
    );
    const conn = await client.connectors.create("Prod S3", "s3", {
      bucket: "my-bucket",
      region: "eu-central-1",
      accessKeyId: "AKIA...",
      secretAccessKey: "secret",
    });
    expect(conn.id).toBe("c1");
    expect(conn.type).toBe("s3");
  });

  it("throws on invalid connector type", async () => {
    const client = makeClient(mockFetch(200, envelope({})));
    await expect(client.connectors.create("Bad", "ftp" as never, {})).rejects.toThrow(
      "Unknown connector type",
    );
  });

  it("creates a google_drive connector", async () => {
    const client = makeClient(
      mockFetch(201, envelope({
        id: "c2",
        name: "Shared Invoices",
        type: "google_drive",
        active: true,
        created_at: "",
      })),
    );
    const conn = await client.connectors.create("Shared Invoices", "google_drive", {
      folder_id: "1a2B3cD4eFgH5iJkL6mN7oP8qR9sT0uV",
      credentials_json: "{}",
    });
    expect(conn.id).toBe("c2");
    expect(conn.type).toBe("google_drive");
  });

  it("creates a pinecone connector", async () => {
    const client = makeClient(
      mockFetch(201, envelope({ id: "c3", name: "Prod Pinecone", type: "pinecone", active: true, created_at: "" })),
    );
    const conn = await client.connectors.create("Prod Pinecone", "pinecone", {
      api_key: "pc-key",
      index_name: "flexorch-idx",
    });
    expect(conn.id).toBe("c3");
    expect(conn.type).toBe("pinecone");
  });

  it("creates a qdrant connector", async () => {
    const client = makeClient(
      mockFetch(201, envelope({ id: "c4", name: "Prod Qdrant", type: "qdrant", active: true, created_at: "" })),
    );
    const conn = await client.connectors.create("Prod Qdrant", "qdrant", {
      url: "https://xyz.qdrant.io:6333",
      collection_name: "flexorch_chunks",
    });
    expect(conn.id).toBe("c4");
    expect(conn.type).toBe("qdrant");
  });

  it("creates a pgvector_external connector", async () => {
    const client = makeClient(
      mockFetch(201, envelope({ id: "c5", name: "Customer PG", type: "pgvector_external", active: true, created_at: "" })),
    );
    const conn = await client.connectors.create("Customer PG", "pgvector_external", {
      connection_string: "postgresql://user:pass@host:5432/db",
    });
    expect(conn.id).toBe("c5");
    expect(conn.type).toBe("pgvector_external");
  });

  it("lists connectors", async () => {
    const client = makeClient(
      mockFetch(200, envelope({
        items: [
          { id: "c1", name: "Prod S3", type: "s3", active: true, created_at: "" },
          { id: "c2", name: "Staging", type: "s3", active: true, created_at: "" },
        ],
      })),
    );
    const connectors = await client.connectors.list();
    expect(connectors).toHaveLength(2);
  });

  it("gets a connector by id", async () => {
    const client = makeClient(
      mockFetch(200, envelope({
        id: "c1",
        name: "Prod S3",
        type: "s3",
        active: true,
        last_tested_at: "2026-05-24T10:00:00Z",
        created_at: "",
      })),
    );
    const conn = await client.connectors.get("c1");
    expect(conn.lastTestedAt).toBe("2026-05-24T10:00:00Z");
  });

  it("deletes a connector", async () => {
    const client = makeClient(mockFetch(204, null));
    await expect(client.connectors.delete("c1")).resolves.toBeUndefined();
  });

  it("tests connector — success", async () => {
    const client = makeClient(
      mockFetch(200, envelope({ success: true, latency_ms: 42, message: "Connection OK" })),
    );
    const result = await client.connectors.test("c1");
    expect(result.success).toBe(true);
    expect(result.latencyMs).toBe(42);
  });

  it("tests connector — failure", async () => {
    const client = makeClient(
      mockFetch(200, envelope({ success: false, latency_ms: null, message: "Access Denied" })),
    );
    const result = await client.connectors.test("c1");
    expect(result.success).toBe(false);
    expect(result.message).toBe("Access Denied");
  });
});

describe("ConnectorsResource — schedules", () => {
  it("creates a schedule", async () => {
    const fetch = mockFetch(201, envelope({
      id: "s1", connector_id: "c1", cron_expression: "0 2 * * *",
      prefix_filter: "invoices/", is_active: true,
      last_run_at: null, next_run_at: "2026-08-18T02:00:00Z", created_at: "2026-08-17",
    }));
    const client = makeClient(fetch);
    const sched = await client.connectors.createSchedule("c1", "0 2 * * *", "invoices/");
    expect(sched.id).toBe("s1");
    expect(sched.cronExpression).toBe("0 2 * * *");
    const body = JSON.parse((fetch as ReturnType<typeof import("vitest")["vi"]["fn"]>).mock.calls[0]![1]!.body as string);
    expect(body.prefix_filter).toBe("invoices/");
  });

  it("lists schedules", async () => {
    const client = makeClient(
      mockFetch(200, envelope([
        { id: "s1", connector_id: "c1", cron_expression: "0 2 * * *", prefix_filter: null, is_active: true },
      ])),
    );
    const schedules = await client.connectors.listSchedules("c1");
    expect(schedules).toHaveLength(1);
  });

  it("deletes a schedule", async () => {
    const client = makeClient(mockFetch(200, envelope({ deleted: true })));
    await expect(client.connectors.deleteSchedule("c1", "s1")).resolves.toBeUndefined();
  });

  it("triggers a schedule", async () => {
    const client = makeClient(
      mockFetch(202, envelope({
        id: "log1", schedule_id: "s1", started_at: "2026-08-17T10:00:00Z",
        completed_at: null, files_found: 0, files_new: 0, files_skipped: 0,
        files_failed: 0, status: "running",
      })),
    );
    const log = await client.connectors.triggerSchedule("c1", "s1");
    expect(log.status).toBe("running");
  });

  it("returns schedule logs", async () => {
    const client = makeClient(
      mockFetch(200, envelope([
        { id: "log1", schedule_id: "s1", started_at: "2026-08-17T02:00:00Z",
          completed_at: "2026-08-17T02:01:00Z", files_found: 5, files_new: 3,
          files_skipped: 2, files_failed: 0, status: "completed" },
      ])),
    );
    const logs = await client.connectors.scheduleLogs("c1", "s1");
    expect(logs).toHaveLength(1);
    expect(logs[0]!.filesNew).toBe(3);
  });
});

describe("client.processFromS3", () => {
  it("returns one job per key", async () => {
    const client = makeClient(
      mockFetch(202, accepted({
        accepted: 1, rejected: [],
        jobs: [{ filename: "x", job_id: "j-s3-1", status: "queued" }],
      })),
    );
    const jobs = await client.processFromS3("c1", ["invoices/a.pdf", "invoices/b.pdf"]);
    expect(jobs).toHaveLength(2);
    expect(jobs[0]!.id).toBe("j-s3-1");
  });

  it("throws ValidationError when a key is rejected", async () => {
    const { ValidationError } = await import("../src/index.js");
    const client = makeClient(
      mockFetch(202, accepted({
        accepted: 0, rejected: [{ filename: "bad.exe", error: "UNSUPPORTED_FILE" }], jobs: [],
      })),
    );
    await expect(client.processFromS3("c1", ["bad.exe"])).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("dataset.exportToS3", () => {
  it("returns s3Key and sizeBytes", async () => {
    const t = new Transport(
      "fx_test",
      "https://api.flexorch.com/v1",
      30,
      1,
      mockFetch(200, envelope({ s3_key: "exports/my-ds.jsonl", size_bytes: 10240 })),
    );
    const ds = Dataset.fromDict(
      { id: "d1", name: "My DS", slug: "my-ds", status: "ready", row_count: 1 },
      t,
    );
    const result = await ds.exportToS3("c1", "jsonl", "exports/");
    expect(result.s3Key).toBe("exports/my-ds.jsonl");
    expect(result.sizeBytes).toBe(10240);
  });

  it("throws on invalid format", async () => {
    const t = new Transport("fx_test", "https://api.flexorch.com/v1", 30, 1, mockFetch(200, envelope({})));
    const ds = Dataset.fromDict({ id: "d1", name: "x", slug: "x", status: "ready" }, t);
    await expect(ds.exportToS3("c1", "pdf" as never)).rejects.toThrow("Unsupported format");
  });
});

describe("dataset.index + indexStatus", () => {
  it("triggers indexing", async () => {
    const t = new Transport(
      "fx_test",
      "https://api.flexorch.com/v1",
      30,
      1,
      mockFetch(202, envelope({ status: "indexing", message: "Indexing started" })),
    );
    const ds = Dataset.fromDict({ id: "d1", name: "x", slug: "x", status: "ready" }, t);
    const result = await ds.index();
    expect(result.status).toBe("indexing");
  });

  it("returns index status", async () => {
    const t = new Transport(
      "fx_test",
      "https://api.flexorch.com/v1",
      30,
      1,
      mockFetch(200, envelope({ status: "ready", chunks_indexed: 48, total_chunks: 48 })),
    );
    const ds = Dataset.fromDict({ id: "d1", name: "x", slug: "x", status: "ready" }, t);
    const status = await ds.indexStatus();
    expect(status.status).toBe("ready");
    expect(status.chunksIndexed).toBe(48);
  });
});
