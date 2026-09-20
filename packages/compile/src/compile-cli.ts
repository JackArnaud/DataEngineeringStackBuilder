// npm run compile [-- --out <file>] [-- --data <dir>]
// Validates the dataset, then writes the render model the site reads as static JSON.
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileDataset, CompileError } from "./compile.js";
import { loadDataset } from "./dataset.js";
import { stableStringify } from "./stable.js";

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const dataDir = path.resolve(flag("--data") ?? path.join(root, "data"));
// The site reads this file as static JSON, so it lands where the site serves static files from.
const out = path.resolve(flag("--out") ?? path.join(root, "apps/web/public/render-model.json"));

try {
  const model = compileDataset(loadDataset(dataDir));
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, stableStringify(model));
  const kb = (statSync(out).size / 1024).toFixed(0);
  console.log(
    `Compiled ${model.tools.length} tools across ${model.lenses.length} lenses ` +
      `(${model.capabilities.length} capabilities) to ${path.relative(process.cwd(), out)}, ${kb} KB`,
  );
} catch (err) {
  if (!(err instanceof CompileError)) throw err;
  console.error(`${err.message}:`);
  for (const i of err.issues) console.error(`  ${i.file} ${i.path || "/"}  [${i.code}]  ${i.message}`);
  process.exit(1);
}
