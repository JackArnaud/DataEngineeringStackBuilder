// Generates TypeScript types from the JSON Schemas so the code that reads records
// can't drift from the schema that validates them. Output is gitignored.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileFromFile } from "json-schema-to-typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const outDir = path.join(root, "packages/compile/src/generated");

const schemas = ["tool", "lens", "taxonomy", "derivation"] as const;

await mkdir(outDir, { recursive: true });
for (const name of schemas) {
  const ts = await compileFromFile(path.join(root, "data", `${name}.schema.json`), {
    additionalProperties: false,
    bannerComment: `/* Generated from data/${name}.schema.json by npm run gen:types. Do not edit. */`,
    format: false,
    style: { singleQuote: false },
  });
  await writeFile(path.join(outDir, `${name}.ts`), ts);
}
