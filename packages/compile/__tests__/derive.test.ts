import { describe, expect, it } from "vitest";
import { applyTier, buildCells, contributionsOf, hasEnterpriseTierUnlock } from "../src/derive.js";
import type { Cell } from "../src/derive.js";
import type { ToolRecord } from "../src/types.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = Record<string, any>;

const SRC = "https://example.com/x";
const sc = (level: number, delivery = "native", extra: Json = {}): Json => ({ level, delivery, note: "Fixture note for tests.", source: SRC, ...extra });

const common = { vendor: "V", license: "open-source", deployment: ["saas"], pricing_model: "free", taxonomy_version: "1.0.0", updated: "2026-09-20" };
const tool = (id: string, coverage: Json = {}, bands: Json[] = []): ToolRecord =>
  ({ id, name: id, kind: "tool", ...common, ...(Object.keys(coverage).length ? { coverage } : {}), ...(bands.length ? { bands } : {}) }) as unknown as ToolRecord;
const bundle = (id: string, includes: string[]): ToolRecord =>
  ({ id, name: id, kind: "bundle", ...common, includes, bundling: "single-contract" }) as unknown as ToolRecord;
const portfolio = (id: string, includes: string[]): ToolRecord =>
  ({ id, name: id, kind: "portfolio", ...common, includes, bundling: "a-la-carte" }) as unknown as ToolRecord;

const cellsFor = (id: string, records: ToolRecord[]): Cell[] =>
  buildCells(contributionsOf(id, new Map(records.map((r) => [r.id, r]))));
const at = (cells: Cell[], key: string): Cell => {
  const cell = cells.find((c) => c.key === key);
  if (!cell) throw new Error(`no cell ${key}; have ${cells.map((c) => c.key).join(", ")}`);
  return cell;
};

describe("a single tool", () => {
  const records = [
    tool(
      "a",
      { "transform.sql-transform": sc(3), "orchestrate.scheduling": sc(2) },
      [
        { band: "quality.tests", ...sc(3), scope: ["transform", "store"] },
        { band: "observe.monitoring", ...sc(2) },
      ],
    ),
  ];

  it("makes one cell per capability and stage, with a band entry expanded across its scope", () => {
    expect(cellsFor("a", records).map((c) => c.key)).toEqual([
      "observe.monitoring@orchestrate",
      "observe.monitoring@transform",
      "orchestrate.scheduling@orchestrate",
      "quality.tests@store",
      "quality.tests@transform",
      "transform.sql-transform@transform",
    ]);
  });

  it("defaults an unscoped band to the stages the tool occupies", () => {
    const keys = cellsFor("a", records).filter((c) => c.capability === "observe.monitoring").map((c) => c.stage);
    expect(keys).toEqual(["orchestrate", "transform"]);
  });

  it("carries level, delivery and the record as provenance", () => {
    const cell = at(cellsFor("a", records), "transform.sql-transform@transform");
    expect(cell).toMatchObject({ level: 3, delivery: "native", maturity: "ga", via: ["a"], conditional: [] });
  });

  it("keeps a receipt for every score: the record, the pointer into it, the note and the source", () => {
    const cell = at(cellsFor("a", records), "quality.tests@store");
    expect(cell.evidence).toEqual([
      { tool: "a", ref: "/bands/0", level: 3, delivery: "native", maturity: "ga", note: "Fixture note for tests.", source: SRC },
    ]);
  });

  it("defaults maturity to ga and carries an explicit one", () => {
    const cells = cellsFor("m", [tool("m", { "transform.sql-transform": sc(3, "native", { maturity: "preview" }) })]);
    expect(cells[0]!.maturity).toBe("preview");
  });
});

describe("a bundle", () => {
  const parts = [
    tool("core", { "transform.sql-transform": sc(3) }),
    tool("sched", { "orchestrate.scheduling": sc(3), "orchestrate.ci-cd": sc(1, "partner") }),
  ];
  const cells = cellsFor("suite", [...parts, bundle("suite", ["core", "sched"])]);

  it("derives coverage from its parts, never from itself", () => {
    expect(cells.map((c) => c.key)).toEqual(["orchestrate.ci-cd@orchestrate", "orchestrate.scheduling@orchestrate", "transform.sql-transform@transform"]);
  });

  it("downgrades a part's native delivery to bundled and says where it came from", () => {
    const cell = at(cells, "transform.sql-transform@transform");
    expect(cell).toMatchObject({ level: 3, delivery: "bundled", via: ["core"] });
    expect(cell.evidence[0]).toMatchObject({ delivery: "bundled", scored_delivery: "native" });
  });

  it("leaves partner delivery alone, so partner breadth never reads as in the box", () => {
    expect(at(cells, "orchestrate.ci-cd@orchestrate")).toMatchObject({ level: 1, delivery: "partner" });
  });

  it("takes the highest level across parts", () => {
    const merged = cellsFor("s", [tool("lo", { "transform.sql-transform": sc(2) }), tool("hi", { "transform.sql-transform": sc(3) }), bundle("s", ["lo", "hi"])]);
    expect(at(merged, "transform.sql-transform@transform")).toMatchObject({ level: 3, via: ["hi"] });
  });
});

