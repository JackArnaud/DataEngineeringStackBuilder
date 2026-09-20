import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadDataset } from "../src/dataset.js";
import { bandStages, occupiedStages } from "../src/scope.js";
import type { Bundle, Portfolio, Taxonomy, Tool, ToolRecord } from "../src/types.js";

/**
 * The seed records exist to exercise every structural assumption in the model while there
 * are only a few of them. If one of these fails, a seed was removed or rewritten and the
 * schema has lost real-world coverage for that case.
 */
const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../data");
const ds = loadDataset(dataDir);
const taxonomy = ds.taxonomy!.data as Taxonomy;
const records = ds.tools.map((t) => t.data as ToolRecord);
const byId = new Map(records.map((r) => [r.id, r]));
const tools = records.filter((r): r is Tool => r.kind === "tool");
const composites = records.filter((r): r is Bundle | Portfolio => r.kind !== "tool");

const allScores = tools.flatMap((t) => [...Object.values(t.coverage ?? {}), ...(t.bands ?? [])]);

describe("seed dataset structure", () => {
  it("includes a single-contract bundle whose parts all exist", () => {
    const bundle = records.find((r) => r.kind === "bundle")!;
    expect(bundle.id).toBe("databricks");
    for (const id of (bundle as Bundle).includes) expect(byId.has(id), id).toBe(true);
  });

  it("includes an a-la-carte portfolio whose parts are independently scored records", () => {
    const portfolio = records.find((r) => r.kind === "portfolio") as Portfolio;
    expect(portfolio.id).toBe("aws");
    expect(portfolio.includes.length).toBeGreaterThanOrEqual(5);
    for (const id of portfolio.includes) expect(byId.get(id)?.kind).toBe("tool");
  });

  it("includes a bands-only tool with no spine coverage", () => {
    const bandsOnly = tools.filter((t) => Object.keys(t.coverage ?? {}).length === 0);
    expect(bandsOnly.map((t) => t.id)).toEqual(expect.arrayContaining(["ssms", "aws-lake-formation"]));
    for (const t of bandsOnly) for (const b of t.bands ?? []) expect(b.scope?.length, `${t.id} ${b.band}`).toBeGreaterThan(0);
  });

  it("includes a tool whose band scope differs from the stages it occupies", () => {
    const uc = byId.get("unity-catalog") as Tool;
    const govern = uc.bands!.find((b) => b.band === "govern.access-control")!;
    expect(occupiedStages(uc)).toEqual(["serve"]);
    expect(bandStages(uc, govern)).toEqual(["store", "transform", "serve"]);
  });

  it("includes one band capability scored at different strengths on different stages", () => {
    const dbt = byId.get("dbt-core") as Tool;
    const tests = dbt.bands!.filter((b) => b.band === "quality.tests");
    expect(tests.map((b) => `${b.level}@${b.scope!.join(",")}`).sort()).toEqual(["2@store", "3@transform"]);
  });

  it("uses every delivery type except bundled at the tool level", () => {
    const delivery = new Set(allScores.map((s) => s.delivery));
    expect(delivery).toEqual(new Set(["native", "partner", "community"]));
  });

  it("uses every coverage level", () => {
    expect(new Set(allScores.map((s) => s.level))).toEqual(new Set([1, 2, 3]));
  });

  it("includes a preview-maturity score", () => {
    expect(allScores.some((s) => s.maturity === "preview")).toBe(true);
  });

  it("carries proposed capabilities as evidence for taxonomy growth", () => {
    const proposals = records.flatMap((r) => (r.proposed_capabilities ?? []).map((p) => ({ id: r.id, ...p })));
    expect(proposals.map((p) => p.id).sort()).toEqual(["postgres", "ssms"]);
    for (const p of proposals) expect(p.nearest_existing).toBeDefined();
  });

  it("gives a dual-role tool coverage on both sides of the pipeline", () => {
    const pg = byId.get("postgres") as Tool;
    const stages = new Set(occupiedStages(pg));
    expect(stages.has("source")).toBe(true);
    expect(stages.has("serve")).toBe(true);
    expect(stages.has("store")).toBe(true);
  });

  it("never scores a capability that is deprecated or superseded", () => {
    const retired = new Set(Object.entries(taxonomy.capabilities).filter(([, c]) => c.status !== "active").map(([id]) => id));
    for (const t of tools) {
      for (const id of Object.keys(t.coverage ?? {})) expect(retired.has(id), `${t.id} ${id}`).toBe(false);
      for (const b of t.bands ?? []) expect(retired.has(b.band), `${t.id} ${b.band}`).toBe(false);
    }
  });

  it("stamps every record with the current taxonomy major.minor, so none need review", () => {
    // A patch changes weights and wording, never which capabilities exist, so only major.minor counts.
    const majorMinor = (v: string) => v.split(".").slice(0, 2).join(".");
    for (const r of records) expect(majorMinor(r.taxonomy_version), r.id).toBe(majorMinor(taxonomy.taxonomy_version));
  });

  it("composes the dbt platform from the open-source record plus its own hosted services", () => {
    const platform = byId.get("dbt-platform") as Bundle;
    expect(platform.kind).toBe("bundle");
    expect(platform.includes).toEqual(["dbt-core", "dbt-platform-services"]);
    // The open-source record is a real product in its own right, not only a part.
    expect(byId.get("dbt-core")?.kind).toBe("tool");
  });

  it("uses the enterprise-tier constraint for capability only a higher plan provides", () => {
    const constrained = tools.flatMap((t) =>
      [...Object.entries(t.coverage ?? {}).map(([id, s]) => ({ id, s })), ...(t.bands ?? []).map((b) => ({ id: b.band, s: b }))]
        .filter(({ s }) => s.constraint?.includes("enterprise-tier"))
        .map(({ id }) => `${t.id}:${id}`),
    );
    expect(constrained).toEqual(["dbt-platform-services:orchestrate.dependency-dag"]);
  });

  it("leaves no capability unscored except the ones we know no seed covers", () => {
    // Add a capability to this list only when it is a deliberate, understood gap. Remove it
    // as soon as a record scores it. A new taxonomy capability with no scores fails this test.
    const KNOWN_UNSCORED = ["source.saas-api", "store.olap-serving"];
    const scored = new Set(tools.flatMap((t) => [...Object.keys(t.coverage ?? {}), ...(t.bands ?? []).map((b) => b.band)]));
    const unscored = Object.keys(taxonomy.capabilities).filter((id) => !scored.has(id));
    expect(unscored.filter((id) => !KNOWN_UNSCORED.includes(id))).toEqual([]);
  });

  it("gives each composite no scores of its own", () => {
    for (const c of composites) {
      expect(c).not.toHaveProperty("coverage");
      expect(c).not.toHaveProperty("bands");
    }
  });
});
