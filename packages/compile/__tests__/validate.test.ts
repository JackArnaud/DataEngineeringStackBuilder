import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadDataset } from "../src/dataset.js";
import type { Issue } from "../src/types.js";
import { validateDataset } from "../src/validate.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = Record<string, any>;

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, "../../../data");
const base = loadDataset(dataDir);

interface Variant {
  tools?: Record<string, unknown>;
  taxonomy?: (t: Json) => void;
  derivation?: (d: Json) => void;
  /** Edit a lens in place, keyed by lens id. */
  lens?: Record<string, (l: Json) => void>;
}

/** Validate the real taxonomy and lenses, with edits and inline tool records layered on top. */
function run(v: Variant = {}): Issue[] {
  const taxonomy = structuredClone(base.taxonomy!);
  v.taxonomy?.(taxonomy.data as Json);
  const derivation = structuredClone(base.derivation!);
  v.derivation?.(derivation.data as Json);
  const lenses = base.lenses.map((l) => {
    const copy = structuredClone(l);
    v.lens?.[(copy.data as Json).id]?.(copy.data as Json);
    return copy;
  });
  const tools = Object.entries(v.tools ?? {}).map(([name, data]) => ({ file: `data/tools/${name}.json`, data }));
  return validateDataset({ ...base, taxonomy, derivation, lenses, tools });
}

const errors = (issues: Issue[]) => issues.filter((i) => i.severity === "error");
const warnings = (issues: Issue[]) => issues.filter((i) => i.severity === "warning");
const codes = (issues: Issue[]) => issues.map((i) => i.code);

/** True if some issue has this code and, optionally, a path and message fragment. */
function has(issues: Issue[], code: string, where?: { path?: string; msg?: string }): boolean {
  return issues.some(
    (i) =>
      i.code === code &&
      (where?.path === undefined || i.path === where.path) &&
      (where?.msg === undefined || i.message.includes(where.msg)),
  );
}

const SRC = "https://example.com/docs";
const score = (level: number, delivery = "native", extra: Json = {}): Json => ({
  level,
  delivery,
  note: "Fixture note for tests.",
  source: SRC,
  ...extra,
});

/** A valid specialist: one spine capability plus a band score scoped to the same stage. */
const specialist = (over: Json = {}): Json => ({
  id: "fixture-tool",
  name: "Fixture Tool",
  vendor: "Fixture Co",
  kind: "tool",
  license: "open-source",
  deployment: ["self-hosted"],
  pricing_model: "free",
  taxonomy_version: "1.0.0",
  updated: "2026-09-20",
  coverage: { "transform.sql-transform": score(3) },
  bands: [{ band: "quality.tests", ...score(3), scope: ["transform"] }],
  ...over,
});

const composite = (kind: "bundle" | "portfolio", id: string, includes: string[], over: Json = {}): Json => ({
  id,
  name: id,
  vendor: "Fixture Co",
  kind,
  license: "proprietary",
  deployment: ["saas"],
  pricing_model: "usage",
  taxonomy_version: "1.0.0",
  updated: "2026-09-20",
  includes,
  bundling: kind === "bundle" ? "single-contract" : "a-la-carte",
  ...over,
});

const one = (rec: Json): Record<string, Json> => ({ [rec.id]: rec });

// ------------------------------------------------------------------ real data

const IMPACT = { matters: "A capability added by a test that says what goes wrong.", example: "A story written by a test, long enough to satisfy the schema minimum." };

describe("the real dataset", () => {
  it("validates with no errors or warnings", () => {
    expect(validateDataset(base)).toEqual([]);
  });

  it("has a taxonomy with the six-stage spine", () => {
    expect((base.taxonomy!.data as Json).stages.map((s: Json) => s.id)).toEqual([
      "source", "ingest", "store", "transform", "orchestrate", "serve",
    ]);
  });
});

// ---------------------------------------------------------------- tool: scores