describe("a portfolio", () => {
  const records = [
    tool("s3", { "store.object-store": sc(3) }),
    tool("core", { "transform.sql-transform": sc(3) }),
    bundle("suite", ["core"]),
    portfolio("cloud", ["s3", "suite"]),
  ];
  const cells = cellsFor("cloud", records);

  it("does not downgrade delivery: its parts are separate purchases, and via says which one", () => {
    expect(at(cells, "store.object-store@store")).toMatchObject({ delivery: "native", via: ["s3"] });
  });

  it("keeps the downgrade from a bundle nested inside it", () => {
    expect(at(cells, "transform.sql-transform@transform")).toMatchObject({ delivery: "bundled", via: ["core"] });
  });

  it("points via at the leaf records that hold the score, not at the intermediate bundle", () => {
    for (const c of cells) for (const id of c.via) expect(["s3", "core"]).toContain(id);
  });
});

describe("ties between parts", () => {
  it("lists every part that ties on level and delivery, sorted", () => {
    const cells = cellsFor("s", [
      tool("zeta", { "transform.sql-transform": sc(3) }),
      tool("alpha", { "transform.sql-transform": sc(3) }),
      bundle("s", ["zeta", "alpha"]),
    ]);
    expect(at(cells, "transform.sql-transform@transform").via).toEqual(["alpha", "zeta"]);
  });

  it("prefers the stronger delivery at the same level", () => {
    const cells = cellsFor("s", [
      tool("comm", { "orchestrate.ci-cd": sc(1, "community") }),
      tool("part", { "orchestrate.ci-cd": sc(1, "partner") }),
      bundle("s", ["comm", "part"]),
    ]);
    expect(at(cells, "orchestrate.ci-cd@orchestrate")).toMatchObject({ delivery: "partner", via: ["part"] });
  });

  it("takes the best maturity among tied winners", () => {
    const cells = cellsFor("s", [
      tool("pre", { "transform.sql-transform": sc(3, "native", { maturity: "preview" }) }),
      tool("ga", { "transform.sql-transform": sc(3) }),
      bundle("s", ["pre", "ga"]),
    ]);
    expect(at(cells, "transform.sql-transform@transform").maturity).toBe("ga");
  });

  it("keeps every underlying score as evidence, not only the winners", () => {
    const cells = cellsFor("s", [
      tool("lo", { "transform.sql-transform": sc(2) }),
      tool("hi", { "transform.sql-transform": sc(3) }),
      bundle("s", ["lo", "hi"]),
    ]);
    expect(at(cells, "transform.sql-transform@transform").evidence.map((e) => e.tool)).toEqual(["hi", "lo"]);
  });

  it("counts a part reachable by two routes once", () => {
    const cells = cellsFor("cloud", [
      tool("core", { "transform.sql-transform": sc(3) }),
      bundle("suite", ["core"]),
      portfolio("cloud", ["suite", "core"]),
    ]);
    const cell = at(cells, "transform.sql-transform@transform");
    expect(cell.evidence).toHaveLength(1);
    // The route through the bundle downgrades it; the direct route does not. The stronger wins.
    expect(cell.delivery).toBe("native");
  });
});

describe("constrained scores never count as a free upgrade", () => {
  const enterprise = { constraint: ["enterprise-tier"] };

  it("keeps the unconstrained level as the base and lists the higher one as conditional", () => {
    const cells = cellsFor("s", [
      tool("open", { "orchestrate.dependency-dag": sc(2) }),
      tool("paid", { "orchestrate.dependency-dag": sc(3, "native", enterprise) }),
      bundle("s", ["open", "paid"]),
    ]);
    const cell = at(cells, "orchestrate.dependency-dag@orchestrate");
    expect(cell.level).toBe(2);
    expect(cell.via).toEqual(["open"]);
    expect(cell.conditional).toEqual([{ level: 3, delivery: "bundled", maturity: "ga", constraint: ["enterprise-tier"], via: ["paid"] }]);
  });

  it("has no base level when only a constrained score exists", () => {
    const cell = at(cellsFor("paid", [tool("paid", { "orchestrate.dependency-dag": sc(3, "native", enterprise) })]), "orchestrate.dependency-dag@orchestrate");
    expect(cell).toMatchObject({ level: 0, via: [] });
    expect(cell.delivery).toBeUndefined();
    expect(cell.maturity).toBeUndefined();
    expect(cell.conditional).toHaveLength(1);
  });

  it("drops a constrained score that adds nothing over the base", () => {
    const cell = at(
      cellsFor("s", [tool("a", { "orchestrate.dependency-dag": sc(3) }), tool("b", { "orchestrate.dependency-dag": sc(3, "native", enterprise) }), bundle("s", ["a", "b"])]),
      "orchestrate.dependency-dag@orchestrate",
    );
    expect(cell.conditional).toEqual([]);
    // The score is still a receipt.
    expect(cell.evidence.map((e) => e.tool).sort()).toEqual(["a", "b"]);
  });

  it("treats any constraint the same way, not only enterprise-tier", () => {
    const cell = at(cellsFor("t", [tool("t", { "orchestrate.dependency-dag": sc(3, "native", { constraint: ["region-limited", "own-cloud-only"] }) })]), "orchestrate.dependency-dag@orchestrate");
    expect(cell.conditional[0]!.constraint).toEqual(["own-cloud-only", "region-limited"]);
  });

  it("lists separate conditional levels for separate constraints, highest first", () => {
    const cell = at(
      cellsFor("s", [
        tool("a", { "orchestrate.dependency-dag": sc(2, "native", { constraint: ["region-limited"] }) }),
        tool("b", { "orchestrate.dependency-dag": sc(3, "native", enterprise) }),
        bundle("s", ["a", "b"]),
      ]),
      "orchestrate.dependency-dag@orchestrate",
    );
    expect(cell.conditional.map((c) => `${c.level}:${c.constraint.join("+")}`)).toEqual(["3:enterprise-tier", "2:region-limited"]);
  });
});

