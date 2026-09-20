export type { ToolRecord, Tool, Bundle, Portfolio, Score, BandScore } from "./generated/tool.js";
export type { Lens } from "./generated/lens.js";
export type { Taxonomy } from "./generated/taxonomy.js";
export type { DerivationRules as Derivation } from "./generated/derivation.js";

export type Severity = "error" | "warning";

/** One finding. `code` is stable and meant for tests and filtering; `message` is for people. */
export interface Issue {
  severity: Severity;
  code: string;
  /** Repo-relative path of the file the issue is in. */
  file: string;
  /** JSON-pointer-style location within the file, or "" for the whole file. */
  path: string;
  message: string;
}