describe("tool scores", () => {
  it("accepts a valid specialist", () => {
    expect(run({ tools: one(specialist()) })).toEqual([]);
  });

  it("rejects a score with no source", () => {
    const rec = specialist({ coverage: { "transform.sql-transform": { level: 3, delivery: "native", note: "Fixture note." } } });
    const issues = run({ tools: one(rec) });
    expect(has(issues, "schema", { path: "/coverage/transform.sql-transform", msg: '"source"' })).toBe(true);
  });

  it("rejects a score with no note", () => {
    const rec = specialist({ coverage: { "transform.sql-transform": { level: 3, delivery: "native", source: SRC } } });
    expect(has(run({ tools: one(rec) }), "schema", { path: "/coverage/transform.sql-transform", msg: '"note"' })).toBe(true);
  });

  it("rejects a band score with no source", () => {
    const rec = specialist({ bands: [{ band: "quality.tests", level: 3, delivery: "native", note: "Fixture note.", scope: ["transform"] }] });
    expect(has(run({ tools: one(rec) }), "schema", { path: "/bands/0", msg: '"source"' })).toBe(true);
  });

  it("rejects a non-https source", () => {
    const rec = specialist({ coverage: { "transform.sql-transform": score(3, "native", { source: "http://example.com" }) } });
    expect(has(run({ tools: one(rec) }), "schema", { path: "/coverage/transform.sql-transform/source" })).toBe(true);
  });

  it("rejects a recorded zero, since absence means 0", () => {
    const rec = specialist({ coverage: { "transform.sql-transform": score(0) } });
    expect(has(run({ tools: one(rec) }), "schema", { path: "/coverage/transform.sql-transform/level" })).toBe(true);
  });

  it("rejects a level outside the 4-level scale", () => {
    const rec = specialist({ coverage: { "transform.sql-transform": score(4) } });
    expect(has(run({ tools: one(rec) }), "schema", { path: "/coverage/transform.sql-transform/level" })).toBe(true);
  });

  it.each([
    [3, "partner"],
    [3, "community"],
    [2, "partner"],
    [2, "community"],
    [1, "native"],
  ])("rejects level %i delivered as %s", (level, delivery) => {
    const rec = specialist({ coverage: { "transform.sql-transform": score(level, delivery) } });
    expect(has(run({ tools: one(rec) }), "schema", { path: "/coverage/transform.sql-transform/delivery" })).toBe(true);
  });

  it.each([
    [3, "native"],
    [3, "bundled"],
    [2, "native"],
    [2, "bundled"],
    [1, "bundled"],
    [1, "partner"],
    [1, "community"],
  ])("accepts level %i delivered as %s", (level, delivery) => {
    const rec = specialist({ coverage: { "transform.sql-transform": score(level, delivery) } });
    expect(run({ tools: one(rec) })).toEqual([]);
  });

  it("accepts flags, and rejects a value outside them", () => {
    const flagged = specialist({
      coverage: { "transform.sql-transform": score(3, "native", { maturity: "preview", constraint: ["enterprise-tier", "region-limited"] }) },
    });
    expect(run({ tools: one(flagged) })).toEqual([]);

    const bad = specialist({ coverage: { "transform.sql-transform": score(3, "native", { maturity: "alpha" }) } });
    expect(has(run({ tools: one(bad) }), "schema", { path: "/coverage/transform.sql-transform/maturity" })).toBe(true);
  });

  it("rejects unknown properties, including a hand-assigned archetype", () => {
    const issues = run({ tools: one(specialist({ archetype: "specialist" })) });
    expect(has(issues, "schema", { path: "/archetype", msg: "unknown property" })).toBe(true);
  });

  it("rejects a per-tool hue, since role drives colour", () => {
    const issues = run({ tools: one(specialist({ presentation: { role: "modeller", hue: "teal" } })) });
    expect(has(issues, "schema", { path: "/presentation/hue" })).toBe(true);
  });

  it("rejects a role outside the closed vocabulary", () => {
    const issues = run({ tools: one(specialist({ presentation: { role: "wizard" } })) });
    expect(has(issues, "schema", { path: "/presentation/role" })).toBe(true);
  });
});

describe("error quality: one mistake, one error", () => {
  // A failing sub-schema drops its evaluated-property annotations, so a naive schema reports
  // every sibling property as "unknown" alongside the real problem. Guard against that noise.
  const only = (rec: Json): Issue[] => errors(run({ tools: one(rec) }));

  it("reports a missing source once, without blaming the other fields", () => {
    const rec = specialist({ coverage: { "transform.sql-transform": { level: 3, delivery: "native", note: "Fixture note." } } });
    expect(only(rec).map((i) => `${i.path}: ${i.message}`)).toEqual(['/coverage/transform.sql-transform: missing required property "source"']);
  });

  it("reports a missing band source once", () => {
    const rec = specialist({ bands: [{ band: "quality.tests", level: 3, delivery: "native", note: "Fixture note.", scope: ["transform"] }] });
    expect(only(rec)).toHaveLength(1);
    expect(only(rec)[0]!.path).toBe("/bands/0");
  });

  it("reports a level/delivery mismatch once, on delivery", () => {
    const rec = specialist({ coverage: { "transform.sql-transform": score(3, "partner") } });
    expect(only(rec).map((i) => i.path)).toEqual(["/coverage/transform.sql-transform/delivery"]);
  });

  it("reports a band level/delivery mismatch once", () => {
    const rec = specialist({ bands: [{ band: "quality.tests", ...score(1, "native"), scope: ["transform"] }] });
    expect(only(rec).map((i) => i.path)).toEqual(["/bands/0/delivery"]);
  });

  it("reports one unknown property once, and nothing else", () => {
    expect(only(specialist({ archetype: "specialist" })).map((i) => i.path)).toEqual(["/archetype"]);
    const rec = specialist({ coverage: { "transform.sql-transform": score(3, "native", { confidence: "high" }) } });
    expect(only(rec).map((i) => i.path)).toEqual(["/coverage/transform.sql-transform/confidence"]);
  });

  it("reports a missing bundle field once", () => {
    const rec = composite("bundle", "fixture-bundle", ["fixture-tool"]);
    delete rec.bundling;
    expect(errors(run({ tools: { "fixture-tool": specialist(), "fixture-bundle": rec } }))).toHaveLength(1);
  });

  it("reports each independent mistake separately", () => {
    const rec = specialist({
      coverage: { "transform.sql-transform": score(3, "partner", { source: "http://example.com" }) },
      vendor: undefined,
    });
    expect(only(rec).map((i) => i.path).sort()).toEqual(["", "/coverage/transform.sql-transform/delivery", "/coverage/transform.sql-transform/source"]);
  });
});

