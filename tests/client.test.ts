import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { FlexOrchClient, AuthError, ValidationError, version } from "../src/index.js";
import { mockFetch } from "./helpers.js";

describe("FlexOrchClient — init", () => {
  it("throws when no API key is provided", () => {
    const orig = process.env["FLEXORCH_API_KEY"];
    delete process.env["FLEXORCH_API_KEY"];
    expect(() => new FlexOrchClient()).toThrow("No API key");
    if (orig !== undefined) process.env["FLEXORCH_API_KEY"] = orig;
  });

  it("accepts api key as string", () => {
    expect(() => new FlexOrchClient("fx_test")).not.toThrow();
  });

  it("accepts api key via options object", () => {
    expect(() => new FlexOrchClient({ apiKey: "fx_test" })).not.toThrow();
  });

  it("reads FLEXORCH_API_KEY env var", () => {
    process.env["FLEXORCH_API_KEY"] = "fx_env";
    expect(() => new FlexOrchClient()).not.toThrow();
    delete process.env["FLEXORCH_API_KEY"];
  });
});

describe("FlexOrchClient — search", () => {
  it("returns search results", async () => {
    const client = new FlexOrchClient({
      apiKey: "fx_test",
      _fetch: mockFetch(200, {
        results: [
          { chunk_id: "c1", text: "invoice total", score: 0.92,
            dataset_id: "d1", chunk_index: 0, token_count: 10, metadata: {} },
        ],
      }),
    });
    const results = await client.search("invoice");
    expect(results).toHaveLength(1);
    expect(results[0]!.score).toBe(0.92);
    expect(results[0]!.datasetId).toBe("d1");
  });

  it("returns empty array when no results", async () => {
    const client = new FlexOrchClient({
      apiKey: "fx_test",
      _fetch: mockFetch(200, {}),
    });
    const results = await client.search("nothing");
    expect(results).toHaveLength(0);
  });

  it("passes filters to the API", async () => {
    const fetch = mockFetch(200, { results: [] });
    const client = new FlexOrchClient({ apiKey: "fx_test", _fetch: fetch });
    await client.search("query", { topK: 5, filters: { documentType: "invoice", language: "de" } });
    const body = JSON.parse((fetch as ReturnType<typeof import("vitest")["vi"]["fn"]>).mock.calls[0]![1]!.body as string);
    expect(body.top_k).toBe(5);
    expect(body.filters.document_type).toBe("invoice");
  });
});

describe("FlexOrchClient — error handling", () => {
  it("throws AuthError on 401", async () => {
    const client = new FlexOrchClient({
      apiKey: "fx_bad",
      maxRetries: 1,
      _fetch: mockFetch(401, { error: { code: "UNAUTHORIZED", message: "Invalid key" } }),
    });
    await expect(client.search("x")).rejects.toBeInstanceOf(AuthError);
  });

  it("throws ValidationError on 422", async () => {
    const client = new FlexOrchClient({
      apiKey: "fx_test",
      maxRetries: 1,
      _fetch: mockFetch(422, { error: { code: "VALIDATION_ERROR", message: "bad param" } }),
    });
    await expect(client.search("x")).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("version", () => {
  it("matches package.json", () => {
    // Regression guard: the version constant drifted from package.json for
    // two releases (stuck at 0.2.0 while package.json moved to 0.2.2) with
    // no test to catch it.
    const dir = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(dir, "..", "package.json"), "utf-8")) as {
      version: string;
    };
    expect(version).toBe(pkg.version);
  });
});
