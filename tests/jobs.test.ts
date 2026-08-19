import { describe, it, expect } from "vitest";
import { FlexOrchClient, JobFailedError, JobTimeoutError } from "../src/index.js";
import { mockFetch, mockFetchSequence, envelope, accepted } from "./helpers.js";

function makeClient(fetch: ReturnType<typeof mockFetch>) {
  return new FlexOrchClient({ apiKey: "fx_test", maxRetries: 1, _fetch: fetch });
}

describe("Job.wait()", () => {
  it("returns immediately when already completed", async () => {
    const client = makeClient(
      mockFetch(200, envelope({ job_id: "j1", status: "completed", quality: { grade: "A", score: 0.9 } })),
    );
    const job = await client.jobs.get("j1");
    const done = await job.wait();
    expect(done.status).toBe("completed");
    expect(done.qualityGrade).toBe("A");
  });

  it("polls until completed", async () => {
    const fetch = mockFetchSequence([
      { status: 200, body: envelope({ job_id: "j1", status: "running" }) },
      { status: 200, body: envelope({ job_id: "j1", status: "running" }) },
      { status: 200, body: envelope({ job_id: "j1", status: "completed", quality: { grade: "B", score: 0.7 } }) },
    ]);
    const client = new FlexOrchClient({ apiKey: "fx_test", maxRetries: 1, _fetch: fetch });
    const job = await client.jobs.get("j1");
    const done = await job.wait({ pollInterval: 0.01 });
    expect(done.qualityGrade).toBe("B");
  });

  it("throws JobFailedError when job fails", async () => {
    const fetch = mockFetchSequence([
      { status: 200, body: envelope({ job_id: "j1", status: "running" }) },
      { status: 200, body: envelope({ job_id: "j1", status: "failed", failure_reason: "OCR error" }) },
    ]);
    const client = new FlexOrchClient({ apiKey: "fx_test", maxRetries: 1, _fetch: fetch });
    const job = await client.jobs.get("j1");
    await expect(job.wait({ pollInterval: 0.01 })).rejects.toBeInstanceOf(JobFailedError);
  });

  it("throws JobTimeoutError when timeout is exceeded", async () => {
    const fetch = mockFetch(200, envelope({ job_id: "j1", status: "running" }));
    const client = new FlexOrchClient({ apiKey: "fx_test", maxRetries: 1, _fetch: fetch });
    const job = await client.jobs.get("j1");
    await expect(
      job.wait({ timeout: 0.05, pollInterval: 0.01 }),
    ).rejects.toBeInstanceOf(JobTimeoutError);
  });

  it("returns null dataset when hasDataset is false", async () => {
    const client = makeClient(
      mockFetch(200, envelope({ job_id: "j1", status: "completed", has_dataset: false })),
    );
    const job = await client.jobs.get("j1");
    expect(await job.dataset()).toBeNull();
  });

  it("surfaces degraded from execution_summary", async () => {
    const client = makeClient(
      mockFetch(200, envelope({
        job_id: "j1",
        status: "completed",
        execution_summary: { execution_id: 1, status: "completed", degraded: true },
      })),
    );
    const job = await client.jobs.get("j1");
    expect(job.degraded).toBe(true);
  });

  it("degraded defaults to false without execution_summary", async () => {
    const client = makeClient(mockFetch(200, envelope({ job_id: "j1", status: "completed" })));
    const job = await client.jobs.get("j1");
    expect(job.degraded).toBe(false);
  });

  it("degraded is false when execution_summary says false", async () => {
    const client = makeClient(
      mockFetch(200, envelope({
        job_id: "j1",
        status: "completed",
        execution_summary: { degraded: false },
      })),
    );
    const job = await client.jobs.get("j1");
    expect(job.degraded).toBe(false);
  });

  it("reads executionId from execution_summary", async () => {
    const client = makeClient(
      mockFetch(200, envelope({
        job_id: "j1", status: "completed",
        execution_summary: { execution_id: 42, degraded: false },
      })),
    );
    const job = await client.jobs.get("j1");
    expect(job.executionId).toBe(42);
  });

  it("fetches the dataset when hasDataset is true", async () => {
    const fetch = mockFetchSequence([
      { status: 200, body: envelope({ job_id: "j1", status: "completed", has_dataset: true }) },
      { status: 200, body: envelope({ items: [{ id: "ds-1", name: "My Dataset", slug: "my-dataset", status: "ready", row_count: 10 }] }) },
    ]);
    const client = new FlexOrchClient({ apiKey: "fx_test", maxRetries: 1, _fetch: fetch });
    const job = await client.jobs.get("j1");
    const ds = await job.dataset();
    expect(ds).not.toBeNull();
    expect(ds!.id).toBe("ds-1");
    expect(ds!.rowCount).toBe(10);
  });
});