// ------------------------------------------------------- tool: bands and scope

describe("band scope", () => {
  const bandsOnly = (bands: Json[]): Json => {
    const rec = specialist({ bands });
    delete rec.coverage;
    return rec;
  };

  it("requires scope for a tool with no spine coverage", () => {
    const rec = bandsOnly([{ band: "quality.anomaly-detection", ...score(3) }]);
    expect(has(run({ tools: one(rec) }), "schema", { path: "/bands/0", msg: '"scope"' })).toBe(true);
  });

  it("accepts a bands-only tool with explicit scope", () => {
    const rec = bandsOnly([{ band: "quality.anomaly-detection", ...score(3), scope: ["ingest", "store"] }]);
    expect(run({ tools: one(rec) })).toEqual([]);
  });

  it("treats an empty coverage object as no spine coverage", () => {
    const rec = specialist({ coverage: {}, bands: [{ band: "quality.anomaly-detection", ...score(3) }] });
    expect(has(run({ tools: one(rec) }), "schema", { path: "/bands/0", msg: '"scope"' })).toBe(true);
  });

  it("defaults scope to the occupied stages when spine coverage exists", () => {
    const rec = specialist({
      coverage: { "transform.sql-transform": score(3), "orchestrate.scheduling": score(2) },
      bands: [{ band: "observe.monitoring", ...score(2) }],
    });
    expect(run({ tools: one(rec) })).toEqual([]);
  });

  it("rejects a tool with neither coverage nor bands", () => {
    const rec = specialist();
    delete rec.coverage;
    delete rec.bands;
    expect(has(run({ tools: one(rec) }), "schema", { path: "", msg: "at least one coverage entry or one band entry" })).toBe(true);
  });

  it("rejects a scope naming an unknown stage", () => {
    const rec = specialist({ bands: [{ band: "quality.tests", ...score(3), scope: ["transform", "warehouse"] }] });
    expect(has(run({ tools: one(rec) }), "scope-stage-unknown", { path: "/bands/0/scope" })).toBe(true);
  });

  it("rejects two entries scoring the same band capability at the same stage", () => {
    const rec = specialist({
      bands: [
        { band: "quality.tests", ...score(3), scope: ["transform", "store"] },
        { band: "quality.tests", ...score(2), scope: ["store"] },
      ],
    });
    expect(has(run({ tools: one(rec) }), "band-scope-overlap", { path: "/bands/1", msg: "store" })).toBe(true);
  });

  it("catches an overlap created by the default scope", () => {
    const rec = specialist({
      bands: [
        { band: "quality.tests", ...score(3) }, // defaults to transform
        { band: "quality.tests", ...score(2), scope: ["transform"] },
      ],
    });
    expect(has(run({ tools: one(rec) }), "band-scope-overlap")).toBe(true);
  });

  it("allows the same band capability at different stages in separate entries", () => {
    const rec = specialist({
      bands: [
        { band: "govern.access-control", ...score(3), scope: ["store"] },
        { band: "govern.access-control", ...score(2), scope: ["serve"] },
      ],
    });
    expect(run({ tools: one(rec) })).toEqual([]);
  });
});

// --------------------------------------------------- tool: taxonomy references

describe("capability references", () => {
  it("rejects an unknown capability", () => {
    const rec = specialist({ coverage: { "transform.magic": score(3) } });
    expect(has(run({ tools: one(rec) }), "capability-unknown", { path: "/coverage/transform.magic" })).toBe(true);
  });

  it("rejects a band capability recorded as coverage", () => {
    const rec = specialist({ coverage: { "quality.tests": score(3) } });
    expect(has(run({ tools: one(rec) }), "capability-wrong-kind", { path: "/coverage/quality.tests" })).toBe(true);
  });

  it("rejects a spine capability recorded as a band", () => {
    const rec = specialist({ bands: [{ band: "transform.sql-transform", ...score(3), scope: ["transform"] }] });
    expect(has(run({ tools: one(rec) }), "capability-wrong-kind", { path: "/bands/0/band" })).toBe(true);
  });

  it("warns on a deprecated capability without failing", () => {
    const issues = run({
      taxonomy: (t) => { t.capabilities["transform.sql-transform"].status = "deprecated"; },
      tools: one(specialist()),
    });
    expect(errors(issues)).toEqual([]);
    expect(has(issues, "capability-deprecated", { path: "/coverage/transform.sql-transform" })).toBe(true);
  });

  it("queues a record citing a superseded capability for migration", () => {
    const issues = run({
      taxonomy: (t) => {
        t.capabilities["transform.sql-transform"] = {
          ...t.capabilities["transform.sql-transform"],
          status: "superseded_by",
          successors: ["transform.sql-transform-v2", "transform.sql-transform-v3"],
          migration: "fan-out",
        };
        for (const id of ["transform.sql-transform-v2", "transform.sql-transform-v3"]) {
          t.capabilities[id] = { name: id, description: "Successor capability for the test.", status: "active", impact: IMPACT };
        }
      },
      tools: one(specialist()),
    });
    expect(errors(issues)).toEqual([]);
    expect(has(issues, "capability-superseded", { msg: "transform.sql-transform-v2, transform.sql-transform-v3" })).toBe(true);
  });

  it("flags entries a migration copied but nobody has re-scored", () => {
    const rec = specialist({ coverage: { "transform.sql-transform": score(3, "native", { inherited: true }) } });
    const issues = run({ tools: one(rec) });
    expect(errors(issues)).toEqual([]);
    expect(has(issues, "inherited-unscored")).toBe(true);
  });
});

