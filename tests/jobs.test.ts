import { describe, it, expect } from "vitest";
import { FlexOrchClient, JobFailedError, JobTimeoutError } from "../src/index.js";
import { mockFetch, mockFetchSequence } from "./helpers.js";

function makeClient(fetch: ReturnType<typeof mockFetch>) {
  return new FlexOrchClient({ apiKey: "fx_test", maxRetries: 1, _fetch: fetch });
}

describe("Job.wait()", () => {
  it("returns immediately when already completed", async () => {
    const client = makeClient(
      mockFetch(200, { job_id: "j1", status: "completed", quality: { grade: "A", score: 0.9 } }),
    );
    const job = await client.jobs.get("j1");
    const done = await job.wait();
    expect(done.status).toBe("completed");
    expect(done.qualityGrade).toBe("A");
  });

  it("polls until completed", async () => {
    const fetch = mockFetchSequence([
      { status: 200, body: { job_id: "j1", status: "running" } },
      { status: 200, body: { job_id: "j1", status: "running" } },
      { status: 200, body: { job_id: "j1", status: "completed", quality: { grade: "B", score: 0.7 } } },
    ]);
    const client = new FlexOrchClient({ apiKey: "fx_test", maxRetries: 1, _fetch: fetch });
    const job = await client.jobs.get("j1");
    const done = await job.wait({ pollInterval: 0.01 });
    expect(done.qualityGrade).toBe("B");
  });

  it("throws JobFailedError when job fails", async () => {
    const fetch = mockFetchSequence([
      { status: 200, body: { job_id: "j1", status: "running" } },
      { status: 200, body: { job_id: "j1", status: "failed", failure_reason: "OCR error" } },
    ]);
    const client = new FlexOrchClient({ apiKey: "fx_test", maxRetries: 1, _fetch: fetch });
    const job = await client.jobs.get("j1");
    await expect(job.wait({ pollInterval: 0.01 })).rejects.toBeInstanceOf(JobFailedError);
  });

  it("throws JobTimeoutError when timeout is exceeded", async () => {
    const fetch = mockFetch(200, { job_id: "j1", status: "running" });
    const client = new FlexOrchClient({ apiKey: "fx_test", maxRetries: 1, _fetch: fetch });
    const job = await client.jobs.get("j1");
    await expect(
      job.wait({ timeout: 0.05, pollInterval: 0.01 }),
    ).rejects.toBeInstanceOf(JobTimeoutError);
  });

  it("returns null dataset when hasDataset is false", async () => {
    const client = makeClient(
      mockFetch(200, { job_id: "j1", status: "completed", has_dataset: false }),
    );
    const job = await client.jobs.get("j1");
    expect(await job.dataset()).toBeNull();
  });

  it("surfaces degraded from execution_summary", async () => {
    const client = makeClient(
      mockFetch(200, {
        job_id: "j1",
        status: "completed",
        execution_summary: { execution_id: 1, status: "completed", degraded: true },
      }),
    );
    const job = await client.jobs.get("j1");
    expect(job.degraded).toBe(true);
  });

  it("degraded defaults to false without execution_summary", async () => {
    const client = makeClient(mockFetch(200, { job_id: "j1", status: "completed" }));
    const job = await client.jobs.get("j1");
    expect(job.degraded).toBe(false);
  });

  it("degraded is false when execution_summary says false", async () => {
    const client = makeClient(
      mockFetch(200, {
        job_id: "j1",
        status: "completed",
        execution_summary: { degraded: false },
      }),
    );
    const job = await client.jobs.get("j1");
    expect(job.degraded).toBe(false);
  });
});

describe("JobsResource", () => {
  it("lists jobs", async () => {
    const client = makeClient(
      mockFetch(200, {
        items: [
          { job_id: "j1", status: "completed" },
          { job_id: "j2", status: "running" },
        ],
      }),
    );
    const jobs = await client.jobs.list();
    expect(jobs).toHaveLength(2);
    expect(jobs[0]!.id).toBe("j1");
  });
});
