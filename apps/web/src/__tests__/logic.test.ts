import { describe, expect, it } from "vitest";
import { GLYPH_ROLES } from "../components/glyphs";
import { coversStage, groupByVendor } from "../picker";
import { EXAMPLES } from "../examples";
import { buildLanes } from "../components/LensMatrix";
import { CLOUDS, NEED_CARDS, TOOL_STEPS, cardIsOn } from "../landing";
import { severity } from "../labels";
import { groupCells, joinNames } from "../receipts";
import { RAMP_ORDER, ROLE_RAMP, rampOf } from "../roles";
import { computeGaps, groupGaps } from "@compile";
import { add, defaultLens, emptyState, isSelectable, parseState, serializeState, toggle } from "../state";
import { dataset, model } from "./fixture";

describe("stack state in the address", () => {
  it("keeps set-aside capabilities in the address, and drops any that are not cross-cutting capabilities", () => {
    const state = parseState("?tools=postgres&skip=govern.masking,ingest.cdc,ghost,quality.tests", model);
    expect(state.skip).toEqual(["govern.masking", "quality.tests"]);
    expect(serializeState(state, model)).toBe("?tools=postgres&skip=govern.masking,quality.tests");
  });

  it("keeps a choice of tool for a task, and drops one for a tool that is not in the stack or a task that is not a spine capability", () => {
    const state = parseState("?tools=aws-mwaa,github&use=orchestrate.scheduling:github,orchestrate.scheduling:ghost,govern.masking:github,nope:github", model);
    expect(state.use).toEqual({ "orchestrate.scheduling": "github" });
    expect(serializeState(state, model)).toBe("?tools=aws-mwaa,github&use=orchestrate.scheduling:github");
    // A tool that is left out of the address takes its choice with it.
    expect(parseState("?tools=aws-mwaa&use=orchestrate.scheduling:github", model).use).toEqual({});
  });

  it("starts empty, on the medallion lens, as a chart", () => {
    expect(emptyState(model)).toEqual({ tools: [], needs: [], skip: [], use: {}, lens: "medallion", view: "chart" });
    expect(defaultLens(model)).toBe("medallion");
  });

  it("round-trips: what is written is what is read back", () => {
    const state = { tools: ["dbt-core", "postgres"], needs: ["ingest.cdc"], skip: ["govern.masking"], use: { "transform.sql-transform": "dbt-core" }, lens: "grid", view: "table" as const };
    const query = serializeState(state, model);
    expect(query).toBe("?tools=dbt-core,postgres&needs=ingest.cdc&skip=govern.masking&use=transform.sql-transform:dbt-core&lens=grid&view=table");
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
    expect(state).toEqual({ tools: ["postgres"], needs: ["ingest.cdc"], skip: [], use: {}, lens: "medallion", view: "chart" });
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
  const roles = dataset.derivation!.data as { roles: { id: string; label: string }[] };
  const ids = roles.roles.map((r) => r.id);

  it("give every derivation role a colour family and a drawn shape", () => {
    for (const id of ids) expect(ROLE_RAMP[id], id).toBeDefined();
    expect([...GLYPH_ROLES].sort()).toEqual([...ids].sort());
  });

  it("name every role in words a newcomer would know, and never the id", () => {
    // The ids are stable keys in the data; the labels are what people read.
    const jargon = /substrate|gatekeeper|sentinel|conductor|mover|modeller|surface/i;
    for (const r of roles.roles) {
      expect(r.label, r.id).toMatch(/^[A-Z][a-z]+$/);
      expect(r.label, r.id).not.toMatch(jargon);
    }
    expect(new Set(roles.roles.map((r) => r.label)).size).toBe(roles.roles.length);
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
    expect(aws.tools).toHaveLength(aws.portfolio!.includes!.length);
  });
});

describe("narrowing the picker", () => {
  it("keeps only tools with a spine capability in the stage, not ones that only have a band there", () => {
    const orchestrate = groupByVendor(model, "", "orchestrate").flatMap((g) => g.tools.map((t) => t.id));
    expect(orchestrate).toContain("dbt-core");
    expect(orchestrate).not.toContain("aws-s3");
    const uc = model.tools.find((t) => t.id === "unity-catalog")!;
    expect(uc.cells.some((c) => c.stage === "store")).toBe(true); // it has bands at Store...
    expect(coversStage(uc, "store")).toBe(false); // ...but nothing that stores
  });

  it("puts a bundle's parts straight after it, marked as parts", () => {
    const databricks = groupByVendor(model, "").find((g) => g.vendor === "Databricks")!;
    expect(databricks.tools[0]!.kind).toBe("bundle");
    const bundle = databricks.tools[0]!;
    const next = databricks.tools.slice(1, 1 + (bundle.includes?.length ?? 0));
    expect(next.every((t) => bundle.includes?.includes(t.id))).toBe(true);
    for (const t of next) expect(databricks.parts.has(t.id)).toBe(true);
    expect(databricks.parts.has(bundle.id)).toBe(false);
  });

  it("combines a search with a stage", () => {
    const ids = groupByVendor(model, "aws", "ingest").flatMap((g) => g.tools.map((t) => t.id));
    expect(ids).toContain("aws-dms");
    expect(ids).not.toContain("aws-athena");
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

describe("the example stacks", () => {
  const spine = new Set(model.capabilities.filter((c) => c.kind === "spine").map((c) => c.id));

  it("only use tools and needs that exist, and no portfolio", () => {
    for (const e of EXAMPLES) {
      for (const id of e.tools) expect(isSelectable(model, id), `${e.label}: ${id}`).toBe(true);
      for (const id of e.needs ?? []) expect(spine.has(id), `${e.label}: ${id}`).toBe(true);
    }
  });

  it("have distinct names, a story and something to notice", () => {
    expect(new Set(EXAMPLES.map((e) => e.label)).size).toBe(EXAMPLES.length);
    for (const e of EXAMPLES) {
      expect(e.hint.length, e.label).toBeGreaterThan(10);
      expect(e.notice.length, e.label).toBeGreaterThan(40);
    }
  });

  it("produce a gap report without error, and none of them is an empty stack's worth of noise", () => {
    for (const e of EXAMPLES) {
      const report = computeGaps(model, { tools: e.tools, needs: e.needs });
      expect(report.stages.filter((s) => s.best_level > 0).length, e.label).toBeGreaterThanOrEqual(3);
      // The gap list is rolled up, so even a thin stack stays a page long.
      expect(groupGaps(model, report.gaps).length, e.label).toBeLessThan(20);
    }
  });

  it("include stacks with version control and CI/CD, with open-source engines, and ending in AI", () => {
    const uses = (id: string) => EXAMPLES.some((e) => e.tools.includes(id));
    for (const id of ["github", "gitlab", "azure-devops", "apache-spark-kubernetes", "apache-airflow-kubernetes", "gcp-vertex-ai", "aws-sagemaker"]) expect(uses(id), id).toBe(true);
    expect(EXAMPLES.some((e) => e.needs?.includes("serve.ml-serving"))).toBe(true);
  });
});

describe("the guided start's choices", () => {
  const spine = new Set(model.capabilities.filter((c) => c.kind === "spine").map((c) => c.id));

  it("offer only records that exist, each on one screen", () => {
    const seen = new Set<string>();
    for (const step of TOOL_STEPS) {
      for (const id of step.tiles) {
        expect(isSelectable(model, id), `${step.id}: ${id}`).toBe(true);
        expect(seen.has(id), `${id} appears twice`).toBe(false);
        seen.add(id);
      }
    }
  });

  it("offer clouds that are portfolios, so choosing one leads to its services", () => {
    for (const id of CLOUDS) {
      const p = model.tools.find((t) => t.id === id);
      expect(p?.kind, id).toBe("portfolio");
      expect(p!.includes!.length, id).toBeGreaterThan(5);
    }
  });

  it("stand for real spine capabilities, without overlap between cards", () => {
    const used = new Set<string>();
    for (const card of NEED_CARDS) {
      expect(card.needs.length, card.id).toBeGreaterThan(0);
      for (const n of card.needs) {
        expect(spine.has(n), `${card.id}: ${n}`).toBe(true);
        expect(used.has(n), `${n} is on two cards`).toBe(false);
        used.add(n);
      }
    }
  });

  it("are on only when the stack needs everything they stand for", () => {
    const card = NEED_CARDS.find((c) => c.needs.length > 1)!;
    expect(cardIsOn(card, [])).toBe(false);
    expect(cardIsOn(card, [card.needs[0]!])).toBe(false);
    expect(cardIsOn(card, [...card.needs, "ingest.cdc"])).toBe(true);
  });
});

describe("every tool you pick is on the page", () => {
  it("has a row in the matrix, either in the pipeline or among the cross-cutting tools, in every lens", () => {
    const pickable = model.tools.filter((t) => t.kind !== "portfolio");
    expect(pickable.length).toBeGreaterThan(50);
    for (const lens of model.lenses) {
      for (const tool of pickable) {
        const inPipeline = buildLanes(lens, [tool]).length === 1;
        const view = lens.tools[tool.id];
        const crossCutting = Object.values(view?.bands ?? {}).some((zone) => Object.values(zone).some((level) => level > 0));
        // A lens with no honest zone for a concern puts it in the "not shown" fold, and the tool still has a row.
        const noZoneHere = (view?.rail.length ?? 0) > 0;
        expect(inPipeline || crossCutting || noZoneHere, `${tool.id} in ${lens.id}`).toBe(true);
      }
    }
  });
});
