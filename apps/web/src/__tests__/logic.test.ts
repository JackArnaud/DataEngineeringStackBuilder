import { describe, expect, it } from "vitest";
import { GLYPH_ROLES } from "../components/glyphs";
import { groupByVendor } from "../components/StackPanel";
import { EXAMPLES } from "../examples";
import { severity } from "../labels";
import { groupCells, joinNames } from "../receipts";
import { RAMP_ORDER, ROLE_LABEL, ROLE_RAMP, rampOf } from "../roles";
import { add, defaultLens, emptyState, isSelectable, parseState, serializeState, toggle } from "../state";
import { dataset, model } from "./fixture";

describe("stack state in the address", () => {
  it("starts empty, on the medallion lens, as a chart", () => {
    expect(emptyState(model)).toEqual({ tools: [], needs: [], lens: "medallion", view: "chart" });
    expect(defaultLens(model)).toBe("medallion");
  });

  it("round-trips: what is written is what is read back", () => {
    const state = { tools: ["dbt-core", "postgres"], needs: ["ingest.cdc"], lens: "grid", view: "table" as const };
    const query = serializeState(state, model);
    expect(query).toBe("?tools=dbt-core,postgres&needs=ingest.cdc&lens=grid&view=table");
    expect(parseState(query, model)).toEqual(state);
  });

  it("leaves defaults out, so an empty stack has an empty address", () => {
    expect(serializeState(emptyState(model), model)).toBe("");
    expect(serializeState({ ...emptyState(model), tools: ["postgres"] }, model)).toBe("?tools=postgres");
  });

  it("writes lists in a canonical order, so the same stack is always the same link", () => {
    const a = serializeState({ ...emptyState(model), tools: ["postgres", "dbt-core"] }, model);
    const b = serializeState({ ...emptyState(model), tools: ["dbt-core", "postgres", "postgres"] }, model);
    expect(a).toBe(b);
  });

  it("drops anything the model no longer has, rather than failing", () => {
    const state = parseState("?tools=postgres,ghost&needs=ingest.cdc,nope&lens=kappa&view=poster", model);
    expect(state).toEqual({ tools: ["postgres"], needs: ["ingest.cdc"], lens: "medallion", view: "chart" });
  });

  it("does not let a portfolio be selected, only its services", () => {
    expect(isSelectable(model, "aws")).toBe(false);
    expect(isSelectable(model, "aws-s3")).toBe(true);
    expect(isSelectable(model, "databricks")).toBe(true); // a bundle is one purchase
    expect(parseState("?tools=aws,aws-s3", model).tools).toEqual(["aws-s3"]);
  });

  it("only accepts spine capabilities as needs", () => {
    expect(parseState("?needs=govern.masking,ingest.cdc", model).needs).toEqual(["ingest.cdc"]);
  });

  it("toggles and adds without duplicates", () => {
    expect(toggle(["a"], "b")).toEqual(["a", "b"]);
    expect(toggle(["a", "b"], "a")).toEqual(["b"]);
    expect(add(["b"], "a", "b")).toEqual(["a", "b"]);
  });
});

describe("the starting examples", () => {
  it("name only tools and needs that exist", () => {
    for (const e of EXAMPLES) {
      for (const id of e.tools) expect(isSelectable(model, id), `${e.label}: ${id}`).toBe(true);
      const spine = new Set(model.capabilities.filter((c) => c.kind === "spine").map((c) => c.id));
      for (const id of e.needs ?? []) expect(spine.has(id), `${e.label}: ${id}`).toBe(true);
    }
  });
});

