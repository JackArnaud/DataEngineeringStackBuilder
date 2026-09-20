import { prefixOf } from "./taxonomy.js";
import type { BandScore, Tool } from "./types.js";

/** Stages in which the tool has spine coverage, in first-seen order. */
export function occupiedStages(tool: Tool): string[] {
  const stages = new Set<string>();
  for (const id of Object.keys(tool.coverage ?? {})) stages.add(prefixOf(id));
  return [...stages];
}

/**
 * Stages a band score applies to. An explicit scope wins; otherwise it defaults to the
 * stages the tool occupies. The schema guarantees a bands-only tool has an explicit scope,
 * so the default never resolves to an empty list for a valid record.
 */
export function bandStages(tool: Tool, entry: BandScore): string[] {
  return entry.scope ?? occupiedStages(tool);
}
