import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadDataset } from "../src/dataset.js";
import { allCells, place } from "../src/lens.js";
import type { Lens, Taxonomy } from "../src/types.js";

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../data");
const ds = loadDataset(dataDir);
const taxonomy = ds.taxonomy!.data as Taxonomy;
const lens = (id: string) => ds.lenses.find((l) => (l.data as Lens).id === id)!.data as Lens;
const medallion = lens("medallion");
const grid = lens("grid");

describe("cells", () => {
  it("gives a spine capability one cell and a band capability one per stage", () => {
    const cells = allCells(taxonomy);
    const spine = cells.filter((c) => c.capability === "transform.sql-transform");
    const band = cells.filter((c) => c.capability === "quality.tests");
    expect(spine).toEqual([{ capability: "transform.sql-transform", stage: "transform" }]);
    expect(band.map((c) => c.stage)).toEqual(taxonomy.stages.map((s) => s.id));
  });
});

describe("placement in medallion", () => {
  it("uses the stage default when nothing more specific applies", () => {
    expect(place(medallion, { capability: "transform.sql-transform", stage: "transform" })).toEqual({ kind: "zones", zones: ["silver", "gold"] });
  });

  it("gives a source capability the source zone", () => {
    expect(place(medallion, { capability: "source.oltp", stage: "source" })).toEqual({ kind: "zones", zones: ["source"] });
  });

  it("lets a capability override beat its stage default", () => {
    expect(place(medallion, { capability: "transform.stream-processing", stage: "transform" })).toEqual({ kind: "zones", zones: ["bronze", "silver"] });
  });

  it("expands 'all' to every zone", () => {
    expect(place(medallion, { capability: "orchestrate.scheduling", stage: "orchestrate" })).toEqual({ kind: "zones", zones: medallion.zones });
  });

  it("places a band cell by the stage it is scored at", () => {
    expect(place(medallion, { capability: "govern.access-control", stage: "store" })).toEqual({ kind: "zones", zones: ["bronze", "silver", "gold"] });
    expect(place(medallion, { capability: "govern.access-control", stage: "serve" })).toEqual({ kind: "zones", zones: ["consume"] });
  });

  it("marks capabilities with no honest home as unmapped, at every stage", () => {
    expect(place(medallion, { capability: "ingest.reverse-etl", stage: "ingest" })).toEqual({ kind: "unmapped" });
    for (const s of taxonomy.stages) {
      expect(place(medallion, { capability: "observe.cost-visibility", stage: s.id })).toEqual({ kind: "unmapped" });
    }
  });

  it("keeps unmapped visible: the lens rails them rather than dropping them", () => {
    expect(medallion.unmapped).toBe("rail");
  });
});

describe("pattern precedence", () => {
  const withOverrides = (overrides: Lens["overrides"]): Lens => ({ ...medallion, overrides });

  it("prefers an exact match over a wildcard, regardless of order", () => {
    const l = withOverrides([
      { match: "transform.*", zones: ["bronze"] },
      { match: "transform.sql-transform", zones: ["gold"] },
    ]);
    expect(place(l, { capability: "transform.sql-transform", stage: "transform" })).toEqual({ kind: "zones", zones: ["gold"] });
    expect(place(l, { capability: "transform.code-transform", stage: "transform" })).toEqual({ kind: "zones", zones: ["bronze"] });
  });

  it("returns undefined when a stage has no default and nothing overrides it", () => {
    const { serve: _serve, ...defaults } = medallion.defaults;
    expect(place({ ...medallion, defaults }, { capability: "serve.bi-viz", stage: "serve" })).toBeUndefined();
  });
});

describe("the audit grid", () => {
  it("places every cell in exactly one column, its own stage", () => {
    for (const cell of allCells(taxonomy)) {
      expect(place(grid, cell)).toEqual({ kind: "zones", zones: [cell.stage] });
    }
  });
});
