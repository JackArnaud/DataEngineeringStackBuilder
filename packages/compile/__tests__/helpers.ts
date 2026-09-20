import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDataset } from "../src/dataset.js";
import { buildCells, contributionsOf } from "../src/derive.js";
import type { Cell } from "../src/derive.js";
import type { Derivation, Lens, Taxonomy, ToolRecord } from "../src/types.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Json = Record<string, any>;

export const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../data");
export const ds = loadDataset(dataDir);
export const taxonomy = ds.taxonomy!.data as Taxonomy;
export const derivation = ds.derivation!.data as Derivation;
export const lens = (id: string): Lens => {
  const found = ds.lenses.find((l) => (l.data as Lens).id === id);
  if (!found) throw new Error(`no lens ${id}`);
  return found.data as Lens;
};

export const SRC = "https://example.com/x";
export const sc = (level: number, delivery = "native", extra: Json = {}): Json => ({
  level,
  delivery,
  note: "Fixture note for tests.",
  source: SRC,
  ...extra,
});

/** Cells for one tool defined inline, for tests that only need the derived shape. */
export function cellsOf(coverage: Json, bands: Json[] = []): Cell[] {
  const record = {
    id: "t",
    name: "t",
    kind: "tool",
    vendor: "V",
    license: "open-source",
    deployment: ["saas"],
    pricing_model: "free",
    taxonomy_version: "1.0.0",
    updated: "2026-09-20",
    ...(Object.keys(coverage).length ? { coverage } : {}),
    ...(bands.length ? { bands } : {}),
  } as unknown as ToolRecord;
  return buildCells(contributionsOf("t", new Map([["t", record]])));
}
