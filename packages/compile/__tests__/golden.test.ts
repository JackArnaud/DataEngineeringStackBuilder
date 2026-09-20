import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compileDataset } from "../src/compile.js";
import type { Dataset } from "../src/dataset.js";
import { computeGaps, projectGaps } from "../src/gaps.js";
import { stableStringify } from "../src/stable.js";
import { validateDataset } from "../src/validate.js";
import { fixtures } from "./golden/fixtures.js";
import { ds } from "./helpers.js";
import type { Json } from "./helpers.js";

/**
 * Golden-file test on the render model.
 *
 * The fixed records in golden/fixtures.ts are compiled with the REAL taxonomy, lenses and
 * derivation rules, and the result is compared with golden/expected/render-model.json. A change
 * to any of those that reshuffles an existing visual fails here, loudly, with a diff.
 *
 * When a change is intended, regenerate and review the diff in git:
 *   UPDATE_GOLDEN=1 npm test
 */
const goldenFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "golden/expected/render-model.json");

const golden: Dataset = {
  ...ds,
  tools: fixtures.map((data) => ({ file: `golden/records/${(data as Json).id}.json`, data })),
};

describe("golden render model", () => {
  it("compiles from fixture records that are themselves valid", () => {
    expect(validateDataset(golden)).toEqual([]);
  });

  it("matches the checked-in expected output", () => {
    const actual = stableStringify(compileDataset(golden));

    if (process.env.UPDATE_GOLDEN) {
      mkdirSync(path.dirname(goldenFile), { recursive: true });
      writeFileSync(goldenFile, actual);
    }
    if (!existsSync(goldenFile)) throw new Error("No golden file yet. Run: UPDATE_GOLDEN=1 npm test");

    expect(JSON.parse(actual)).toEqual(JSON.parse(readFileSync(goldenFile, "utf8")));
  });

  describe("fails loudly when the model shifts underneath it", () => {
    const expected = JSON.parse(existsSync(goldenFile) ? readFileSync(goldenFile, "utf8") : "null");
    const compileWith = (edit: (d: Dataset) => Dataset) => JSON.parse(stableStringify(compileDataset(edit(structuredClone(golden)))));

    it("when a lens moves a stage", () => {
      const changed = compileWith((d) => {
        const medallion = d.lenses.find((l) => (l.data as Json).id === "medallion")!;
        (medallion.data as Json).defaults.transform = ["gold"];
        return d;
      });
      expect(changed).not.toEqual(expected);
      expect(changed.lenses.find((l: Json) => l.id === "medallion").tools["fx-modeller"].span).toEqual(["gold"]);
    });

    it("when a criticality weight changes", () => {
      const changed = compileWith((d) => {
        (d.taxonomy!.data as Json).criticality.bands.quality.stages.ingest = 2;
        return d;
      });
      expect(changed).not.toEqual(expected);
    });

    it("when a role rule changes", () => {
      const changed = compileWith((d) => {
        const rule = (d.derivation!.data as Json).role_affinity.find((r: Json) => r.match === "transform.*");
        rule.role = "engine";
        return d;
      });
      expect(changed.tools.find((t: Json) => t.id === "fx-modeller").role).toBe("engine");
    });

    it("when an archetype threshold changes", () => {
      const changed = compileWith((d) => {
        (d.derivation!.data as Json).archetype.end_to_end_min_stages = 2;
        return d;
      });
      expect(changed.tools.find((t: Json) => t.id === "fx-warehouse").archetype).toBe("end-to-end");
    });
  });
});

/**
 * Gaps for fixed stacks over the fixture records, and where each lens shows them. Pins the
 * ranking and the lens placement, which a taxonomy or lens change could silently reshuffle.
 */
const goldenGapsFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "golden/expected/gaps.json");
const GOLDEN_STACKS: { name: string; tools: string[]; needs?: string[] }[] = [
  { name: "nothing selected", tools: [] },
  { name: "a warehouse that needs CDC", tools: ["fx-warehouse"], needs: ["ingest.cdc"] },
  { name: "the whole suite", tools: ["fx-suite"] },
  { name: "a mover and an orchestrator that need an object store", tools: ["fx-mover", "fx-orchestrator"], needs: ["store.object-store"] },
];

