import { describe, expect, it } from "vitest";
import { compileDataset, CompileError } from "../src/compile.js";
import type { RenderModel, RenderTool } from "../src/render-model.js";
import { stableStringify } from "../src/stable.js";
import { derivation, ds } from "./helpers.js";

const model: RenderModel = compileDataset(ds);
const tool = (id: string): RenderTool => {
  const t = model.tools.find((x) => x.id === id);
  if (!t) throw new Error(`no tool ${id}`);
  return t;
};
const cell = (id: string, key: string) => {
  const c = tool(id).cells.find((x) => x.key === key);
  if (!c) throw new Error(`no cell ${key} on ${id}`);
  return c;
};
const view = (lensId: string, toolId: string) => model.lenses.find((l) => l.id === lensId)!.tools[toolId]!;

describe("the render model of the real dataset", () => {
  it("has the expected envelope", () => {
    expect(model).toMatchObject({ format: "render-model", format_version: 1, taxonomy_version: "1.0.1", derivation_version: "1.0.0" });
    expect(model.stages.map((s) => s.id)).toEqual(["source", "ingest", "store", "transform", "orchestrate", "serve"]);
    expect(model.stages.map((s) => s.criticality)).toEqual([0, 4, 5, 4, 3, 5]);
    expect(model.bands.map((b) => b.id)).toEqual(["govern", "quality", "observe", "platform"]);
    expect(model.capabilities).toHaveLength(38);
    expect(model.tools).toHaveLength(ds.tools.length);
    expect(model.lenses.map((l) => l.id)).toEqual(["grid", "medallion"]);
  });

  it("carries labels the site needs without going back to the taxonomy", () => {
    expect(model.capabilities.find((c) => c.id === "govern.masking")).toMatchObject({ id: "govern.masking", name: "Masking", kind: "band", parent: "govern", status: "active" });
    expect(model.capabilities.find((c) => c.id === "govern.masking")!.description.length).toBeGreaterThan(10);
    expect(model.roles.map((r) => r.id)).toEqual(derivation.roles.map((r) => r.id));
    expect(model.stages.every((s) => s.rationale.length > 10)).toBe(true);
    expect(model.bands.every((b) => b.rationale.length > 10)).toBe(true);
    expect(Object.keys(model.criticality_rationale).sort()).toEqual(Object.keys(model.criticality).sort());
    // A capability override's own rationale wins over the band's.
    expect(model.criticality_rationale["observe.lineage@orchestrate"]).toMatch(/scheduler/);
    expect(model.capabilities.find((c) => c.id === "store.warehouse")).toMatchObject({ kind: "spine", parent: "store" });
  });

  it("resolves criticality for every band cell, applying capability overrides", () => {
    expect(Object.keys(model.criticality)).toHaveLength(13 * 6);
    expect(model.criticality["quality.tests@ingest"]).toBe(5);
    expect(model.criticality["observe.cost-visibility@orchestrate"]).toBe(1); // override of the band default (5)
    expect(model.criticality["govern.masking@orchestrate"]).toBe(0); // not applicable
    expect(model.criticality["observe.lineage@orchestrate"]).toBe(2); // override: monitoring, not lineage, matters here
    expect(Object.keys(model.criticality).some((k) => k.startsWith("store.warehouse"))).toBe(false);
  });

  it("puts dbt OSS where the brief said it would: a modeller spanning silver and gold", () => {
    expect(tool("dbt-core")).toMatchObject({ role: "modeller", archetype: "specialist", role_source: "derived" });
    expect(view("medallion", "dbt-core").span).toEqual(["silver", "gold"]);
  });

  it("places every tool in every lens", () => {
    for (const lens of model.lenses) expect(Object.keys(lens.tools).sort()).toEqual(model.tools.map((t) => t.id));
  });

  it("places every taxonomy cell in every lens, mapped or explicitly unmapped", () => {
    for (const lens of model.lenses) {
      expect(Object.keys(lens.placement)).toHaveLength(25 + 13 * 6);
      for (const p of Object.values(lens.placement)) expect(p === "unmapped" || (Array.isArray(p) && p.length > 0)).toBe(true);
    }
  });

  it("keeps the unmapped policy as rail, so nothing silently vanishes", () => {
    for (const lens of model.lenses) expect(lens.unmapped).toBe("rail");
    expect(model.lenses.find((l) => l.id === "medallion")!.placement["ingest.reverse-etl@ingest"]).toBe("unmapped");
  });

  it("places every stage in every lens, for showing a stage that is empty", () => {
    for (const lens of model.lenses) expect(Object.keys(lens.stage_placement)).toEqual(model.stages.map((s) => s.id));
    const medallion = model.lenses.find((l) => l.id === "medallion")!;
    expect(medallion.stage_placement.serve).toEqual(["consume"]);
    expect(medallion.stage_placement.orchestrate).toEqual(medallion.zones); // "all" is expanded
  });

  it("stamps every role from the closed vocabulary", () => {
    const vocabulary = derivation.roles.map((r) => r.id);
    for (const t of model.tools) {
      expect(vocabulary).toContain(t.role);
      expect(vocabulary).toContain(t.derived_role);
    }
  });

  it("flags no record for review while every record matches the taxonomy", () => {
    expect(model.tools.filter((t) => t.needs_review)).toEqual([]);
  });
});