describe("JobsResource", () => {
  it("lists jobs", async () => {
    const client = makeClient(
      mockFetch(200, envelope({
        items: [
          { job_id: "j1", status: "completed" },
          { job_id: "j2", status: "running" },
        ],
      })),
    );
    const jobs = await client.jobs.list();
    expect(jobs).toHaveLength(2);
    expect(jobs[0]!.id).toBe("j1");
  });
});

describe("Job.buildDataset()", () => {
  it("posts to build-from-execution and returns the build Job", async () => {
    const { Job } = await import("../src/models/job.js");
    const { Transport } = await import("../src/transport.js");
    const buildFetch = mockFetch(202, accepted({ job_id: "job-build-1", job_type: "dataset_build", status: "queued", reference_id: 42 }));
    const t = new Transport("fx_test", "https://api.flexorch.com/v1", 30, 1, buildFetch);
    const job = new Job({
      id: "j1", status: "completed", qualityGrade: null, qualityScore: null,
      documentId: null, executionId: 42, hasDataset: false, datasetId: null, degraded: false,
      failureReason: null, _transport: t,
    });

    const buildJob = await job.buildDataset({ name: "my-dataset" });
    expect(buildJob.id).toBe("job-build-1");

    const body = JSON.parse((buildFetch as ReturnType<typeof import("vitest")["vi"]["fn"]>).mock.calls[0]![1]!.body as string);
    expect(body.name).toBe("my-dataset");
  });

  it("throws without an executionId", async () => {
    const client = makeClient(mockFetch(200, envelope({ job_id: "j1", status: "completed" })));
    const job = await client.jobs.get("j1");
    await expect(job.buildDataset()).rejects.toThrow("executionId");
  });

  it("job.buildDataset().wait().dataset() resolves via dataset_summary.dataset_id", async () => {
    // A completed dataset_build job reports its output only through
    // dataset_summary.dataset_id — never has_dataset or processing_summary
    // (those are data_process-job-only fields). Before this fixture existed
    // that gap wasn't modeled, so .dataset() always returned null for this
    // exact documented chain despite the dataset having been built.
    const fetch = mockFetchSequence([
      { status: 200, body: envelope({ job_id: "145", status: "completed", execution_summary: { execution_id: 106, degraded: false } }) },
      { status: 202, body: accepted({ job_id: "146", job_type: "dataset_build", status: "queued", reference_id: 106 }) },
      { status: 200, body: envelope({
          id: 146, job_type: "dataset_build", status: "completed",
          dataset_summary: {
            dataset_id: 28, name: "dataset_execution_106", slug: "dataset-execution-106",
            status: "ready", version: 1, row_count: 1,
          },
        }) },
      { status: 200, body: envelope({
          id: 28, name: "dataset_execution_106", slug: "dataset-execution-106",
          status: "ready", row_count: 1,
        }) },
    ]);
    const client = new FlexOrchClient({ apiKey: "fx_test", maxRetries: 1, _fetch: fetch });
    const job = await client.jobs.get("145");
    const built = await job.buildDataset();
    const done = await built.wait({ pollInterval: 0.01 });
    const ds = await done.dataset();
    expect(ds).not.toBeNull();
    expect(ds!.id).toBe("28");
    expect(ds!.status).toBe("ready");
  });
});
