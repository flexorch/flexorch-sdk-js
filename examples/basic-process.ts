/**
 * Basic example: process a single document and export as JSONL.
 */
import { FlexOrchClient } from "flexorch-sdk";

const client = new FlexOrchClient(process.env["FLEXORCH_API_KEY"]);

const job = await client.process("contract.pdf", { locale: "tr" });
const done = await job.wait();

console.log(`Quality grade : ${done.qualityGrade}`);
console.log(`Quality score : ${done.qualityScore}`);

const dataset = await done.dataset();
if (dataset) {
  const bytes = await dataset.export("jsonl");
  await Bun.write("output.jsonl", bytes); // or: fs.writeFileSync("output.jsonl", bytes)
  console.log(`Exported ${dataset.rowCount} rows → output.jsonl`);
}
