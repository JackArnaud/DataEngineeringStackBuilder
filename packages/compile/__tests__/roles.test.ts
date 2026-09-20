import { describe, expect, it } from "vitest";
import { deriveArchetype, deriveRole } from "../src/roles.js";
import { cellsOf, derivation, sc, taxonomy } from "./helpers.js";
import type { Json } from "./helpers.js";

const role = (coverage: Json, bands: Json[] = []) => deriveRole(cellsOf(coverage, bands), taxonomy, derivation);
const archetype = (coverage: Json, bands: Json[] = []) => deriveArchetype(cellsOf(coverage, bands), taxonomy, derivation);

describe("role", () => {
  it("follows the role a lone level-3 capability suggests", () => {
    expect(role({ "transform.sql-transform": sc(3) })).toBe("modeller");
    expect(role({ "ingest.cdc": sc(3) })).toBe("mover");
    expect(role({ "source.oltp": sc(3) })).toBe("substrate");
    expect(role({ "orchestrate.scheduling": sc(3) })).toBe("conductor");
    expect(role({ "serve.bi-viz": sc(3) })).toBe("surface");
  });

  it("uses exact rules over stage rules: a warehouse is an engine, a table format is substrate", () => {
    expect(role({ "store.warehouse": sc(3) })).toBe("engine");
    expect(role({ "store.table-format": sc(3) })).toBe("substrate");
    expect(role({ "transform.code-transform": sc(3) })).toBe("engine");
    expect(role({ "serve.ml-serving": sc(3) })).toBe("engine");
  });

  it("breaks a tie toward the role listed first in the derivation", () => {
    expect(role({ "ingest.cdc": sc(3), "transform.sql-transform": sc(3) })).toBe("mover");
    // engine is listed before substrate.
    expect(role({ "store.warehouse": sc(3), "store.table-format": sc(3) })).toBe("engine");
  });

  it("weights a spine capability above a band capability", () => {
    expect(role({ "transform.sql-transform": sc(3) }, [{ band: "quality.tests", ...sc(3) }])).toBe("modeller");
  });

  it("lets several band capabilities outvote one spine capability", () => {
    const bands = ["govern.catalog", "govern.access-control", "govern.masking"].map((band) => ({ band, ...sc(3) }));
    expect(role({ "transform.sql-transform": sc(3) }, bands)).toBe("gatekeeper");
  });

  it("counts a band capability once however many stages it is scored on", () => {
    const stages = { scope: ["ingest", "store", "transform", "serve"] };
    // Four stages of quality.tests would be 2.0 if each counted, beating the mover's 1.0.
    expect(role({ "ingest.cdc": sc(3) }, [{ band: "quality.tests", ...sc(3), ...stages }])).toBe("mover");
  });

  it("only lets the tool's top level vote", () => {
    // Level-3 quality.tests alone decides, even though the spine capability is the bigger job.
    expect(role({ "transform.sql-transform": sc(2) }, [{ band: "quality.tests", ...sc(3) }])).toBe("sentinel");
  });

  it("falls back to level 2 when nothing scores 3", () => {
    expect(role({ "ingest.cdc": sc(2), "transform.sql-transform": sc(1, "community") })).toBe("mover");
  });

  it("gives a bands-only tool a role from its bands", () => {
    expect(role({}, [{ band: "govern.access-control", ...sc(3), scope: ["store"] }])).toBe("gatekeeper");
    expect(role({}, [{ band: "quality.anomaly-detection", ...sc(3), scope: ["ingest"] }])).toBe("sentinel");
    expect(role({}, [{ band: "platform.dev-experience", ...sc(3), scope: ["transform"] }])).toBe("surface");
  });

  it("gives a tool with only conditional scores a role from those", () => {
    expect(role({}, [{ band: "govern.masking", ...sc(3, "native", { constraint: ["enterprise-tier"] }), scope: ["store"] }])).toBe("gatekeeper");
  });
});

describe("archetype", () => {
  it("is a specialist with one job", () => {
    expect(archetype({ "transform.sql-transform": sc(3) })).toBe("specialist");
    expect(archetype({ "orchestrate.scheduling": sc(3), "orchestrate.dependency-dag": sc(3) })).toBe("specialist");
  });

  it("is a stage platform with three level-3 capabilities in one stage", () => {
    expect(archetype({ "ingest.batch-extract": sc(3), "ingest.cdc": sc(3), "ingest.stream-ingest": sc(3) })).toBe("stage-platform");
  });

  it("is a stage platform across two or three stages", () => {
    expect(archetype({ "store.warehouse": sc(3), "serve.query-engine": sc(3) })).toBe("stage-platform");
    expect(archetype({ "transform.sql-transform": sc(3), "orchestrate.scheduling": sc(3), "serve.semantic-layer": sc(3) })).toBe("stage-platform");
  });

  it("is end-to-end from four stages", () => {
    expect(archetype({ "source.oltp": sc(3), "store.warehouse": sc(3), "transform.sql-transform": sc(3), "serve.bi-viz": sc(3) })).toBe("end-to-end");
  });

  it("counts only level 3", () => {
    expect(archetype({ "source.oltp": sc(2), "store.warehouse": sc(2), "transform.sql-transform": sc(3), "serve.bi-viz": sc(2), "orchestrate.scheduling": sc(2) })).toBe("specialist");
  });

  it("does not let bands make a tool broader", () => {
    const bands = ["govern.access-control", "quality.tests", "observe.monitoring", "platform.environments"].map((band) => ({ band, ...sc(3), scope: ["ingest", "store", "transform", "serve"] }));
    expect(archetype({}, bands)).toBe("specialist");
  });
});