describe("composites in the real dataset", () => {
  it("shows Databricks as end-to-end, with nothing it provides itself reading as native", () => {
    expect(tool("databricks")).toMatchObject({ kind: "bundle", archetype: "end-to-end" });
    const delivered = tool("databricks").cells.filter((c) => c.level > 0).map((c) => c.delivery);
    expect(delivered.length).toBeGreaterThan(20);
    expect(delivered).not.toContain("native");
  });

  it("leaves AWS delivery native: its parts are separate purchases", () => {
    expect(cell("aws", "store.object-store@store")).toMatchObject({ level: 3, delivery: "native", via: ["aws-s3"] });
  });

  it("points a composite's cells at leaf records, never at intermediate composites", () => {
    const kinds = new Map(model.tools.map((t) => [t.id, t.kind]));
    for (const id of ["databricks", "dbt-platform", "aws"]) {
      for (const c of tool(id).cells) for (const e of c.evidence) expect(kinds.get(e.tool), `${id} ${c.key} -> ${e.tool}`).toBe("tool");
    }
  });

  it("does not hand the dbt platform's Enterprise cross-project DAG to a Starter buyer", () => {
    const c = cell("dbt-platform", "orchestrate.dependency-dag@orchestrate");
    expect(c).toMatchObject({ level: 2, delivery: "bundled", via: ["dbt-core"] });
    expect(c.conditional).toEqual([
      { level: 3, delivery: "bundled", maturity: "ga", constraint: ["enterprise-tier"], via: ["dbt-platform-services"] },
    ]);
  });

  it("scores the part on its own the same way: no base level, only the conditional one", () => {
    const c = cell("dbt-platform-services", "orchestrate.dependency-dag@orchestrate");
    expect(c.level).toBe(0);
    expect(c.conditional).toHaveLength(1);
  });

  it("lets the platform outrank the open-source record where it is genuinely better", () => {
    expect(cell("dbt-core", "serve.semantic-layer@serve").level).toBe(2);
    expect(cell("dbt-platform", "serve.semantic-layer@serve")).toMatchObject({ level: 3, via: ["dbt-platform-services"] });
  });
});

describe("receipts: every cell clicks through to its scores", () => {
  const cells = model.tools.flatMap((t) => t.cells.map((c) => ({ tool: t.id, cell: c })));

  it("has evidence behind every cell, each with a note and an https source", () => {
    for (const { tool: id, cell: c } of cells) {
      expect(c.evidence.length, `${id} ${c.key}`).toBeGreaterThan(0);
      for (const e of c.evidence) {
        expect(e.note.length, `${id} ${c.key}`).toBeGreaterThanOrEqual(10);
        expect(e.source, `${id} ${c.key}`).toMatch(/^https:\/\//);
      }
    }
  });

  it("derives each base level from the evidence: the best unconstrained score, and nothing higher", () => {
    for (const { tool: id, cell: c } of cells) {
      const best = Math.max(0, ...c.evidence.filter((e) => !e.constraint).map((e) => e.level));
      expect(c.level, `${id} ${c.key}`).toBe(best);
    }
  });

  it("names as `via` only records that hold an unconstrained score at the base level", () => {
    for (const { tool: id, cell: c } of cells) {
      for (const v of c.via) {
        const holds = c.evidence.some((e) => e.tool === v && !e.constraint && e.level === c.level);
        expect(holds, `${id} ${c.key} via ${v}`).toBe(true);
      }
    }
  });

  it("never lists a conditional level at or below the base", () => {
    for (const { tool: id, cell: c } of cells) for (const cond of c.conditional) expect(cond.level, `${id} ${c.key}`).toBeGreaterThan(c.level);
  });
});

describe("determinism", () => {
  it("compiles the same bytes twice", () => {
    expect(stableStringify(compileDataset(ds))).toBe(stableStringify(model));
  });

  it("does not depend on the order files were read in", () => {
    const shuffled = { ...ds, tools: [...ds.tools].reverse(), lenses: [...ds.lenses].reverse() };
    expect(stableStringify(compileDataset(shuffled))).toBe(stableStringify(model));
  });
});

describe("refusing bad input", () => {
  it("does not compile a dataset that fails validation, and lists every error", () => {
    const bad = { ...ds, tools: [...ds.tools, { file: "data/tools/bad.json", data: { id: "bad", kind: "tool" } }] };
    expect(() => compileDataset(bad)).toThrow(CompileError);
    try {
      compileDataset(bad);
    } catch (err) {
      expect((err as CompileError).issues.every((i) => i.severity === "error")).toBe(true);
      expect((err as CompileError).issues.length).toBeGreaterThan(1);
    }
  });
});

describe("stableStringify", () => {
  it("sorts object keys at every depth and keeps array order", () => {
    expect(stableStringify({ b: 1, a: { d: [3, 1], c: 2 } }, 0)).toBe('{"a":{"c":2,"d":[3,1]},"b":1}\n');
  });

  it("drops undefined properties", () => {
    expect(stableStringify({ a: undefined, b: 1 }, 0)).toBe('{"b":1}\n');
  });
});
