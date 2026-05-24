import { describe, it, expect } from "vitest";
import { FlexOrchClient } from "../src/index.js";
import { mockFetch, mockFetchBytes } from "./helpers.js";

function makeClient(fetch: ReturnType<typeof mockFetch | typeof mockFetchBytes>) {
  return new FlexOrchClient({ apiKey: "fx_test", maxRetries: 1, _fetch: fetch as never });
}

describe("DatasetsResource", () => {
  it("lists datasets", async () => {
    const client = makeClient(
      mockFetch(200, {
        items: [
          { id: "d1", name: "A", slug: "a", status: "ready", row_count: 5 },
          { id: "d2", name: "B", slug: "b", status: "ready", row_count: 0 },
        ],
      }),
    );
    const datasets = await client.datasets.list();
    expect(datasets).toHaveLength(2);
    expect(datasets[0]!.id).toBe("d1");
    expect(datasets[0]!.rowCount).toBe(5);
  });

  it("gets a single dataset", async () => {
    const client = makeClient(
      mockFetch(200, { id: "d1", name: "My DS", slug: "my-ds", status: "ready", row_count: 42 }),
    );
    const ds = await client.datasets.get("d1");
    expect(ds.name).toBe("My DS");
    expect(ds.rowCount).toBe(42);
  });

  it("exports dataset as bytes", async () => {
    const bytes = new TextEncoder().encode('{"row":1}\n');
    const { Dataset } = await import("../src/models/dataset.js");
    const { Transport } = await import("../src/transport.js");
    const t = new Transport(
      "fx_test",
      "https://api.flexorch.com/v1",
      30,
      1,
      mockFetchBytes(200, bytes),
    );
    const ds = Dataset.fromDict(
      { id: "d1", name: "x", slug: "x", status: "ready", row_count: 1 },
      t,
    );
    const raw = await ds.export("jsonl");
    expect(raw).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(raw)).toBe('{"row":1}\n');
  });

  it("throws on unsupported export format", async () => {
    const { Dataset } = await import("../src/models/dataset.js");
    const { Transport } = await import("../src/transport.js");
    const t = new Transport("fx_test", "https://api.flexorch.com/v1", 30, 1, mockFetch(200, {}));
    const ds = Dataset.fromDict({ id: "d1", name: "x", slug: "x", status: "ready" }, t);
    await expect(ds.export("pdf" as never)).rejects.toThrow("Unsupported format");
  });
});

describe("UsageResource", () => {
  it("returns usage snapshot", async () => {
    const client = makeClient(
      mockFetch(200, {
        plan: "starter",
        credits_used: 120,
        credits_limit: 1200,
        credits_remaining: 1080,
        reset_at: "2026-06-01",
        period_start: "2026-05-01",
        period_end: "2026-05-31",
      }),
    );
    const usage = await client.usage.current();
    expect(usage.plan).toBe("starter");
    expect(usage.creditsRemaining).toBe(1080);
  });
});

describe("WebhooksResource", () => {
  it("registers a webhook", async () => {
    const client = makeClient(
      mockFetch(201, {
        id: "wh-1",
        url: "https://example.com/hook",
        events: ["dataset.ready"],
        active: true,
        created_at: "2026-05-24",
      }),
    );
    const wh = await client.webhooks.register("https://example.com/hook", ["dataset.ready"]);
    expect(wh.id).toBe("wh-1");
    expect(wh.events).toContain("dataset.ready");
  });

  it("throws on invalid event type", async () => {
    const client = makeClient(mockFetch(200, {}));
    await expect(
      client.webhooks.register("https://x.com", ["invalid.event" as never]),
    ).rejects.toThrow("Unknown event");
  });

  it("lists webhooks", async () => {
    const client = makeClient(
      mockFetch(200, {
        items: [{ id: "wh-1", url: "https://x.com", events: [], active: true, created_at: "" }],
      }),
    );
    const hooks = await client.webhooks.list();
    expect(hooks).toHaveLength(1);
  });

  it("deletes a webhook", async () => {
    const client = makeClient(mockFetch(204, null));
    await expect(client.webhooks.delete("wh-1")).resolves.toBeUndefined();
  });
});