describe("inherited scores", () => {
  it("flags a cell only when every score behind it was copied by a migration", () => {
    const only = cellsFor("s", [tool("a", { "transform.sql-transform": sc(3, "native", { inherited: true }) }), bundle("s", ["a"])]);
    expect(at(only, "transform.sql-transform@transform").inherited).toBe(true);

    const mixed = cellsFor("s", [
      tool("a", { "transform.sql-transform": sc(3, "native", { inherited: true }) }),
      tool("b", { "transform.sql-transform": sc(3) }),
      bundle("s", ["a", "b"]),
    ]);
    expect(at(mixed, "transform.sql-transform@transform").inherited).toBeUndefined();
  });
});

describe("confirming a tier", () => {
  const enterprise = { constraint: ["enterprise-tier"] };

  it("promotes an enterprise-tier-only conditional into the base level", () => {
    const cell = at(cellsFor("paid", [tool("paid", { "orchestrate.dependency-dag": sc(3, "native", enterprise) })]), "orchestrate.dependency-dag@orchestrate");
    const promoted = applyTier(cell, true);
    expect(promoted).toMatchObject({ level: 3, delivery: "native", maturity: "ga", via: ["paid"], conditional: [] });
    expect(hasEnterpriseTierUnlock([cell])).toBe(true);
  });

  it("leaves the cell alone when not tiered up, or when it has nothing to promote", () => {
    const cell = at(cellsFor("paid", [tool("paid", { "orchestrate.dependency-dag": sc(3, "native", enterprise) })]), "orchestrate.dependency-dag@orchestrate");
    expect(applyTier(cell, false)).toBe(cell);
    const plain = at(cellsFor("a", [tool("a", { "orchestrate.dependency-dag": sc(2) })]), "orchestrate.dependency-dag@orchestrate");
    expect(applyTier(plain, true)).toBe(plain);
    expect(hasEnterpriseTierUnlock([plain])).toBe(false);
  });

  it("never promotes a constraint that is not settled by tier alone", () => {
    const cell = at(cellsFor("t", [tool("t", { "orchestrate.dependency-dag": sc(3, "native", { constraint: ["enterprise-tier", "region-limited"] }) })]), "orchestrate.dependency-dag@orchestrate");
    expect(applyTier(cell, true)).toBe(cell);
    expect(hasEnterpriseTierUnlock([cell])).toBe(false);
  });

  it("keeps a higher, differently-constrained conditional after promoting the enterprise-tier one", () => {
    const cell = at(
      cellsFor("s", [
        tool("a", { "orchestrate.dependency-dag": sc(2, "native", enterprise) }),
        tool("b", { "orchestrate.dependency-dag": sc(3, "native", { constraint: ["region-limited"] }) }),
        bundle("s", ["a", "b"]),
      ]),
      "orchestrate.dependency-dag@orchestrate",
    );
    const promoted = applyTier(cell, true);
    expect(promoted.level).toBe(2);
    expect(promoted.via).toEqual(["a"]);
    expect(promoted.conditional).toEqual([{ level: 3, delivery: "bundled", maturity: "ga", constraint: ["region-limited"], via: ["b"] }]);
  });
});

describe("bad composition", () => {
  it("refuses a loop", () => {
    const records = [bundle("a", ["b"]), portfolio("b", ["a"])];
    expect(() => cellsFor("a", records)).toThrow(/composition loop: a -> b -> a/);
  });

  it("refuses an unknown part", () => {
    expect(() => cellsFor("a", [bundle("a", ["ghost"])])).toThrow(/unknown record "ghost"/);
  });
});
