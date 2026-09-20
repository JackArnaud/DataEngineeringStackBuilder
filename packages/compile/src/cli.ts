// npm run validate [-- --strict] [-- --data <dir>]
// Exits 1 on any error. With --strict, warnings (needs_review, deprecated IDs, ...) fail too.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDataset } from "./dataset.js";
import type { Issue } from "./types.js";
import { validateDataset } from "./validate.js";

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const dataFlag = args.indexOf("--data");
const dataDir = path.resolve(
  dataFlag >= 0 && args[dataFlag + 1]
    ? args[dataFlag + 1]!
    : path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../data"),
);

const ds = loadDataset(dataDir);
const issues = validateDataset(ds);
const errors = issues.filter((i) => i.severity === "error");
const warnings = issues.filter((i) => i.severity === "warning");

function print(list: Issue[], label: string): void {
  if (list.length === 0) return;
  console.log(`\n${label} (${list.length})`);
  const byFile = new Map<string, Issue[]>();
  for (const i of list) byFile.set(i.file, [...(byFile.get(i.file) ?? []), i]);
  for (const [file, group] of byFile) {
    console.log(`  ${file}`);
    for (const i of group) console.log(`    ${i.path || "/"}  [${i.code}]  ${i.message}`);
  }
}

print(errors, "Errors");
print(warnings, "Warnings");

const needsReview = warnings.filter((w) => w.code === "needs-review").length;
console.log(
  `\n${ds.tools.length} tool records, ${ds.lenses.length} lenses: ` +
    `${errors.length} errors, ${warnings.length} warnings` +
    (needsReview ? ` (${needsReview} records need review)` : ""),
);

process.exit(errors.length > 0 || (strict && warnings.length > 0) ? 1 : 0);
