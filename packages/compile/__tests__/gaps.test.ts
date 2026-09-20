import { describe, expect, it } from "vitest";
import { compileDataset } from "../src/compile.js";
import { computeGaps, NEEDED_CAPABILITY_CRITICALITY } from "../src/gaps.js";
import type { GapReport } from "../src/gaps.js";
import { ds } from "./helpers.js";

const model = compileDataset(ds);
const report = (tools: string[], needs?: string[]): GapReport => computeGaps(model, { tools, needs });
const ids = (r: GapReport) => r.gaps.map((g) => g.id);
const gap = (r: GapReport, id: string) => r.gaps.find((g) => g.id === id);
const stage = (r: GapReport, id: string) => r.stages.find((s) => s.stage === id)!;
const cell = (r: GapReport, key: string) => r.cells.find((c) => c.key === key);

describe("empty stages", () => {
  it("are all reported for an empty stack, ranked by the stage's own criticality", () => {
    expect(ids(report([]))).toEqual([
      "empty-stage:serve",
      "empty-stage:store",
      "empty-stage:ingest",
      "empty-stage:transform",
      "empty-stage:orchestrate",
    ]);
    expect(report([]).gaps.map((g) => g.criticality)).toEqual([5, 5, 4, 4, 3]);
  });

  it("never include source: the systems data comes from usually sit outside the stack", () => {
    expect(ids(report([]))).not.toContain("empty-stage:source");
    expect(model.stages.find((s) => s.id === "source")!.criticality).toBe(0);
  });

  it("disappear once any selected tool touches the stage", () => {
    const r = report(["aws-s3"]);
    expect(ids(r)).not.toContain("empty-stage:store");
    expect(ids(r)).toContain("empty-stage:serve");
  });

  it("count a stage covered only at level 1 as covered, and say how thin it is", () => {
    // Postgres reaches the store stage only through the pg_duckdb extension, at level 1.
    const r = report(["postgres"]);
    expect(ids(r)).not.toContain("empty-stage:store");
    expect(stage(r, "store")).toMatchObject({ best_level: 1, covered_by: ["postgres"] });
  });

  it("are filled by the union of tools: no single tool has to cover a stage", () => {
    const r = report(["aws-s3", "aws-athena"]);
    expect(stage(r, "serve").best_level).toBe(3);
    expect(ids(r)).not.toContain("empty-stage:serve");
  });

  it("are not filled by a bands-only tool, which does not occupy a stage", () => {
    const r = report(["aws-lake-formation"]);
    expect(r.stages.every((s) => s.best_level === 0)).toBe(true);
    expect(ids(r)).toHaveLength(5);
  });

  it("are not filled by a score that needs a higher plan", () => {
    // dbt platform services score the cross-project DAG only on Enterprise, but scheduling covers orchestrate.
    const r = report(["dbt-platform-services"]);
    expect(ids(r)).not.toContain("empty-stage:orchestrate");
    expect(cell(r, "orchestrate.dependency-dag@orchestrate")).toMatchObject({ level: 0 });
  });
});

describe("needed capabilities", () => {
  it("are gaps when the stack lacks them, ranked above everything a default would flag", () => {
    const r = report(["postgres"], ["ingest.cdc"]);
    expect(r.gaps[0]).toMatchObject({ id: "needed-capability:ingest.cdc@ingest", kind: "needed-capability", criticality: NEEDED_CAPABILITY_CRITICALITY });
    // The stage is empty too, so both are reported: the need is specific information.
    expect(ids(r)).toContain("empty-stage:ingest");
  });

  it("are not gaps when a selected tool provides them", () => {
    expect(ids(report(["aws-dms"], ["ingest.cdc"]))).not.toContain("needed-capability:ingest.cdc@ingest");
  });

  it("are covered at level 1 already", () => {
    // pg_cron gives Postgres scheduling as a community extension, at level 1.
    expect(cell(report(["postgres"]), "orchestrate.scheduling@orchestrate")).toMatchObject({ level: 1, delivery: "community" });
    expect(ids(report(["postgres"], ["orchestrate.scheduling"]))).not.toContain("needed-capability:orchestrate.scheduling@orchestrate");
  });

  it("are not reported at all when nobody asked", () => {
    expect(report(["postgres"]).gaps.filter((g) => g.kind === "needed-capability")).toEqual([]);
  });

  it("ignore repetition and order", () => {
    const a = report(["postgres"], ["ingest.cdc", "ingest.reverse-etl"]);
    const b = report(["postgres"], ["ingest.reverse-etl", "ingest.cdc", "ingest.cdc"]);
    expect(b).toEqual(a);
  });

  it("carry the remedy when a higher plan would provide them", () => {
    const g = gap(report(["dbt-platform-services"], ["orchestrate.dependency-dag"]), "needed-capability:orchestrate.dependency-dag@orchestrate")!;
    expect(g.conditional).toEqual([{ level: 3, delivery: "native", maturity: "ga", constraint: ["enterprise-tier"], via: ["dbt-platform-services"] }]);
  });

  it("must be spine capabilities that exist", () => {
    expect(() => report(["postgres"], ["govern.masking"])).toThrow(/not a spine capability/);
    expect(() => report(["postgres"], ["ingest.nonsense"])).toThrow(/not a spine capability/);
  });
});

