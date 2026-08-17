import { describe, it, expect } from "vitest";
import { FlexOrchClient } from "../src/index.js";
import { RAGDocument, FlexOrchRetriever, FlexOrchReader } from "../src/rag.js";
import { mockFetch, mockFetchSequence, envelope } from "./helpers.js";

const CHUNK_ITEM = {
  chunk_id: "ch-1",
  chunk_index: 0,
  text: "Invoice total: 1200 EUR",
  token_count: 8,
  metadata: {
    quality_grade: "A",
    quality_score: 0.91,
    pii_masked: false,
    doc_type: "invoice",
    language: "en",
    source_filename: "inv-001.pdf",
  },
};

const SEARCH_RESULT = {
  chunk_id: "ch-1",
  text: "Invoice total: 1200 EUR",
  score: 0.92,
  dataset_id: "d1",
  chunk_index: 0,
  token_count: 8,
  metadata: { quality_grade: "A", pii_masked: false, doc_type: "invoice" },
};

function makeClient(fetch: ReturnType<typeof mockFetch>) {
  return new FlexOrchClient({ apiKey: "fx_test", maxRetries: 1, _fetch: fetch });
}

// ── RAGDocument ───────────────────────────────────────────────────────────────

describe("RAGDocument", () => {
  it("exposes text as alias for pageContent", () => {
    const doc = new RAGDocument("hello world", { score: 0.9 });
    expect(doc.text).toBe("hello world");
    expect(doc.pageContent).toBe("hello world");
  });

  it("toString includes snippet", () => {
    const doc = new RAGDocument("invoice total 1200 EUR");
    expect(doc.toString()).toContain("invoice total");
  });
});

// ── FlexOrchRetriever ─────────────────────────────────────────────────────────

describe("FlexOrchRetriever", () => {
  it("throws on invalid qualityThreshold", () => {
    const client = makeClient(mockFetch(200, envelope({})));
    expect(() => new FlexOrchRetriever(client, { qualityThreshold: "X" })).toThrow(
      "qualityThreshold must be",
    );
  });

  it("toString includes config", () => {
    const client = makeClient(mockFetch(200, envelope({})));
    const r = new FlexOrchRetriever(client, { qualityThreshold: "A", topK: 3 });
    expect(r.toString()).toContain("A");
    expect(r.toString()).toContain("3");
  });

  it("invoke returns RAGDocument list", async () => {
    const client = makeClient(mockFetch(200, envelope({ results: [SEARCH_RESULT] })));
    const retriever = new FlexOrchRetriever(client);
    const docs = await retriever.invoke("invoice amount");
    expect(docs).toHaveLength(1);
    expect(docs[0]).toBeInstanceOf(RAGDocument);
    expect(docs[0].pageContent).toBe("Invoice total: 1200 EUR");
    expect(docs[0].metadata["score"]).toBe(0.92);
    expect(docs[0].metadata["datasetId"]).toBe("d1");
  });

  it("filters out results below quality threshold", async () => {
    const lowGrade = { ...SEARCH_RESULT, metadata: { quality_grade: "D" } };
    const client = makeClient(mockFetch(200, envelope({ results: [lowGrade] })));
    const retriever = new FlexOrchRetriever(client, { qualityThreshold: "B" });
    const docs = await retriever.invoke("anything");
    expect(docs).toHaveLength(0);
  });

  it("allows grade equal to threshold", async () => {
    const bGrade = { ...SEARCH_RESULT, metadata: { quality_grade: "B" } };
    const client = makeClient(mockFetch(200, envelope({ results: [bGrade] })));
    const retriever = new FlexOrchRetriever(client, { qualityThreshold: "B" });
    const docs = await retriever.invoke("anything");
    expect(docs).toHaveLength(1);
  });

  it("getRelevantDocuments is a compatibility alias for invoke", async () => {
    const client = makeClient(mockFetch(200, envelope({ results: [SEARCH_RESULT] })));
    const retriever = new FlexOrchRetriever(client);
    const docs = await retriever.getRelevantDocuments("query");
    expect(docs).toHaveLength(1);
  });

  it("passes mode to search request", async () => {
    const fetch = mockFetch(200, envelope({ results: [] }));
    const client = makeClient(fetch);
    const retriever = new FlexOrchRetriever(client, { mode: "semantic" });
    await retriever.invoke("query");
    expect(fetch).toHaveBeenCalled();
    const reqBody = JSON.parse((fetch.mock.calls[0]![1] as RequestInit).body as string);
    expect(reqBody.mode).toBe("semantic");
  });
});

