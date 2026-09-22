// Prints every record scored on one capability, so a review pass can go capability-by-capability
// instead of vendor-by-vendor. Usage: tsx packages/compile/scripts/audit-sheet.ts govern.masking
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const dataDir = path.join(root, "data", "tools");

const capability = process.argv[2];
if (!capability) {
  console.error("Usage: tsx packages/compile/scripts/audit-sheet.ts <capability-id>");
  process.exit(1);
}

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.name.endsWith(".json") && !entry.name.endsWith(".schema.json")) yield full;
  }
}

interface Row {
  tool: string;
  file: string;
  level: number;
  delivery: string;
  constraint?: string[];
  scope?: string[];
  note: string;
  source: string;
}

const rows: Row[] = [];
for await (const file of walk(dataDir)) {
  const record = JSON.parse(await readFile(file, "utf-8"));
  const rel = path.relative(root, file).replace(/\\/g, "/");
  const fromCoverage = record.coverage?.[capability];
  if (fromCoverage) rows.push({ tool: record.id, file: rel, ...fromCoverage });
  const fromBand = (record.bands ?? []).find((b: { band: string }) => b.band === capability);
  if (fromBand) rows.push({ tool: record.id, file: rel, level: fromBand.level, delivery: fromBand.delivery, constraint: fromBand.constraint, scope: fromBand.scope, note: fromBand.note, source: fromBand.source });
}

rows.sort((a, b) => a.tool.localeCompare(b.tool));
console.log(`${capability}: ${rows.length} record(s)\n`);
for (const r of rows) {
  console.log(`## ${r.tool}  (${r.file})`);
  console.log(`level ${r.level} · ${r.delivery}${r.constraint ? ` · constraint: ${r.constraint.join(", ")}` : ""}${r.scope ? ` · scope: ${r.scope.join(", ")}` : ""}`);
  console.log(`note:   ${r.note}`);
  console.log(`source: ${r.source}`);
  console.log("");
}