describe("taxonomy versioning", () => {
  it("flags a lagging record as needs-review, not an error", () => {
    const issues = run({
      taxonomy: (t) => { t.taxonomy_version = "1.1.0"; },
      tools: one(specialist({ taxonomy_version: "1.0.0" })),
    });
    expect(errors(issues)).toEqual([]);
    expect(has(issues, "needs-review", { path: "/taxonomy_version" })).toBe(true);
  });

  it("compares versions numerically, not as text", () => {
    const issues = run({
      taxonomy: (t) => { t.taxonomy_version = "1.10.0"; },
      tools: one(specialist({ taxonomy_version: "1.9.0" })),
    });
    expect(has(issues, "needs-review")).toBe(true);
    expect(has(issues, "taxonomy-version-ahead")).toBe(false);
  });

  it("ignores a lagging patch: it changes weights and wording, never which capabilities exist", () => {
    const issues = run({
      taxonomy: (t) => { t.taxonomy_version = "1.0.7"; },
      tools: one(specialist({ taxonomy_version: "1.0.0" })),
    });
    expect(issues).toEqual([]);
  });

  it("still rejects a record stamped with a newer patch than the taxonomy", () => {
    const issues = run({
      taxonomy: (t) => { t.taxonomy_version = "1.0.1"; },
      tools: one(specialist({ taxonomy_version: "1.0.2" })),
    });
    expect(has(issues, "taxonomy-version-ahead")).toBe(true);
  });

  it("rejects a record stamped with a version newer than the taxonomy", () => {
    expect(has(run({ tools: one(specialist({ taxonomy_version: "2.0.0" })) }), "taxonomy-version-ahead")).toBe(true);
  });

  it("accepts a record that matches", () => {
    expect(warnings(run({ tools: one(specialist()) }))).toEqual([]);
  });
});

// ------------------------------------------------- tool: identity, composition

describe("record identity", () => {
  it("rejects a file whose name differs from the record id", () => {
    const issues = run({ tools: { "some-other-name": specialist() } });
    expect(has(issues, "tool-filename-mismatch")).toBe(true);
  });

  it("rejects two records with the same id", () => {
    const issues = validateDataset({
      ...base,
      tools: [
        { file: "data/tools/a/fixture-tool.json", data: specialist() },
        { file: "data/tools/b/fixture-tool.json", data: specialist() },
      ],
    });
    expect(has(issues, "tool-duplicate-id", { msg: "data/tools/a/fixture-tool.json" })).toBe(true);
  });

  it("warns, but does not fail, on pairs_with an unrecorded tool", () => {
    const issues = run({ tools: one(specialist({ pairs_with: ["airflow"] })) });
    expect(errors(issues)).toEqual([]);
    expect(has(issues, "pairs-with-unknown", { path: "/pairs_with/0" })).toBe(true);
  });

  it("rejects an unknown kind", () => {
    expect(has(run({ tools: { x: specialist({ id: "x", kind: "suite" }) } }), "schema", { path: "/kind" })).toBe(true);
  });
});

