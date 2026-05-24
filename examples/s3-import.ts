/**
 * S3 example: register a connector, import documents, export results back to S3.
 */
import { FlexOrchClient, JobFailedError } from "flexorch-sdk";

const client = new FlexOrchClient();

// Register a connector once — save conn.id for future use
const conn = await client.connectors.create("Production S3", "s3", {
  bucket: process.env["S3_BUCKET"]!,
  region: process.env["AWS_REGION"] ?? "eu-central-1",
  accessKeyId: process.env["AWS_ACCESS_KEY_ID"]!,
  secretAccessKey: process.env["AWS_SECRET_ACCESS_KEY"]!,
});
console.log(`Connector created: ${conn.id}`);

// Verify connectivity
const test = await client.connectors.test(conn.id);
if (!test.success) throw new Error(`Connector test failed: ${test.message}`);
console.log(`Connection OK (${test.latencyMs}ms)`);

// Import from S3 and process
const keys = ["invoices/2026/inv-001.pdf", "invoices/2026/inv-002.pdf"];
const jobs = await client.processFromS3(conn.id, keys, { locale: "de" });

for (const job of jobs) {
  try {
    const done = await job.wait({ timeout: 300 });
    const ds = await done.dataset();
    if (ds) {
      const push = await ds.exportToS3(conn.id, "jsonl", "processed/");
      console.log(`  ✓ ${ds.name} → s3://${push.s3Key} (${push.sizeBytes} bytes)`);
    }
  } catch (err) {
    if (err instanceof JobFailedError) {
      console.error(`  ✗ job ${err.jobId} failed: ${err.failureReason}`);
    } else {
      throw err;
    }
  }
}