describe("colour and shape for roles", () => {
  const roles = dataset.derivation!.data as { roles: { id: string }[] };
  const ids = roles.roles.map((r) => r.id);

  it("give every derivation role a colour family, a label and a drawn shape", () => {
    for (const id of ids) {
      expect(ROLE_RAMP[id], id).toBeDefined();
      expect(ROLE_LABEL[id], id).toBeDefined();
    }
    expect([...GLYPH_ROLES].sort()).toEqual([...ids].sort());
  });

  it("use at most three colour families", () => {
    expect(new Set(ids.map(rampOf)).size).toBeLessThanOrEqual(3);
    expect(RAMP_ORDER).toHaveLength(3);
  });

  it("group movers, transformers and structure", () => {
    expect(rampOf("mover")).toBe("movement");
    expect(rampOf("modeller")).toBe("transform");
    expect(rampOf("engine")).toBe("transform");
    expect(rampOf("gatekeeper")).toBe("structural");
  });
});

describe("severity", () => {
  it("pairs a tone with a word at every level, so colour is never alone", () => {
    expect([5, 4, 3, 2, 1].map((n) => severity(n))).toEqual([
      { tone: "critical", word: "Critical" },
      { tone: "serious", word: "Serious" },
      { tone: "warning", word: "Moderate" },
      { tone: "low", word: "Low" },
      { tone: "low", word: "Minor" },
    ]);
  });
});

describe("the picker's vendor groups", () => {
  it("group by vendor, bundles before tools, and keep a portfolio as a header not a choice", () => {
    const groups = groupByVendor(model, "");
    const databricks = groups.find((g) => g.vendor === "Databricks")!;
    expect(databricks.tools[0]!.kind).toBe("bundle");
    const aws = groups.find((g) => g.vendor === "Amazon Web Services")!;
    expect(aws.portfolio?.id).toBe("aws");
    expect(aws.tools.some((t) => t.id === "aws")).toBe(false);
  });

  it("filter by name, tagline and vendor", () => {
    expect(groupByVendor(model, "postgres").flatMap((g) => g.tools.map((t) => t.id))).toContain("postgres");
    expect(groupByVendor(model, "zzz")).toEqual([]);
    expect(groupByVendor(model, "masking").length).toBeGreaterThan(0);
  });

  it("show every service when the search matches a portfolio", () => {
    const aws = groupByVendor(model, "Amazon Web Services").find((g) => g.portfolio)!;
    expect(aws.tools).toHaveLength(9);
  });
});

describe("grouping cells for receipts", () => {
  const stageOrder = model.stages.map((s) => s.id);
  const capabilityOrder = model.capabilities.map((c) => c.id);

  it("merges a band capability scored on several stages into one entry with one set of sources", () => {
    const uc = model.tools.find((t) => t.id === "unity-catalog")!;
    const groups = groupCells(uc.cells, stageOrder, capabilityOrder);
    const access = groups.filter((g) => g.capability === "govern.access-control");
    expect(access).toHaveLength(1);
    expect(access[0]!.stages).toEqual(["store", "transform", "serve"]);
    expect(access[0]!.evidence).toHaveLength(1);
  });

  it("keeps entries with different scores separate, in taxonomy order", () => {
    const dbt = model.tools.find((t) => t.id === "dbt-core")!;
    const tests = groupCells(dbt.cells, stageOrder, capabilityOrder).filter((g) => g.capability === "quality.tests");
    expect(tests.map((g) => `${g.level}@${g.stages.join(",")}`)).toEqual(["2@store", "3@transform"]);
  });

  it("loses no evidence: every cell's evidence appears in a group", () => {
    for (const tool of model.tools) {
      const groups = groupCells(tool.cells, stageOrder, capabilityOrder);
      const refs = new Set(groups.flatMap((g) => g.evidence.map((e) => `${e.tool}${e.ref}`)));
      for (const cell of tool.cells) for (const e of cell.evidence) expect(refs.has(`${e.tool}${e.ref}`), `${tool.id} ${cell.key}`).toBe(true);
    }
  });

  it("joins names in plain English", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["Store"])).toBe("Store");
    expect(joinNames(["Store", "Serve"])).toBe("Store and Serve");
    expect(joinNames(["Store", "Transform", "Serve"])).toBe("Store, Transform and Serve");
  });
});