function gapsSnapshot(): unknown {
  const model = compileDataset(golden);
  return Object.fromEntries(
    GOLDEN_STACKS.map((stack) => {
      const report = computeGaps(model, stack);
      const lenses = Object.fromEntries(
        model.lenses.map((lens) => {
          const view = projectGaps(model, lens.id, report.gaps);
          return [lens.id, { placed: view.placed.map((p) => ({ id: p.gap.id, zones: p.zones })), rail: view.rail.map((g) => g.id), dropped: view.dropped.map((g) => g.id) }];
        }),
      );
      return [stack.name, { stack, gaps: report.gaps, stages: report.stages, lenses }];
    }),
  );
}

describe("golden gaps", () => {
  it("match the checked-in expected gaps for the fixed stacks", () => {
    const actual = stableStringify(gapsSnapshot());
    if (process.env.UPDATE_GOLDEN) {
      mkdirSync(path.dirname(goldenGapsFile), { recursive: true });
      writeFileSync(goldenGapsFile, actual);
    }
    if (!existsSync(goldenGapsFile)) throw new Error("No golden gaps file yet. Run: UPDATE_GOLDEN=1 npm test");
    expect(JSON.parse(actual)).toEqual(JSON.parse(readFileSync(goldenGapsFile, "utf8")));
  });

  it("hide nothing in any lens", () => {
    const snapshot = gapsSnapshot() as Record<string, { lenses: Record<string, { dropped: string[] }> }>;
    for (const stack of Object.values(snapshot)) for (const lens of Object.values(stack.lenses)) expect(lens.dropped).toEqual([]);
  });
});

describe("what the golden records pin down", () => {
  const model = JSON.parse(stableStringify(compileDataset(golden)));
  const tool = (id: string) => model.tools.find((t: Json) => t.id === id);
  const cell = (id: string, key: string) => tool(id).cells.find((c: Json) => c.key === key);
  const view = (lens: string, id: string) => model.lenses.find((l: Json) => l.id === lens).tools[id];

  it("derives a specialist, a stage platform and a bands-only sentinel", () => {
    expect(tool("fx-modeller")).toMatchObject({ archetype: "specialist", role: "modeller" });
    expect(tool("fx-mover")).toMatchObject({ archetype: "stage-platform", role: "mover" });
    expect(tool("fx-sentinel")).toMatchObject({ archetype: "specialist", role: "sentinel" });
  });

  it("ties two equal parts, and lets partner delivery beat community at level 1", () => {
    expect(cell("fx-suite", "transform.sql-transform@transform")).toMatchObject({ level: 3, delivery: "bundled", via: ["fx-alt", "fx-modeller"] });
    expect(cell("fx-suite", "transform.feature-eng@transform")).toMatchObject({ level: 1, delivery: "partner", via: ["fx-alt"] });
  });

  it("keeps the enterprise-tier masking as a conditional level over the unconstrained one", () => {
    const masking = cell("fx-suite", "govern.masking@store");
    expect(masking).toMatchObject({ level: 2, via: ["fx-catalog"] });
    expect(masking.conditional).toEqual([{ level: 3, delivery: "bundled", maturity: "ga", constraint: ["enterprise-tier"], via: ["fx-warehouse"] }]);
    expect(cell("fx-warehouse", "govern.masking@store")).toMatchObject({ level: 0 });
  });

  it("nests a bundle inside a portfolio without undoing the bundle's downgrade", () => {
    expect(cell("fx-cloud", "orchestrate.scheduling@orchestrate")).toMatchObject({ delivery: "bundled", via: ["fx-orchestrator"] });
    expect(cell("fx-cloud", "ingest.cdc@ingest")).toMatchObject({ delivery: "native", via: ["fx-mover"] });
  });

  it("applies a tool's own lens override in one lens and not the other", () => {
    expect(view("medallion", "fx-override")).toMatchObject({ span: ["gold"], overridden: true });
    expect(view("grid", "fx-override")).toMatchObject({ span: ["store"], overridden: false });
  });

  it("puts what medallion cannot place in the rail", () => {
    expect(view("medallion", "fx-mover").rail).toEqual(["ingest.reverse-etl@ingest"]);
    expect(view("medallion", "fx-sentinel").rail).toEqual(["observe.cost-visibility@store"]);
    expect(view("grid", "fx-mover").rail).toEqual([]);
  });

  it("carries a preview score through", () => {
    expect(cell("fx-sentinel", "observe.cost-visibility@store").maturity).toBe("preview");
  });
});