describe("bundles and portfolios", () => {
  it("accepts a bundle and a portfolio composed of real records", () => {
    const issues = run({
      tools: {
        "fixture-tool": specialist(),
        "fixture-bundle": composite("bundle", "fixture-bundle", ["fixture-tool"]),
        "fixture-cloud": composite("portfolio", "fixture-cloud", ["fixture-tool", "fixture-bundle"]),
      },
    });
    expect(issues).toEqual([]);
  });

  it("rejects hand-written coverage on a bundle", () => {
    const rec = composite("bundle", "fixture-bundle", ["fixture-tool"], { coverage: { "transform.sql-transform": score(3) } });
    const issues = run({ tools: { "fixture-tool": specialist(), "fixture-bundle": rec } });
    expect(has(issues, "schema", { path: "/coverage", msg: "unknown property" })).toBe(true);
  });

  it("rejects hand-written bands on a portfolio", () => {
    const rec = composite("portfolio", "fixture-cloud", ["fixture-tool"], { bands: [{ band: "quality.tests", ...score(3), scope: ["transform"] }] });
    const issues = run({ tools: { "fixture-tool": specialist(), "fixture-cloud": rec } });
    expect(has(issues, "schema", { path: "/bands", msg: "unknown property" })).toBe(true);
  });

  it("rejects a bundle without includes", () => {
    const rec = composite("bundle", "fixture-bundle", []);
    expect(has(run({ tools: one(rec) }), "schema", { path: "/includes" })).toBe(true);
  });

  it("rejects a portfolio claiming single-contract bundling, and a bundle claiming a-la-carte", () => {
    const portfolio = composite("portfolio", "fixture-cloud", ["fixture-tool"], { bundling: "single-contract" });
    const bundle = composite("bundle", "fixture-bundle", ["fixture-tool"], { bundling: "a-la-carte" });
    const issues = run({ tools: { "fixture-tool": specialist(), "fixture-cloud": portfolio, "fixture-bundle": bundle } });
    expect(has(issues, "schema", { path: "/bundling" })).toBe(true);
    expect(issues.filter((i) => i.path === "/bundling")).toHaveLength(2);
  });

  it("rejects an include that has no record", () => {
    const issues = run({ tools: { "fixture-bundle": composite("bundle", "fixture-bundle", ["ghost"]) } });
    expect(has(issues, "include-unknown", { path: "/includes/0", msg: "ghost" })).toBe(true);
  });

  it("rejects a record that includes itself", () => {
    const issues = run({ tools: { "fixture-bundle": composite("bundle", "fixture-bundle", ["fixture-bundle"]) } });
    expect(has(issues, "include-self")).toBe(true);
  });

  it("rejects a composition loop, naming the path", () => {
    const issues = run({
      tools: {
        a: composite("bundle", "a", ["b"]),
        b: composite("portfolio", "b", ["c"]),
        c: composite("bundle", "c", ["a"]),
      },
    });
    expect(errors(issues).filter((i) => i.code === "include-cycle")).toHaveLength(1);
    expect(has(issues, "include-cycle", { msg: "a -> b -> c -> a" })).toBe(true);
  });

  it("allows a diamond: two bundles sharing one part", () => {
    const issues = run({
      tools: {
        shared: specialist({ id: "shared" }),
        left: composite("bundle", "left", ["shared"]),
        right: composite("bundle", "right", ["shared"]),
        top: composite("portfolio", "top", ["left", "right"]),
      },
    });
    expect(issues).toEqual([]);
  });
});

// ------------------------------------------------------ tool: proposals, lenses

describe("proposed capabilities", () => {
  const proposal = (over: Json = {}): Json => ({
    name: "Managed REST catalog",
    description: "Hosted Iceberg REST catalog, distinct from the table format itself.",
    home: "store",
    nearest_existing: "store.table-format",
    source: SRC,
    ...over,
  });

  it("accepts a well-formed proposal without scoring it", () => {
    expect(run({ tools: one(specialist({ proposed_capabilities: [proposal()] })) })).toEqual([]);
  });

  it("requires evidence", () => {
    const p = proposal();
    delete p.source;
    expect(has(run({ tools: one(specialist({ proposed_capabilities: [p] })) }), "schema", { path: "/proposed_capabilities/0", msg: '"source"' })).toBe(true);
  });

  it("rejects an unknown home or nearest capability", () => {
    const issues = run({ tools: one(specialist({ proposed_capabilities: [proposal({ home: "lakehouse", nearest_existing: "store.nope" })] })) });
    expect(has(issues, "proposal-home-unknown")).toBe(true);
    expect(has(issues, "proposal-nearest-unknown")).toBe(true);
  });
});

describe("per-tool lens overrides", () => {
  const override = (over: Json = {}): Json => ({ lens: "medallion", zones: ["gold"], note: "Serves only curated marts here.", ...over });

  it("accepts a valid override", () => {
    expect(run({ tools: one(specialist({ lens_overrides: [override()] })) })).toEqual([]);
  });

  it("requires a note", () => {
    const o = override();
    delete o.note;
    expect(has(run({ tools: one(specialist({ lens_overrides: [o] })) }), "schema", { path: "/lens_overrides/0", msg: '"note"' })).toBe(true);
  });

  it("rejects an unknown lens or a zone the lens does not have", () => {
    const issues = run({
      tools: one(specialist({ lens_overrides: [override({ lens: "kappa" }), override({ zones: ["platinum"] })] })),
    });
    expect(has(issues, "lens-override-lens-unknown", { path: "/lens_overrides/0/lens" })).toBe(true);
    expect(has(issues, "lens-override-zone-unknown", { path: "/lens_overrides/1/zones" })).toBe(true);
  });
});

// --------------------------------------------------------------------- taxonomy