describe("band gaps", () => {
  it("only appear at stages the stack occupies: an empty stage is reported once, not as a dozen gaps", () => {
    const r = report(["aws-s3"]);
    const stages = new Set(r.gaps.filter((g) => g.kind === "band").map((g) => g.stage));
    expect([...stages].sort()).toEqual(["source", "store"]);
  });

  it("appear for a capability the stack lacks, ranked by the cell's criticality", () => {
    const g = gap(report(["aws-s3"]), "band:govern.masking@store")!;
    expect(g).toMatchObject({ kind: "band", stage: "store", capability: "govern.masking", criticality: 5 });
  });

  it("do not appear for a capability a selected tool provides, even at level 2", () => {
    expect(ids(report(["aws-s3"]))).not.toContain("band:govern.access-control@store");
  });

  it("are closed by another tool in the stack, not only the tool that opened the stage", () => {
    const r = report(["aws-s3", "aws-lake-formation"]);
    expect(cell(r, "govern.access-control@store")).toMatchObject({ level: 3, via: ["aws-lake-formation"] });
    expect(ids(r)).not.toContain("band:govern.access-control@store");
    expect(ids(r)).not.toContain("band:govern.catalog@store");
  });

  it("count level 1 as covered", () => {
    // Anonymizer gives Postgres masking at level 1.
    expect(cell(report(["postgres"]), "govern.masking@store")).toMatchObject({ level: 1 });
    expect(ids(report(["postgres"]))).not.toContain("band:govern.masking@store");
  });

  it("never appear where criticality is 0, which means not applicable", () => {
    const r = report(["databricks-workflows"]);
    expect(stage(r, "orchestrate").best_level).toBeGreaterThan(0);
    expect(ids(r)).not.toContain("band:govern.masking@orchestrate");
    expect(r.gaps.every((g) => g.criticality > 0)).toBe(true);
  });

  it("use the resolved criticality, including a capability override", () => {
    const g = gap(report(["databricks-workflows"]), "band:observe.lineage@orchestrate")!;
    expect(g.criticality).toBe(2); // the band default at orchestrate is 5
  });

});

describe("ranking", () => {
  const r = report(["postgres"], ["ingest.cdc", "ingest.reverse-etl"]);
  const kindOrder = { "needed-capability": 0, "empty-stage": 1, band: 2 };

  it("orders by criticality, then kind, then id", () => {
    for (let i = 1; i < r.gaps.length; i++) {
      const a = r.gaps[i - 1]!;
      const b = r.gaps[i]!;
      const ordered =
        a.criticality > b.criticality ||
        (a.criticality === b.criticality && (kindOrder[a.kind] < kindOrder[b.kind] || (kindOrder[a.kind] === kindOrder[b.kind] && a.id < b.id)));
      expect(ordered, `${a.id} before ${b.id}`).toBe(true);
    }
  });

  it("has unique ids", () => {
    expect(new Set(ids(r)).size).toBe(r.gaps.length);
  });

  it("does not depend on the order or repetition of the selection", () => {
    expect(report(["dbt-core", "postgres", "aws-s3"])).toEqual(report(["aws-s3", "postgres", "dbt-core", "postgres"]));
  });
});

describe("how the stack covers each cell", () => {
  it("takes the best level any selected tool reaches, with every tool that ties named", () => {
    const r = report(["databricks-sql", "aws-redshift"]);
    expect(cell(r, "store.warehouse@store")).toMatchObject({ level: 3, delivery: "native", via: ["aws-redshift", "databricks-sql"] });
  });

  it("prefers native over bundled at the same level", () => {
    // Inside the Databricks bundle the warehouse is bundled; Redshift's is native.
    const r = report(["databricks", "aws-redshift"]);
    expect(cell(r, "store.warehouse@store")).toMatchObject({ level: 3, delivery: "native", via: ["aws-redshift"] });
  });

  it("reports which selected tools cover each stage", () => {
    expect(stage(report(["aws-s3", "aws-athena"]), "store").covered_by).toEqual(["aws-s3"]);
    expect(stage(report(["aws-s3", "aws-athena"]), "serve").covered_by).toEqual(["aws-athena"]);
  });

  it("keeps a higher plan's level separate from the base", () => {
    const c = cell(report(["dbt-platform-services"]), "orchestrate.dependency-dag@orchestrate")!;
    expect(c.level).toBe(0);
    expect(c.conditional).toHaveLength(1);
  });

  it("still offers a higher plan's level when it beats what the stack has", () => {
    // dbt OSS gives the DAG at level 2; the platform's Enterprise level 3 is an upgrade over it.
    const c = cell(report(["dbt-core", "dbt-platform-services"]), "orchestrate.dependency-dag@orchestrate")!;
    expect(c.level).toBe(2);
    expect(c.conditional.map((x) => x.level)).toEqual([3]);
  });

  it("drops a higher plan's level once the stack reaches it without one", () => {
    // Lakeflow Jobs gives the DAG at level 3 with no constraint, so the Enterprise level is no upgrade.
    const c = cell(report(["dbt-platform-services", "databricks-workflows"]), "orchestrate.dependency-dag@orchestrate")!;
    expect(c).toMatchObject({ level: 3, via: ["databricks-workflows"], conditional: [] });
  });
});

describe("selection", () => {
  it("accepts bundles, which are one purchase", () => {
    expect(stage(report(["databricks"]), "serve").best_level).toBe(3);
  });

  it("refuses a portfolio: pick the services instead", () => {
    expect(() => report(["aws"])).toThrow(/portfolio; select the services/);
  });

  it("refuses an unknown tool", () => {
    expect(() => report(["nope"])).toThrow(/unknown tool "nope"/);
  });
});
