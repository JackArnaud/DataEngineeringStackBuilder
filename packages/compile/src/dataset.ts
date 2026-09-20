import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Issue } from "./types.js";

export interface SourceFile {
  /** Repo-relative label, e.g. data/tools/dbt-core.json. */
  file: string;
  data: unknown;
}

/** Everything the validator needs, separated from disk so tests can build one in memory. */
export interface Dataset {
  schemas: { tool: object; lens: object; taxonomy: object; derivation: object };
  taxonomy: SourceFile | undefined;
  derivation: SourceFile | undefined;
  lenses: SourceFile[];
  tools: SourceFile[];
  /** Problems found while reading (missing file, malformed JSON). */
  loadIssues: Issue[];
}

function readJson(abs: string, label: string, issues: Issue[]): SourceFile | undefined {
  try {
    return { file: label, data: JSON.parse(readFileSync(abs, "utf8")) };
  } catch (err) {
    const missing = (err as NodeJS.ErrnoException).code === "ENOENT";
    issues.push({
      severity: "error",
      code: missing ? "file-missing" : "json-parse",
      file: label,
      path: "",
      message: missing ? "File not found" : `Could not read as JSON: ${(err as Error).message}`,
    });
    return undefined;
  }
}

function jsonFilesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".json"))
    .map((e) => path.join(e.parentPath, e.name))
    .sort();
}

export function loadDataset(dataDir: string): Dataset {
  const loadIssues: Issue[] = [];
  const label = (abs: string) => `${path.basename(dataDir)}/${path.relative(dataDir, abs).split(path.sep).join("/")}`;
  const read = (rel: string) => readJson(path.join(dataDir, rel), `${path.basename(dataDir)}/${rel}`, loadIssues);
  const readAll = (subdir: string) =>
    jsonFilesUnder(path.join(dataDir, subdir))
      .map((abs) => readJson(abs, label(abs), loadIssues))
      .filter((f): f is SourceFile => f !== undefined);

  const schema = (name: string): object => (read(`${name}.schema.json`)?.data as object | undefined) ?? {};

  return {
    schemas: { tool: schema("tool"), lens: schema("lens"), taxonomy: schema("taxonomy"), derivation: schema("derivation") },
    taxonomy: read("taxonomy.json"),
    derivation: read("derivation.json"),
    lenses: readAll("lenses"),
    tools: readAll("tools"),
    loadIssues,
  };
}
