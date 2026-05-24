/**
 * Batch example: process multiple documents and collect datasets.
 */
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { FlexOrchClient, JobFailedError } from "flexorch-sdk";

const client = new FlexOrchClient();

const dir = "documents";
const files = (await readdir(dir))
  .filter((f) => f.endsWith(".pdf"))
  .map((f) => join(dir, f));

console.log(`Processing ${files.length} files...`);

const jobs = await client.processMany(files, { locale: "und" });

for (const job of jobs) {
  try {
    const done = await job.wait({ timeout: 300 });
    const ds = await done.dataset();
    if (ds) {
      const bytes = await ds.export("jsonl");
      const path = `output/${ds.slug}.jsonl`;
      await import("node:fs/promises").then((fs) => fs.writeFile(path, bytes));
      console.log(`  ✓ ${ds.name} — ${ds.rowCount} rows (grade ${done.qualityGrade})`);
    }
  } catch (err) {
    if (err instanceof JobFailedError) {
      console.error(`  ✗ job ${err.jobId} failed: ${err.failureReason}`);
    } else {
      throw err;
    }
  }
}
