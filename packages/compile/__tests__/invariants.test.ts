import { describe, expect, it } from "vitest";
import { compileDataset } from "../src/compile.js";
import { computeGaps, projectGaps } from "../src/gaps.js";
import type { Gap } from "../src/gaps.js";
import type { RenderModel } from "../src/render-model.js";
import { ds } from "./helpers.js";

/**
 * Invariant 2: gaps survive lens changes.
 *
 * If a lens can hide a gap the audit grid found, the lens's mapping is wrong. A gap is a fact
 * about a stack and never depends on the lens; a lens only decides where it is drawn. So for any
 * stack, every lens must show every gap, either in zones or in its rail, and hide none.
 */
const model: RenderModel = compileDataset(ds);
const spine = model.capabilities.filter((c) => c.kind === "spine").map((c) => c.id);
const selectable = model.tools.filter((t) => t.kind !== "portfolio").map((t) => t.id);

const STACKS: { name: string; tools: string[]; needs?: string[] }[] = [
  { name: "nothing selected", tools: [] },
  { name: "a single object store", tools: ["aws-s3"] },
  { name: "dbt OSS and Postgres", tools: ["dbt-core", "postgres"] },
  { name: "Databricks, whole", tools: ["databricks"] },
  { name: "dbt platform on Databricks", tools: ["dbt-platform", "databricks"] },
  { name: "a hand-built AWS lake", tools: ["aws-s3", "aws-glue", "aws-athena", "aws-lake-formation"] },
  { name: "bands only", tools: ["aws-lake-formation", "ssms"] },
  { name: "needs what medallion cannot place", tools: ["postgres"], needs: ["ingest.reverse-etl", "ingest.cdc"] },
  { name: "needs a capability only a higher plan gives", tools: ["dbt-platform-services"], needs: ["orchestrate.dependency-dag"] },
  { name: "needs everything", tools: ["dbt-core"], needs: spine },
];

const visibleIds = (lensId: string, gaps: Gap[]): string[] => {
  const v = projectGaps(model, lensId, gaps);
  return [...v.placed.map((p) => p.gap.id), ...v.rail.map((g) => g.id)].sort();
};

describe.each(model.lenses.map((l) => l.id))("lens %s", (lensId) => {
  const lens = model.lenses.find((l) => l.id === lensId)!;

  describe.each(STACKS)("stack: $name", ({ tools, needs }) => {
    const { gaps } = computeGaps(model, { tools, needs });
    const view = projectGaps(model, lensId, gaps);

    it("hides no gap", () => {
      expect(view.dropped).toEqual([]);
    });

    it("shows every gap exactly once, in zones or in the rail", () => {
      expect(visibleIds(lensId, gaps)).toEqual(gaps.map((g) => g.id).sort());
    });

    it("shows the same gaps the audit grid found", () => {
      expect(visibleIds(lensId, gaps)).toEqual(visibleIds("grid", gaps));
    });

    it("places gaps only in zones the lens has", () => {
      for (const p of view.placed) {
        expect(p.zones.length).toBeGreaterThan(0);
        for (const z of p.zones) expect(lens.zones).toContain(z);
      }
    });

    it("keeps the ranking: it neither reorders nor invents gaps", () => {
      const rank = new Map(gaps.map((g, i) => [g.id, i]));
      const shown = [...view.placed.map((p) => p.gap), ...view.rail];
      for (const g of shown) expect(rank.has(g.id)).toBe(true);
      const placedOrder = view.placed.map((p) => rank.get(p.gap.id)!);
      expect(placedOrder).toEqual([...placedOrder].sort((a, b) => a - b));
    });
  });

  it("hides no gap for any single tool with every spine capability needed: the worst case", () => {
    for (const tool of selectable) {
      const { gaps } = computeGaps(model, { tools: [tool], needs: spine });
      expect(projectGaps(model, lensId, gaps).dropped, tool).toEqual([]);
    }
  });
});

describe("where the medallion lens shows what it cannot place", () => {
  const { gaps } = computeGaps(model, { tools: ["postgres"], needs: ["ingest.reverse-etl", "ingest.cdc"] });
  const medallion = projectGaps(model, "medallion", gaps);
  const grid = projectGaps(model, "grid", gaps);

  it("puts reverse ETL in the rail, because medallion has no zone for it", () => {
    expect(medallion.rail.map((g) => g.id)).toContain("needed-capability:ingest.reverse-etl@ingest");
    expect(grid.rail).toEqual([]);
  });

  it("puts in the rail only gaps at cells medallion leaves unmapped", () => {
    // Reverse ETL, and cost visibility at every stage the stack occupies.
    for (const g of medallion.rail) {
      expect(g.capability === "ingest.reverse-etl" || g.capability === "observe.cost-visibility", g.id).toBe(true);
    }
    expect(medallion.rail.length).toBeGreaterThan(1);
  });

  it("still draws it in the grid, so the grid and medallion agree on what is missing", () => {
    expect(grid.placed.find((p) => p.gap.id === "needed-capability:ingest.reverse-etl@ingest")!.zones).toEqual(["ingest"]);
  });

  it("draws an empty stage where the lens puts that stage", () => {
    const empty = projectGaps(model, "medallion", computeGaps(model, { tools: [] }).gaps);
    const zones = (id: string) => empty.placed.find((p) => p.gap.id === id)!.zones;
    expect(zones("empty-stage:serve")).toEqual(["consume"]);
    expect(zones("empty-stage:ingest")).toEqual(["source", "bronze"]);
    expect(zones("empty-stage:orchestrate")).toEqual(["source", "bronze", "silver", "gold", "consume"]);
  });
});

describe("the invariant can fail", () => {
  it("catches a lens that drops what it cannot place", () => {
    const broken = structuredClone(model);
    broken.lenses.find((l) => l.id === "medallion")!.unmapped = "drop";
    const { gaps } = computeGaps(broken, { tools: ["postgres"], needs: ["ingest.reverse-etl"] });
    const view = projectGaps(broken, "medallion", gaps);
    expect(view.dropped.map((g) => g.id)).toContain("needed-capability:ingest.reverse-etl@ingest");
    expect(view.rail).toEqual([]); // nothing is railed once the policy is drop
    expect(view.placed.length + view.rail.length + view.dropped.length).toBe(gaps.length);
  });

  it("catches a lens that drops an unmapped band gap", () => {
    const broken = structuredClone(model);
    broken.lenses.find((l) => l.id === "medallion")!.unmapped = "drop";
    const { gaps } = computeGaps(broken, { tools: ["aws-s3"] });
    const hidden = projectGaps(broken, "medallion", gaps).dropped.map((g) => g.id);
    expect(hidden).toContain("band:observe.cost-visibility@store");
  });

  it("refuses a lens it does not know", () => {
    expect(() => projectGaps(model, "kappa", [])).toThrow(/unknown lens "kappa"/);
  });
});
