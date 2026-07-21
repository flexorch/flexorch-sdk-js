import { describe, it, expect } from "vitest";
import { FlexOrchClient } from "../src/index.js";
import { Dataset } from "../src/models/dataset.js";
import { Transport } from "../src/transport.js";
import { mockFetch } from "./helpers.js";

function makeClient(fetch: ReturnType<typeof mockFetch>) {
  return new FlexOrchClient({ apiKey: "fx_test", maxRetries: 1, _fetch: fetch });
}

describe("ConnectorsResource", () => {
  it("creates a connector", async () => {
    const client = makeClient(
      mockFetch(201, { id: "c1", name: "Prod S3", type: "s3", active: true, created_at: "" }),
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
    const client = makeClient(mockFetch(200, {}));
    await expect(client.connectors.create("Bad", "ftp" as never, {})).rejects.toThrow(
      "Unknown connector type",
    );
  });

  it("creates a google_drive connector", async () => {
    const client = makeClient(
      mockFetch(201, {
        id: "c2",
        name: "Shared Invoices",
        type: "google_drive",
        active: true,
        created_at: "",
      }),
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
      mockFetch(201, { id: "c3", name: "Prod Pinecone", type: "pinecone", active: true, created_at: "" }),
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
      mockFetch(201, { id: "c4", name: "Prod Qdrant", type: "qdrant", active: true, created_at: "" }),
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
      mockFetch(201, { id: "c5", name: "Customer PG", type: "pgvector_external", active: true, created_at: "" }),
    );
    const conn = await client.connectors.create("Customer PG", "pgvector_external", {
      connection_string: "postgresql://user:pass@host:5432/db",
    });
    expect(conn.id).toBe("c5");
    expect(conn.type).toBe("pgvector_external");
  });

  it("lists connectors", async () => {
    const client = makeClient(
      mockFetch(200, {
        items: [
          { id: "c1", name: "Prod S3", type: "s3", active: true, created_at: "" },
          { id: "c2", name: "Staging", type: "s3", active: true, created_at: "" },
        ],
      }),
    );
    const connectors = await client.connectors.list();
    expect(connectors).toHaveLength(2);
  });

  it("gets a connector by id", async () => {
    const client = makeClient(
      mockFetch(200, {
        id: "c1",
        name: "Prod S3",
        type: "s3",
        active: true,
        last_tested_at: "2026-05-24T10:00:00Z",
        created_at: "",
      }),
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
      mockFetch(200, { success: true, latency_ms: 42, message: "Connection OK" }),
    );
    const result = await client.connectors.test("c1");
    expect(result.success).toBe(true);
    expect(result.latencyMs).toBe(42);
  });

  it("tests connector — failure", async () => {
    const client = makeClient(
      mockFetch(200, { success: false, latency_ms: null, message: "Access Denied" }),
    );
    const result = await client.connectors.test("c1");
    expect(result.success).toBe(false);
    expect(result.message).toBe("Access Denied");
  });
});

describe("client.processFromS3", () => {
  it("returns one job per key", async () => {
    const client = makeClient(
      mockFetch(202, { job_id: "j-s3-1", status: "queued" }),
    );
    const jobs = await client.processFromS3("c1", ["invoices/a.pdf", "invoices/b.pdf"]);
    expect(jobs).toHaveLength(2);
    expect(jobs[0]!.id).toBe("j-s3-1");
  });
});

describe("dataset.exportToS3", () => {
  it("returns s3Key and sizeBytes", async () => {
    const t = new Transport(
      "fx_test",
      "https://api.flexorch.com/v1",
      30,
      1,
      mockFetch(200, { s3_key: "exports/my-ds.jsonl", size_bytes: 10240 }),
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
    const t = new Transport("fx_test", "https://api.flexorch.com/v1", 30, 1, mockFetch(200, {}));
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
      mockFetch(202, { status: "indexing", message: "Indexing started" }),
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
      mockFetch(200, { status: "ready", chunks_indexed: 48, total_chunks: 48 }),
    );
    const ds = Dataset.fromDict({ id: "d1", name: "x", slug: "x", status: "ready" }, t);
    const status = await ds.indexStatus();
    expect(status.status).toBe("ready");
    expect(status.chunksIndexed).toBe(48);
  });
});
