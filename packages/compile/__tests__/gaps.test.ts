import { describe, expect, it } from "vitest";
import { compileDataset } from "../src/compile.js";
import { computeGaps, FIX_FIRST_MIN_CRITICALITY, groupGaps, isFixFirst, NEEDED_CAPABILITY_CRITICALITY } from "../src/gaps.js";
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

describe("confirming a tier", () => {
  it("closes a gap a higher plan would remedy, once the tool's tier is confirmed", () => {
    const withGap = computeGaps(model, { tools: ["dbt-platform-services"], needs: ["orchestrate.dependency-dag"] });
    expect(ids(withGap)).toContain("needed-capability:orchestrate.dependency-dag@orchestrate");

    const tiered = computeGaps(model, { tools: ["dbt-platform-services"], needs: ["orchestrate.dependency-dag"], tiers: ["dbt-platform-services"] });
    expect(ids(tiered)).not.toContain("needed-capability:orchestrate.dependency-dag@orchestrate");
    expect(cell(tiered, "orchestrate.dependency-dag@orchestrate")).toMatchObject({ level: 3, via: ["dbt-platform-services"], conditional: [] });
  });

  it("has no effect on a tool that is not in the stack", () => {
    const r = computeGaps(model, { tools: ["postgres"], tiers: ["dbt-platform-services"] });
    expect(r).toEqual(computeGaps(model, { tools: ["postgres"] }));
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

describe("grouping gaps for a list", () => {
  const stacks: [string, string[], string[]?][] = [
    ["nothing", []],
    ["one tool", ["aws-s3"]],
    ["a pipeline", ["aws-s3", "aws-glue", "aws-athena"]],
    ["with a need", ["postgres"], ["ingest.cdc"]],
  ];

  it("put every gap in exactly one group, and never invent one", () => {
    for (const [name, tools, needs] of stacks) {
      const r = report(tools, needs);
      const grouped = groupGaps(model, r.gaps).flatMap((g) => g.gaps.map((x) => x.id));
      expect(grouped.sort(), name).toEqual(ids(r).sort());
    }
  });

  it("fold a cross-cutting capability missing at several stages into one row", () => {
    const r = report(["aws-s3", "aws-glue", "aws-athena"]);
    const groups = groupGaps(model, r.gaps);
    const masking = groups.filter((g) => g.capability === "govern.masking");
    expect(masking).toHaveLength(1);
    expect(masking[0]!.gaps.length).toBeGreaterThan(1);
    expect(groups.length).toBeLessThan(r.gaps.length);
    // A stack's cross-cutting gaps cannot outnumber the cross-cutting capabilities there are.
    const bandCapabilities = model.capabilities.filter((c) => c.kind === "band").length;
    expect(groups.filter((g) => g.kind === "band").length).toBeLessThanOrEqual(bandCapabilities);
  });

  it("list a group's stages once each, in pipeline order, and take its worst criticality", () => {
    const order = model.stages.map((s) => s.id);
    for (const [name, tools, needs] of stacks) {
      for (const g of groupGaps(model, report(tools, needs).gaps)) {
        expect(new Set(g.stages).size, name).toBe(g.stages.length);
        expect(g.stages.map((s) => order.indexOf(s)), name).toEqual([...g.stages.map((s) => order.indexOf(s))].sort((a, b) => a - b));
        expect(g.criticality, name).toBe(Math.max(...g.gaps.map((x) => x.criticality)));
        expect(g.gaps[0]!.criticality, name).toBe(g.criticality);
      }
    }
  });

  it("leave empty stages and needs as one gap to a row", () => {
    for (const g of groupGaps(model, report(["postgres"], ["ingest.cdc"]).gaps)) {
      if (g.kind !== "band") expect(g.gaps).toHaveLength(1);
    }
  });

  it("keep the ranking: worst first, and needs and empty stages ahead of cross-cutting at a tie", () => {
    const groups = groupGaps(model, report(["postgres"], ["ingest.reverse-etl"]).gaps);
    expect(groups.map((g) => g.criticality)).toEqual([...groups.map((g) => g.criticality)].sort((a, b) => b - a));
    expect(groups[0]!.kind).toBe("needed-capability");
  });

  it("call empty stages and needs fix-first always, and cross-cutting gaps only from the threshold", () => {
    const groups = groupGaps(model, report(["postgres"], ["ingest.cdc"]).gaps);
    for (const g of groups) {
      if (g.kind === "band") expect(isFixFirst(g), g.id).toBe(g.criticality >= FIX_FIRST_MIN_CRITICALITY);
      else expect(isFixFirst(g), g.id).toBe(true);
    }
    expect(groups.some((g) => g.kind === "band" && !isFixFirst(g))).toBe(true);
  });
});

describe("overlapping tools", () => {
  const overlaps = (tools: string[], use?: Record<string, string>) => computeGaps(model, { tools, use }).overlaps;
  const at = (tools: string[], capability: string, use?: Record<string, string>) => overlaps(tools, use).find((o) => o.capability === capability);
  const stack = ["snowflake", "dbt", "github"];

  it("find a capability that two of your tools provide properly", () => {
    const scheduling = at(stack, "orchestrate.scheduling")!;
    expect(scheduling.stage).toBe("orchestrate");
    expect(scheduling.providers.map((p) => p.tool).sort()).toEqual(["github", "snowflake"]);
    for (const o of overlaps(stack)) {
      expect(o.providers.length, o.capability).toBeGreaterThanOrEqual(2);
      for (const p of o.providers) expect(p.level, `${o.capability} ${p.tool}`).toBeGreaterThanOrEqual(2);
    }
  });

  it("do not count a tool that only reaches level 1, or a capability only one tool has", () => {
    expect(overlaps(["aws-s3"])).toEqual([]);
    expect(overlaps(["postgres"])).toEqual([]);
    // Postgres has a level 1 route to storage; it must not overlap a real warehouse.
    expect(overlaps(["postgres", "aws-redshift"]).find((o) => o.capability === "store.warehouse")).toBeUndefined();
  });

  it("do not count a bundle and its own part as two tools", () => {
    expect(overlaps(["snowflake", "snowflake-core"])).toEqual([]);
  });

  it("name the best provider as the lead, native ahead of bundled at the same level", () => {
    const scheduling = at(stack, "orchestrate.scheduling")!;
    expect(scheduling.lead).toBe("github");
    expect(scheduling.tied).toEqual(["github"]);
    expect(scheduling.used).toBe("github");
    expect(scheduling.providers[0]!.tool).toBe("github");
  });

  it("say there is no clear lead when the best providers tie", () => {
    const sql = at(stack, "transform.sql-transform")!;
    expect(sql.lead).toBeNull();
    expect(sql.tied.sort()).toEqual(["dbt", "snowflake"]);
    expect(sql.used).toBeNull();
    // A tie changes nothing about coverage: either tool gives the same level.
    expect(cell(report(stack), "transform.sql-transform@transform")).toMatchObject({ level: 3 });
  });

  it("score coverage by the tool you use, not the best one you own", () => {
    const tools = ["aws-mwaa", "github"];
    expect(cell(report(tools), "orchestrate.scheduling@orchestrate")).toMatchObject({ level: 3, via: ["aws-mwaa"] });
    const r = computeGaps(model, { tools, use: { "orchestrate.scheduling": "github" } });
    expect(r.cells.find((c) => c.key === "orchestrate.scheduling@orchestrate")).toMatchObject({ level: 2, via: ["github"] });
    expect(r.overlaps.find((o) => o.capability === "orchestrate.scheduling")).toMatchObject({ assigned: "github", used: "github", lead: "aws-mwaa" });
  });

  it("leave every other capability alone when one is assigned", () => {
    const tools = ["aws-mwaa", "github"];
    const before = report(tools).cells.filter((c) => c.key !== "orchestrate.scheduling@orchestrate");
    const after = computeGaps(model, { tools, use: { "orchestrate.scheduling": "github" } }).cells.filter((c) => c.key !== "orchestrate.scheduling@orchestrate");
    expect(after).toEqual(before);
  });

  it("ignore a choice for a tool that does not provide the capability", () => {
    const tools = ["aws-mwaa", "github", "aws-s3"];
    const r = computeGaps(model, { tools, use: { "orchestrate.scheduling": "aws-s3" } });
    expect(r.overlaps.find((o) => o.capability === "orchestrate.scheduling")!.assigned).toBeNull();
    expect(r.cells.find((c) => c.key === "orchestrate.scheduling@orchestrate")).toMatchObject({ level: 3, via: ["aws-mwaa"] });
  });

  it("refuse a choice for something that is not a spine capability or not in the stack", () => {
    expect(() => computeGaps(model, { tools: stack, use: { "govern.masking": "github" } })).toThrow(/not a spine capability/);
    expect(() => computeGaps(model, { tools: ["snowflake"], use: { "orchestrate.scheduling": "github" } })).toThrow(/not in the stack/);
  });

  it("never change which gaps there are: an overlap is not a gap", () => {
    for (const tools of [stack, ["aws-mwaa", "github"], ["databricks", "power-bi"]]) {
      const use = Object.fromEntries(overlaps(tools).flatMap((o) => (o.providers[1] ? [[o.capability, o.providers[1].tool]] : [])));
      expect(ids(computeGaps(model, { tools, use })), tools.join()).toEqual(ids(report(tools)));
    }
  });

  it("list overlaps in pipeline order, and only spine capabilities", () => {
    const order = model.stages.map((s) => s.id);
    const found = overlaps(["snowflake", "dbt", "github", "power-bi"]);
    expect(found.map((o) => order.indexOf(o.stage))).toEqual([...found.map((o) => order.indexOf(o.stage))].sort((a, b) => a - b));
    for (const o of found) expect(o.capability.startsWith(`${o.stage}.`), o.capability).toBe(true);
  });
});

describe("every tool is listed in the stages it touches", () => {
  it("names a tool that another beats on every capability, not only the winners", () => {
    const r = report(["aws-mwaa", "github"]);
    const orchestrate = stage(r, "orchestrate");
    expect(orchestrate.providers.map((p) => p.tool).sort()).toEqual(["aws-mwaa", "github"]);
    // GitHub wins CI/CD and MWAA wins the rest, so both are also covered_by; a weaker one would only be a provider.
    for (const id of orchestrate.covered_by) expect(orchestrate.providers.map((p) => p.tool)).toContain(id);
  });

  it("lists every selected tool with any spine capability in a stage, strongest first, and no one else", () => {
    for (const tools of [["snowflake", "dbt", "github"], ["postgres", "aws-redshift"], ["aws-s3", "aws-glue", "aws-athena"]]) {
      const r = report(tools);
      for (const s of r.stages) {
        const levels = s.providers.map((p) => p.level);
        expect(levels, `${tools} ${s.stage}`).toEqual([...levels].sort((a, b) => b - a));
        for (const p of s.providers) {
          expect(tools).toContain(p.tool);
          const tool = model.tools.find((t) => t.id === p.tool)!;
          expect(tool.cells.some((c) => c.stage === s.stage && c.capability.startsWith(`${s.stage}.`) && c.level > 0), `${p.tool} in ${s.stage}`).toBe(true);
        }
      }
    }
  });

  it("agrees with the stage's best level", () => {
    const r = report(["snowflake", "dbt", "github"]);
    for (const s of r.stages) expect(Math.max(0, ...s.providers.map((p) => p.level)), s.stage).toBeGreaterThanOrEqual(s.best_level);
  });
});