describe("taxonomy rules", () => {
  it("requires successors and a migration mode on a superseded capability", () => {
    const issues = run({ taxonomy: (t) => { t.capabilities["store.table-format"].status = "superseded_by"; } });
    expect(has(issues, "schema", { path: "/capabilities/store.table-format", msg: '"successors"' })).toBe(true);
    expect(has(issues, "schema", { path: "/capabilities/store.table-format", msg: '"migration"' })).toBe(true);
  });

  it("forbids successors on a capability that is not superseded", () => {
    const issues = run({ taxonomy: (t) => { t.capabilities["store.table-format"].successors = ["store.warehouse"]; } });
    expect(errors(issues).some((i) => i.path.startsWith("/capabilities/store.table-format"))).toBe(true);
  });

  it("accepts a fan-out to two successors", () => {
    const issues = run({
      taxonomy: (t) => {
        t.capabilities["store.table-format"] = {
          ...t.capabilities["store.table-format"],
          status: "superseded_by",
          successors: ["store.table-format-managed", "store.table-format-rest-catalog"],
          migration: "fan-out",
        };
        for (const id of ["store.table-format-managed", "store.table-format-rest-catalog"]) {
          t.capabilities[id] = { name: id, description: "Successor capability for the test.", status: "active", impact: IMPACT };
        }
      },
    });
    expect(issues).toEqual([]);
  });

  it("rejects a successor that does not exist, or that is the capability itself", () => {
    const issues = run({
      taxonomy: (t) => {
        t.capabilities["store.table-format"] = { ...t.capabilities["store.table-format"], status: "superseded_by", successors: ["store.ghost", "store.table-format"], migration: "fan-out" };
      },
    });
    expect(has(issues, "successor-unknown")).toBe(true);
    expect(has(issues, "successor-self")).toBe(true);
  });

  it("rejects a successor loop", () => {
    const issues = run({
      taxonomy: (t) => {
        const sup = (successor: string) => ({ name: "x", description: "Loop member for the test.", status: "superseded_by", successors: [successor], migration: "fan-out" });
        t.capabilities["store.loop-a"] = sup("store.loop-b");
        t.capabilities["store.loop-b"] = sup("store.loop-a");
      },
    });
    expect(has(issues, "successor-cycle", { msg: "loop-a" })).toBe(true);
  });

  it("rejects a capability whose prefix is neither a stage nor a band", () => {
    const issues = run({
      taxonomy: (t) => { t.capabilities["warehouse.compute"] = { name: "Compute", description: "Has no parent stage.", status: "active", impact: IMPACT }; },
    });
    expect(has(issues, "capability-prefix-unknown", { path: "/capabilities/warehouse.compute" })).toBe(true);
  });

  it("rejects a stage and a band sharing an id", () => {
    const issues = run({ taxonomy: (t) => { t.bands[0].id = "store"; } });
    expect(has(issues, "group-id-duplicate")).toBe(true);
  });

  it("requires every stage to carry a criticality and a rationale, within 0-5", () => {
    const missing = run({ taxonomy: (t) => { delete t.stages[1].criticality; } });
    expect(has(missing, "schema", { path: "/stages/1", msg: '"criticality"' })).toBe(true);

    const noWhy = run({ taxonomy: (t) => { delete t.stages[1].rationale; } });
    expect(has(noWhy, "schema", { path: "/stages/1", msg: '"rationale"' })).toBe(true);

    const range = run({ taxonomy: (t) => { t.stages[1].criticality = 6; } });
    expect(has(range, "schema", { path: "/stages/1/criticality" })).toBe(true);
  });

  it("requires every band x stage criticality cell", () => {
    const issues = run({ taxonomy: (t) => { delete t.criticality.bands.quality.stages.ingest; } });
    expect(has(issues, "criticality-cell-missing", { msg: "quality x ingest" })).toBe(true);
  });

  it("requires a criticality row for every band", () => {
    const issues = run({ taxonomy: (t) => { delete t.criticality.bands.observe; } });
    expect(has(issues, "criticality-cell-missing", { msg: "observe" })).toBe(true);
  });

  it("rejects criticality for an unknown band or stage", () => {
    const issues = run({
      taxonomy: (t) => {
        t.criticality.bands.mystery = { rationale: "Not a real band at all.", stages: { source: 1 } };
        t.criticality.bands.govern.stages.warehouse = 2;
      },
    });
    expect(has(issues, "criticality-band-unknown")).toBe(true);
    expect(has(issues, "criticality-stage-unknown")).toBe(true);
  });

  it("rejects a weight outside 0-5", () => {
    const issues = run({ taxonomy: (t) => { t.criticality.bands.govern.stages.store = 9; } });
    expect(has(issues, "schema", { path: "/criticality/bands/govern/stages/store" })).toBe(true);
  });

  it("only lets band capabilities carry a criticality override", () => {
    const issues = run({
      taxonomy: (t) => { t.criticality.overrides.push({ capability: "store.warehouse", stage: "store", weight: 5, rationale: "Spine capability, not a band." }); },
    });
    expect(has(issues, "criticality-override-target")).toBe(true);
  });

  it("requires a rationale on an override, and rejects duplicates", () => {
    const missing = run({ taxonomy: (t) => { delete t.criticality.overrides[0].rationale; } });
    expect(has(missing, "schema", { path: "/criticality/overrides/0", msg: '"rationale"' })).toBe(true);

    const dup = run({ taxonomy: (t) => { t.criticality.overrides.push({ ...t.criticality.overrides[0] }); } });
    expect(has(dup, "criticality-override-duplicate")).toBe(true);
  });
});

