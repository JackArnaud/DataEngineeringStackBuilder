import { describe, expect, it } from "vitest";
import { estimateCost } from "../src/cost.js";
import type { CostEstimate } from "../src/cost.js";
import type { RenderTool } from "../src/render-model.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
const est = (scale: CostEstimate["scale"], low: number, high: number): CostEstimate => ({
  scale,
  low,
  high,
  unit: "usd-per-month",
  note: "Fixture note for tests, long enough to pass validation.",
  source: "https://example.com/pricing",
  as_of: "2026-09-23",
});

const tool = (id: string, cost?: CostEstimate[]): RenderTool =>
  ({ id, name: id, vendor: "V", kind: "tool", license: "proprietary", deployment: ["saas"], pricing_model: "usage", interfaces: [], taxonomy_version: "1.0.0", needs_review: false, archetype: "specialist", role: "mover", derived_role: "mover", role_source: "derived", cells: [], ...(cost && { cost }) }) as unknown as RenderTool;

describe("estimateCost", () => {
  it("sums low and high across every tool priced at the given scale", () => {
    const tools = [tool("a", [est("production", 100, 200)]), tool("b", [est("production", 50, 80)])];
    expect(estimateCost(tools, "production")).toMatchObject({ scale: "production", low: 150, high: 280, priced: ["a", "b"], unpriced: [] });
  });

  it("puts a tool with no entry for that scale in unpriced, never treats it as free", () => {
    const tools = [tool("a", [est("production", 100, 200)]), tool("b")];
    const cost = estimateCost(tools, "production");
    expect(cost).toMatchObject({ low: 100, high: 200, priced: ["a"], unpriced: ["b"] });
  });

  it("only counts the entry for the requested scale, not a tool's other scales", () => {
    const tools = [tool("a", [est("prototype", 0, 10), est("scale", 5000, 9000)])];
    expect(estimateCost(tools, "production")).toMatchObject({ low: 0, high: 0, priced: [], unpriced: ["a"] });
    expect(estimateCost(tools, "prototype")).toMatchObject({ low: 0, high: 10, priced: ["a"] });
    expect(estimateCost(tools, "scale")).toMatchObject({ low: 5000, high: 9000, priced: ["a"] });
  });

  it("is zero and fully unpriced for an empty stack", () => {
    expect(estimateCost([], "production")).toEqual({ scale: "production", low: 0, high: 0, priced: [], unpriced: [] });
  });
});
