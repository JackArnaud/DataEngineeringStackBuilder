import { describe, expect, it } from "vitest";
import { projectTool } from "../src/project.js";
import { cellsOf, lens, sc, taxonomy } from "./helpers.js";
import type { Json } from "./helpers.js";

const medallion = lens("medallion");
const grid = lens("grid");
const project = (coverage: Json, bands: Json[] = [], override?: string[], l = medallion) => projectTool(l, taxonomy, cellsOf(coverage, bands), override);

describe("zones and span in the medallion lens", () => {
  it("gives each zone the best level of the cells placed there", () => {
    const view = project({ "transform.sql-transform": sc(3), "orchestrate.scheduling": sc(2) });
    const intensity = Object.fromEntries(Object.entries(view.zones).map(([z, v]) => [z, v.intensity]));
    expect(intensity).toEqual({ silver: 3, gold: 3, source: 2, bronze: 2, consume: 2 });
  });

  it("makes the span the tool's core: the zones where it is strongest", () => {
    // Scheduling spans every zone at level 2, but the tool is a level-3 modeller in silver and gold.
    expect(project({ "transform.sql-transform": sc(3), "orchestrate.scheduling": sc(2) }).span).toEqual(["silver", "gold"]);
  });

  it("does not let a capability the lens spreads over every zone define the core", () => {
    // Medallion puts orchestration in every zone. Level-3 scheduling must not make a level-3 modeller
    // core everywhere, though it still reaches every zone at full intensity.
    const view = project({ "transform.sql-transform": sc(3), "orchestrate.scheduling": sc(3) });
    expect(view.span).toEqual(["silver", "gold"]);
    expect(view.zones.source).toMatchObject({ intensity: 3 });
    expect(view.zones.consume).toMatchObject({ intensity: 3 });
  });

  it("falls back to wherever it is strongest when every cell is spread over every zone", () => {
    expect(project({ "orchestrate.scheduling": sc(3), "orchestrate.dependency-dag": sc(2) }).span).toEqual(["source", "bronze", "silver", "gold", "consume"]);
  });

  it("takes a pinned cell at a lower level over a lens-wide one at a higher level", () => {
    // Core is where the tool does localised work, even when that work is thinner than its orchestration.
    expect(project({ "ingest.cdc": sc(1, "community"), "orchestrate.scheduling": sc(3) }).span).toEqual(["source", "bronze"]);
  });

  it("does not treat a stage as lens-wide in a lens where it has its own column", () => {
    const view = project({ "transform.sql-transform": sc(3), "orchestrate.scheduling": sc(3) }, [], undefined, grid);
    expect(view.span).toEqual(["transform", "orchestrate"]);
  });

  it("orders the span as the lens orders its zones", () => {
    expect(project({ "store.object-store": sc(3) }).span).toEqual(["bronze", "silver", "gold"]);
  });

  it("uses the best level present when nothing reaches 3", () => {
    const view = project({ "ingest.cdc": sc(2), "store.object-store": sc(1, "community") });
    expect(view.span).toEqual(["source", "bronze"]);
    expect(view.zones.silver).toMatchObject({ intensity: 1 });
  });

  it("lists the cells behind each zone, for receipts", () => {
    const view = project({ "transform.sql-transform": sc(3), "orchestrate.scheduling": sc(2) });
    expect(view.zones.silver!.cells).toEqual(["orchestrate.scheduling@orchestrate", "transform.sql-transform@transform"]);
  });

  it("follows a capability override over the stage default", () => {
    expect(project({ "transform.stream-processing": sc(3) }).span).toEqual(["bronze", "silver"]);
    expect(project({ "store.olap-serving": sc(3) }).span).toEqual(["gold"]);
  });
});

describe("cells with no honest zone", () => {
  it("put a spine cell in the rail and nowhere else", () => {
    const view = project({ "ingest.reverse-etl": sc(2) });
    expect(view).toMatchObject({ rail: ["ingest.reverse-etl@ingest"], zones: {}, span: [] });
  });

  it("put a band cell in the rail at every stage it is scored on", () => {
    const view = project({}, [{ band: "observe.cost-visibility", ...sc(2), scope: ["store", "serve"] }]);
    expect(view.rail).toEqual(["observe.cost-visibility@serve", "observe.cost-visibility@store"]);
    expect(view.bands).toEqual({});
  });
});

describe("bands", () => {
  it("are an overlay by zone, never part of the span", () => {
    const view = project({}, [{ band: "govern.access-control", ...sc(3), scope: ["serve"] }]);
    expect(view.bands).toEqual({ consume: { govern: 3 } });
    expect(view.zones).toEqual({});
    expect(view.span).toEqual([]);
  });

  it("keep the best level per band in each zone", () => {
    const view = project({}, [
      { band: "govern.catalog", ...sc(3), scope: ["store"] },
      { band: "govern.masking", ...sc(2), scope: ["store"] },
    ]);
    expect(view.bands.bronze).toEqual({ govern: 3 });
  });

  it("do not widen the span of a tool that also has spine coverage", () => {
    // quality.tests at store would reach bronze, but the tool's core is transform.
    const view = project({ "transform.sql-transform": sc(3) }, [{ band: "quality.tests", ...sc(2), scope: ["store"] }]);
    expect(view.span).toEqual(["silver", "gold"]);
    expect(view.bands.bronze).toEqual({ quality: 2 });
  });
});

describe("a per-tool lens override", () => {
  it("replaces spine placement and is flagged", () => {
    const view = project({ "store.object-store": sc(3) }, [], ["gold"]);
    expect(view).toMatchObject({ span: ["gold"], overridden: true });
    expect(Object.keys(view.zones)).toEqual(["gold"]);
  });

  it("places even a cell the lens would have left unmapped", () => {
    const view = project({ "ingest.reverse-etl": sc(2) }, [], ["gold"]);
    expect(view.rail).toEqual([]);
    expect(view.zones.gold).toMatchObject({ intensity: 2 });
  });

  it("leaves bands following the lens rules", () => {
    const view = project({ "store.object-store": sc(3) }, [{ band: "quality.tests", ...sc(3), scope: ["store"] }], ["gold"]);
    expect(Object.keys(view.bands).sort()).toEqual(["bronze", "gold", "silver"]);
  });
});

describe("conditional levels", () => {
  it("are not placed: a tool sits where it is as sold, not where a higher plan would put it", () => {
    const view = project({}, [{ band: "govern.masking", ...sc(3, "native", { constraint: ["enterprise-tier"] }), scope: ["store"] }]);
    expect(view).toMatchObject({ zones: {}, bands: {}, rail: [], span: [] });
  });
});

describe("the audit grid", () => {
  it("places every spine cell in its own stage's column", () => {
    const view = project({ "store.warehouse": sc(3), "serve.query-engine": sc(3) }, [], undefined, grid);
    expect(view.span).toEqual(["store", "serve"]);
  });
});