// ── FlexOrchReader ────────────────────────────────────────────────────────────

describe("FlexOrchReader", () => {
  it("toString returns FlexOrchReader()", () => {
    const client = makeClient(mockFetch(200, envelope({})));
    expect(new FlexOrchReader(client).toString()).toBe("FlexOrchReader()");
  });

  it("throws on invalid minQuality", async () => {
    const client = makeClient(mockFetch(200, envelope({})));
    await expect(new FlexOrchReader(client).loadData("42", { minQuality: "Z" })).rejects.toThrow(
      "minQuality must be",
    );
  });

  it("loads a single page of chunks", async () => {
    const client = makeClient(
      mockFetch(200, envelope({
        items: [CHUNK_ITEM],
        total: 1,
        page: 1,
        page_size: 100,
      })),
    );
    const reader = new FlexOrchReader(client);
    const docs = await reader.loadData("42");
    expect(docs).toHaveLength(1);
    expect(docs[0]).toBeInstanceOf(RAGDocument);
    expect(docs[0].text).toBe("Invoice total: 1200 EUR");
    expect(docs[0].metadata["chunkId"]).toBe("ch-1");
    expect(docs[0].metadata["datasetId"]).toBe("42");
    expect(docs[0].metadata["qualityGrade"]).toBe("A");
  });

  it("paginates across multiple pages", async () => {
    const page1 = { items: [CHUNK_ITEM, CHUNK_ITEM], total: 3, page: 1, page_size: 2 };
    const page2 = { items: [CHUNK_ITEM], total: 3, page: 2, page_size: 2 };
    const client = makeClient(mockFetchSequence([
      { status: 200, body: envelope(page1) },
      { status: 200, body: envelope(page2) },
    ]));
    const reader = new FlexOrchReader(client);
    const docs = await reader.loadData("42", { pageSize: 2 });
    expect(docs).toHaveLength(3);
  });

  it("returns empty list when dataset has no chunks", async () => {
    const client = makeClient(
      mockFetch(200, envelope({ items: [], total: 0, page: 1, page_size: 100 })),
    );
    const docs = await new FlexOrchReader(client).loadData("42");
    expect(docs).toHaveLength(0);
  });
});

// ── dataset.chunks() ─────────────────────────────────────────────────────────

describe("Dataset.chunks()", () => {
  it("returns paginated chunk response", async () => {
    const client = makeClient(
      mockFetch(200, envelope({ items: [CHUNK_ITEM], total: 1, page: 1, page_size: 20 })),
    );
    const ds = await client.datasets.get("d1");
    expect(typeof ds.chunks).toBe("function");
  });
});

// ── client.search with mode ───────────────────────────────────────────────────

describe("client.search mode param", () => {
  it("defaults to auto", async () => {
    const fetch = mockFetch(200, envelope({ results: [] }));
    const client = makeClient(fetch);
    await client.search("query");
    const body = JSON.parse((fetch.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.mode).toBe("auto");
  });

  it("passes explicit mode through", async () => {
    const fetch = mockFetch(200, envelope({ results: [] }));
    const client = makeClient(fetch);
    await client.search("query", { mode: "hybrid" });
    const body = JSON.parse((fetch.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.mode).toBe("hybrid");
  });
});
