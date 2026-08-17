import { describe, it, expect } from "vitest";
import { FlexOrchClient } from "../src/index.js";
import { mockFetch, mockFetchBytes, envelope, accepted } from "./helpers.js";

function makeClient(fetch: ReturnType<typeof mockFetch | typeof mockFetchBytes>) {
  return new FlexOrchClient({ apiKey: "fx_test", maxRetries: 1, _fetch: fetch as never });
}

describe("DatasetsResource", () => {
  it("lists datasets", async () => {
    const client = makeClient(
      mockFetch(200, envelope({
        items: [
          { id: "d1", name: "A", slug: "a", status: "ready", row_count: 5 },
          { id: "d2", name: "B", slug: "b", status: "ready", row_count: 0 },
        ],
      })),
    );
    const datasets = await client.datasets.list();
    expect(datasets).toHaveLength(2);
    expect(datasets[0]!.id).toBe("d1");
    expect(datasets[0]!.rowCount).toBe(5);
  });

  it("gets a single dataset", async () => {
    const client = makeClient(
      mockFetch(200, envelope({ id: "d1", name: "My DS", slug: "my-ds", status: "ready", row_count: 42 })),
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
    const t = new Transport("fx_test", "https://api.flexorch.com/v1", 30, 1, mockFetch(200, envelope({})));
    const ds = Dataset.fromDict({ id: "d1", name: "x", slug: "x", status: "ready" }, t);
    await expect(ds.export("pdf" as never)).rejects.toThrow("Unsupported format");
  });

  it("builds a dataset from an execution", async () => {
    const fetch = mockFetch(202, accepted({ job_id: "job-9", job_type: "dataset_build", status: "queued", reference_id: 7 }));
    const client = makeClient(fetch);
    const job = await client.datasets.buildFromExecution(7, { forceRebuild: true });
    expect(job.id).toBe("job-9");
    const body = JSON.parse((fetch as ReturnType<typeof import("vitest")["vi"]["fn"]>).mock.calls[0]![1]!.body as string);
    expect(body.force_rebuild).toBe(true);
  });

  it("previews rows", async () => {
    const { Dataset } = await import("../src/models/dataset.js");
    const { Transport } = await import("../src/transport.js");
    const t = new Transport("fx_test", "https://api.flexorch.com/v1", 30, 1, mockFetch(200, envelope({
      dataset_id: 1, columns: ["vendor"], rows: [{ vendor: "Acme" }],
      pagination: { page: 1, page_size: 50, total_rows: 1, filtered_total: 1, returned_rows: 1, has_next: false },
    })));
    const ds = Dataset.fromDict({ id: "d1", name: "x", slug: "x", status: "ready" }, t);
    const result = await ds.rows();
    expect((result["rows"] as Record<string, unknown>[])[0]!["vendor"]).toBe("Acme");
  });

  it("returns the quality/privacy profile", async () => {
    const { Dataset } = await import("../src/models/dataset.js");
    const { Transport } = await import("../src/transport.js");
    const t = new Transport("fx_test", "https://api.flexorch.com/v1", 30, 1, mockFetch(200, envelope({
      quality: { grade_distribution: { A: 1 }, avg_score: 0.9, below_threshold_count: 0 },
      privacy: { pii_findings_count: 2, masked_record_count: 1, clean_record_count: 0 },
      formats: ["jsonl"], columns: ["vendor"],
    })));
    const ds = Dataset.fromDict({ id: "d1", name: "x", slug: "x", status: "ready" }, t);
    const profile = await ds.profile();
    expect((profile["privacy"] as Record<string, unknown>)["pii_findings_count"]).toBe(2);
  });

  it("returns a compliance report", async () => {
    const { Dataset } = await import("../src/models/dataset.js");
    const { Transport } = await import("../src/transport.js");
    const t = new Transport("fx_test", "https://api.flexorch.com/v1", 30, 1, mockFetch(200, envelope({
      dataset_id: 1, dataset_name: "x", pii_findings_count: 3,
      kvkk_categories: ["kimlik verisi"], gdpr_categories: [],
      applicable_regulations: [], plan_coverage: "pro_countries",
    })));
    const ds = Dataset.fromDict({ id: "d1", name: "x", slug: "x", status: "ready" }, t);
    const report = await ds.complianceReport();
    expect((report as Record<string, unknown>)["pii_findings_count"]).toBe(3);
  });
});

describe("DocumentsResource", () => {
  it("lists documents", async () => {
    const client = makeClient(
      mockFetch(200, envelope({
        items: [{ id: 1, filename: "a.pdf", file_ext: ".pdf", status: "processed", storage_path: "s3://x" }],
        total: 1, page: 1, page_size: 20,
      })),
    );
    const docs = await client.documents.list();
    expect(docs).toHaveLength(1);
    expect(docs[0]!.filename).toBe("a.pdf");
  });

  it("gets a document with processing history", async () => {
    const client = makeClient(
      mockFetch(200, envelope({
        id: 1, filename: "a.pdf", file_ext: ".pdf", status: "processed", storage_path: "s3://x",
        processing_history: [{ job_id: 5, status: "completed", quality_grade: "A" }],
        related_datasets: [],
      })),
    );
    const doc = await client.documents.get("1");
    expect(doc.processingHistory[0]!["quality_grade"]).toBe("A");
  });

  it("reprocesses a document", async () => {
    const { Document } = await import("../src/models/document.js");
    const { Transport } = await import("../src/transport.js");
    const t = new Transport("fx_test", "https://api.flexorch.com/v1", 30, 1, mockFetch(202, accepted({
      job_id: 42, job_type: "data_process", status: "queued", document_id: 1,
    })));
    const doc = Document.fromDict(
      { id: "1", filename: "a.pdf", file_ext: ".pdf", status: "processed", storage_path: "s3://x" },
      t,
    );
    const job = await doc.reprocess();
    expect(job.id).toBe("42");
  });
});

describe("UsageResource", () => {
  it("returns usage snapshot", async () => {
    const client = makeClient(
      mockFetch(200, envelope({
        plan: "starter",
        trial: null,
        usage: { credits: { used: 120, limit: 1200, remaining: 1080 } },
      })),
    );
    const usage = await client.usage.current();
    expect(usage.plan).toBe("starter");
    expect(usage.creditsRemaining).toBe(1080);
    expect(usage.isTrial).toBe(false);
  });

  it("returns trial info when on a trial plan", async () => {
    const client = makeClient(
      mockFetch(200, envelope({
        plan: "trial",
        trial: { is_trial: true, trial_ends_at: "2026-09-01", trial_days_remaining: 5 },
        usage: { credits: { used: 10, limit: 1200, remaining: 1190 } },
      })),
    );
    const usage = await client.usage.current();
    expect(usage.isTrial).toBe(true);
    expect(usage.trialDaysRemaining).toBe(5);
  });

  it("returns usage history", async () => {
    const client = makeClient(
      mockFetch(200, envelope([
        { date: "2026-08-01", credits_used: 10, jobs_count: 2 },
        { date: "2026-08-02", credits_used: 5, jobs_count: 1 },
      ])),
    );
    const history = await client.usage.history("7d");
    expect(history).toHaveLength(2);
    expect(history[0]!.creditsUsed).toBe(10);
  });

  it("returns the quality trend", async () => {
    const client = makeClient(
      mockFetch(200, envelope([
        { date: "2026-08-01", avg_quality_score: 0.9, grade_distribution: { A: 3 }, avg_field_fill_rate: 0.8, job_count: 3 },
      ])),
    );
    const trend = await client.usage.qualityTrend();
    expect(trend[0]!.avgQualityScore).toBe(0.9);
  });

  it("returns rate limit status", async () => {
    const client = makeClient(
      mockFetch(200, envelope({
        plan: "starter", unlimited: false, limit: 100, used: 10,
        remaining: 90, window_seconds: 60, reset_in_seconds: 30,
      })),
    );
    const status = await client.usage.rateLimits();
    expect(status.remaining).toBe(90);
  });
});

describe("WebhooksResource", () => {
  it("registers a webhook", async () => {
    const client = makeClient(
      mockFetch(201, envelope({
        id: "wh-1",
        url: "https://example.com/hook",
        events: ["dataset.ready"],
        active: true,
        created_at: "2026-05-24",
      })),
    );
    const wh = await client.webhooks.register("https://example.com/hook", ["dataset.ready"]);
    expect(wh.id).toBe("wh-1");
    expect(wh.events).toContain("dataset.ready");
  });

  it("throws on invalid event type", async () => {
    const client = makeClient(mockFetch(200, envelope({})));
    await expect(
      client.webhooks.register("https://x.com", ["invalid.event" as never]),
    ).rejects.toThrow("Unknown event");
  });

  it("lists webhooks", async () => {
    const client = makeClient(
      mockFetch(200, envelope({
        items: [{ id: "wh-1", url: "https://x.com", events: [], active: true, created_at: "" }],
      })),
    );
    const hooks = await client.webhooks.list();
    expect(hooks).toHaveLength(1);
  });

  it("deletes a webhook", async () => {
    const client = makeClient(mockFetch(204, null));
    await expect(client.webhooks.delete("wh-1")).resolves.toBeUndefined();
  });
});

describe("JobsResource — feedback", () => {
  it("submits feedback", async () => {
    const client = makeClient(
      mockFetch(200, envelope({ id: 1, job_id: "j1", rating: "up", issue: null, notes: "great", created_at: "2026-08-17" })),
    );
    const fb = await client.jobs.submitFeedback("j1", "up", { notes: "great" });
    expect(fb.rating).toBe("up");
  });

  it("throws on invalid rating", async () => {
    const client = makeClient(mockFetch(200, envelope({})));
    await expect(client.jobs.submitFeedback("j1", "sideways" as never)).rejects.toThrow("Invalid rating");
  });

  it("throws on invalid issue", async () => {
    const client = makeClient(mockFetch(200, envelope({})));
    await expect(
      client.jobs.submitFeedback("j1", "down", { issue: "not_a_real_issue" }),
    ).rejects.toThrow("Invalid issue");
  });

  it("returns null when no feedback exists", async () => {
    const client = makeClient(mockFetch(200, envelope(null)));
    expect(await client.jobs.getFeedback("j1")).toBeNull();
  });

  it("returns existing feedback", async () => {
    const client = makeClient(
      mockFetch(200, envelope({ id: 1, job_id: "j1", rating: "down", issue: "missing_fields", notes: null, created_at: "2026-08-17" })),
    );
    const fb = await client.jobs.getFeedback("j1");
    expect(fb!.issue).toBe("missing_fields");
  });
});