// ----------------------------------------------------------------------- lenses

describe("lens invariants", () => {
  it("rejects a lens that leaves a stage unmapped", () => {
    const issues = run({ lens: { medallion: (l) => { delete l.defaults.serve; } } });
    expect(has(issues, "lens-stage-unmapped", { msg: 'stage "serve"' })).toBe(true);
  });

  it("counts every capability cell that a missing stage default strands", () => {
    // serve has 5 spine capabilities plus 13 band capabilities scored at serve, less any covered by overrides.
    const issues = run({ lens: { medallion: (l) => { delete l.defaults.serve; } } });
    const issue = issues.find((i) => i.code === "lens-stage-unmapped")!;
    expect(issue.message).toMatch(/leaving 1[0-9] capability cells/);
  });

  it("accepts a stage explicitly marked unmapped", () => {
    const issues = run({ lens: { medallion: (l) => { l.defaults.serve = "unmapped"; } } });
    expect(issues).toEqual([]);
  });

  it("requires the unmapped policy to be stated", () => {
    const issues = run({ lens: { medallion: (l) => { delete l.unmapped; } } });
    expect(has(issues, "schema", { msg: '"unmapped"' })).toBe(true);
  });

  it("rejects an unmapped policy other than drop or rail", () => {
    const issues = run({ lens: { medallion: (l) => { l.unmapped = "ignore"; } } });
    expect(has(issues, "schema", { path: "/unmapped" })).toBe(true);
  });

  it("rejects a zone the lens does not declare", () => {
    const issues = run({ lens: { medallion: (l) => { l.defaults.transform = ["silver", "platinum"]; } } });
    expect(has(issues, "lens-zone-unknown", { path: "/defaults/transform", msg: "platinum" })).toBe(true);
  });

  it("rejects an override that matches nothing, and a duplicate override", () => {
    const issues = run({
      lens: {
        medallion: (l) => {
          l.overrides.push({ match: "transform.no-such-thing", zones: ["gold"] });
          l.overrides.push({ match: "transform.stream-processing", zones: ["gold"] });
        },
      },
    });
    expect(has(issues, "lens-override-unresolved", { msg: "transform.no-such-thing" })).toBe(true);
    expect(has(issues, "lens-override-duplicate")).toBe(true);
  });

  it("accepts a wildcard override for a whole stage or band", () => {
    const issues = run({ lens: { medallion: (l) => { l.overrides.push({ match: "govern.*", zones: "all" }); } } });
    expect(issues).toEqual([]);
  });

  it("rejects a wildcard over something that is not a stage or band", () => {
    const issues = run({ lens: { medallion: (l) => { l.overrides.push({ match: "warehouse.*", zones: "all" }); } } });
    expect(has(issues, "lens-override-unresolved", { msg: "warehouse.*" })).toBe(true);
  });

  it("rejects a lens whose id differs from its file name", () => {
    const issues = run({ lens: { medallion: (l) => { l.id = "bronze-silver-gold"; } } });
    expect(has(issues, "lens-id-mismatch")).toBe(true);
  });

  it("rejects a drop policy that would hide cells that can be gaps", () => {
    // Medallion leaves reverse ETL and cost visibility unmapped; dropping them would hide a gap.
    const issues = run({ lens: { medallion: (l) => { l.unmapped = "drop"; } } });
    expect(has(issues, "lens-drop-hides-gap", { path: "/unmapped", msg: "ingest.reverse-etl@ingest" })).toBe(true);
  });

  it("allows drop when the lens leaves nothing unmapped", () => {
    expect(run({ lens: { grid: (l) => { l.unmapped = "drop"; } } })).toEqual([]);
    const issues = run({
      lens: {
        medallion: (l) => {
          l.unmapped = "drop";
          l.overrides = l.overrides.filter((o: Json) => o.zones !== "unmapped");
        },
      },
    });
    expect(issues).toEqual([]);
  });

  it("rejects dropping an unmapped stage that could be empty, even though it maps no override", () => {
    const issues = run({ lens: { grid: (l) => { l.unmapped = "drop"; l.defaults.serve = "unmapped"; } } });
    expect(has(issues, "lens-drop-hides-gap", { msg: "stage serve" })).toBe(true);
  });

  it("holds when a new capability is added: it lands in every lens with no lens edits", () => {
    const issues = run({
      taxonomy: (t) => {
        t.capabilities["serve.notebooks"] = { name: "Notebooks", description: "New spine capability for the test.", status: "active", impact: IMPACT };
        t.capabilities["quality.profiling"] = { name: "Profiling", description: "New band capability for the test.", status: "active", impact: IMPACT };
      },
    });
    expect(issues).toEqual([]);
  });
});

// ------------------------------------------------------------------ derivation

describe("derivation rules", () => {
  it("resolve every capability to a role, including one added later under an existing stage", () => {
    const issues = run({
      taxonomy: (t) => {
        t.capabilities["serve.notebooks"] = { name: "Notebooks", description: "New spine capability for the test.", status: "active", impact: IMPACT };
      },
    });
    expect(issues).toEqual([]);
  });

  it("fail when a capability resolves to no role", () => {
    const issues = run({ derivation: (d) => { d.role_affinity = d.role_affinity.filter((r: Json) => r.match !== "govern.*"); } });
    expect(has(issues, "derivation-capability-unmapped", { msg: "govern.catalog" })).toBe(true);
    expect(codes(issues).filter((c) => c === "derivation-capability-unmapped")).toHaveLength(4); // the four govern capabilities
  });

  it("fail on a rule that matches nothing, or names an unknown role, or repeats a match", () => {
    const issues = run({
      derivation: (d) => {
        d.role_affinity.push({ match: "store.no-such-thing", role: "engine" });
        d.role_affinity.push({ match: "store.warehouse", role: "engine" });
        d.role_affinity.push({ match: "store.olap-serving", role: "wizard" });
      },
    });
    expect(has(issues, "derivation-match-unresolved", { msg: "store.no-such-thing" })).toBe(true);
    expect(has(issues, "derivation-match-duplicate", { msg: "store.warehouse" })).toBe(true);
    expect(has(issues, "derivation-role-unknown", { msg: "wizard" })).toBe(true);
  });

  it("must use the same role vocabulary as the tool schema's role override", () => {
    const issues = run({ derivation: (d) => { d.roles.push({ id: "wizard", label: "Wizard", description: "A role the tool schema does not allow." }); } });
    expect(has(issues, "role-vocabulary-mismatch")).toBe(true);
  });

  it("reject a duplicate role", () => {
    const issues = run({ derivation: (d) => { d.roles.push({ ...d.roles[0] }); } });
    expect(has(issues, "derivation-role-duplicate")).toBe(true);
  });

  it("reject archetype thresholds that leave no room for a stage platform", () => {
    const issues = run({ derivation: (d) => { d.archetype.end_to_end_min_stages = 1; } });
    expect(has(issues, "archetype-thresholds")).toBe(true);
  });

  it("reject a band weight above 1, which would let a tool's extras outweigh its pipeline job", () => {
    const issues = run({ derivation: (d) => { d.band_weight = 2; } });
    expect(has(issues, "schema", { path: "/band_weight" })).toBe(true);
  });

  it("are required", () => {
    const issues = validateDataset({ ...base, derivation: undefined });
    expect(has(issues, "file-missing", { msg: "derivation.json" })).toBe(true);
  });
});

// -------------------------------------------------------------------- the loader

describe("loading", () => {
  it("reports malformed JSON with the file name", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "stack-load-"));
    try {
      cpSync(dataDir, dir, { recursive: true });
      mkdirSync(path.join(dir, "tools"), { recursive: true });
      writeFileSync(path.join(dir, "tools", "broken.json"), "{ not json");
      const issues = validateDataset(loadDataset(dir));
      expect(issues.some((i) => i.code === "json-parse" && i.file.endsWith("tools/broken.json"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ------------------------------------------------------------- the npm script

describe("npm run validate", () => {
  const cli = path.resolve(here, "../src/cli.ts");
  const runCli = (dir: string, extra: string[] = []) =>
    spawnSync(process.execPath, ["--import", "tsx", cli, "--data", dir, ...extra], { encoding: "utf8" });

  it("exits 1 and names the problem when a score is missing its source URL", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "stack-cli-"));
    try {
      cpSync(dataDir, dir, { recursive: true });
      mkdirSync(path.join(dir, "tools"), { recursive: true });
      const rec = specialist({ coverage: { "transform.sql-transform": { level: 3, delivery: "native", note: "Fixture note." } } });
      writeFileSync(path.join(dir, "tools", "fixture-tool.json"), JSON.stringify(rec));

      const result = runCli(dir);
      expect(result.status).toBe(1);
      expect(result.stdout).toContain("fixture-tool.json");
      expect(result.stdout).toContain('missing required property "source"');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exits 0 for a clean dataset, and 1 on warnings only under --strict", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "stack-cli-"));
    try {
      cpSync(dataDir, dir, { recursive: true });
      expect(runCli(dir).status).toBe(0);

      mkdirSync(path.join(dir, "tools"), { recursive: true });
      writeFileSync(path.join(dir, "tools", "fixture-tool.json"), JSON.stringify(specialist({ pairs_with: ["airflow"] })));
      expect(runCli(dir).status).toBe(0);
      expect(runCli(dir, ["--strict"]).status).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("impact text", () => {
  it("is required for every stage that can be a gap and every active capability", () => {
    const issues = run({ taxonomy: (t) => { delete t.capabilities["govern.masking"].impact; delete t.stages.find((s: { id: string }) => s.id === "store").impact; } });
    const missing = issues.filter((i) => i.code === "impact-missing").map((i) => i.path).sort();
    expect(missing).toEqual(["/capabilities/govern.masking/impact", "/stages/2/impact"]);
  });

  it("does not ask for impact on a stage that never surfaces as a gap", () => {
    const issues = run({ taxonomy: (t) => { delete t.stages.find((s: { id: string }) => s.id === "source").impact; } });
    expect(issues.filter((i) => i.code === "impact-missing")).toEqual([]);
  });
});

