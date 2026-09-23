import { describe, expect, it } from "vitest";
import { costAt, estimateCost, hostingAt, TEAM_SIZE_HEADCOUNT } from "../src/cost.js";
import type { CostEstimate } from "../src/cost.js";
import type { RenderTool } from "../src/render-model.js";

const NOTE = "Fixture note for tests, long enough to pass validation.";
const SOURCE = "https://example.com/pricing";
const AS_OF = "2026-09-23";

const volumeEntry = (points: { volumeGb: number; low: number; high: number }[], hosting?: { volumeGb: number; low: number; high: number }[]): CostEstimate => ({
  unit: "usd-per-month",
  cost: { basis: "volume", points },
  ...(hosting && { hosting: { basis: "volume", points: hosting } }),
  note: NOTE,
  source: SOURCE,
  as_of: AS_OF,
});

const perSeatEntry = (low: number, high: number): CostEstimate => ({
  unit: "usd-per-month",
  cost: { basis: "per-seat", perSeat: { low, high } },
  note: NOTE,
  source: SOURCE,
  as_of: AS_OF,
});

const flatEntry = (low: number, high: number): CostEstimate => ({
  unit: "usd-per-month",
  cost: { basis: "flat", amount: { low, high } },
  note: NOTE,
  source: SOURCE,
  as_of: AS_OF,
});

const tool = (id: string, cost?: CostEstimate): RenderTool =>
  ({ id, name: id, vendor: "V", kind: "tool", license: "proprietary", deployment: ["saas"], pricing_model: "usage", interfaces: [], taxonomy_version: "1.0.0", needs_review: false, archetype: "specialist", role: "mover", derived_role: "mover", role_source: "derived", cells: [], ...(cost && { cost }) }) as unknown as RenderTool;

describe("costAt: volume basis", () => {
  const points = [
    { volumeGb: 100, low: 10, high: 20 },
    { volumeGb: 10000, low: 100, high: 200 },
  ];

  it("returns the point's own figure exactly at a checkpoint", () => {
    expect(costAt(volumeEntry(points), 100, undefined)).toEqual({ low: 10, high: 20 });
    expect(costAt(volumeEntry(points), 10000, undefined)).toEqual({ low: 100, high: 200 });
  });

  it("clamps to the first point below the lowest checkpoint, never extrapolating past it", () => {
    expect(costAt(volumeEntry(points), 1, undefined)).toEqual({ low: 10, high: 20 });
  });

  it("clamps to the last point above the highest checkpoint", () => {
    expect(costAt(volumeEntry(points), 1_000_000, undefined)).toEqual({ low: 100, high: 200 });
  });

  it("interpolates in log-log space between two points, not linearly", () => {
    // Geometric midpoint of 100 and 10000 is 1000 (t = 0.5 in log-volume space).
    const c = costAt(volumeEntry(points), 1000, undefined);
    expect(c.low).toBeCloseTo(10 ** 1.5, 5); // 31.62...
    expect(c.high).toBeCloseTo(20 * Math.sqrt(10), 5); // 63.25...
    // A linear interpolation would have given low=55, high=110 — well off from the log-log figures.
    expect(c.low).not.toBeCloseTo(55, 0);
  });

  it("falls back to a linear blend when either endpoint is exactly $0, since log(0) is undefined", () => {
    const zeroStart = [
      { volumeGb: 10, low: 0, high: 5 },
      { volumeGb: 1000, low: 100, high: 200 },
    ];
    const c = costAt(volumeEntry(zeroStart), 100, undefined); // geometric midpoint, t = 0.5
    expect(c.low).toBeCloseTo(50, 5); // linear: 0 + 0.5*(100-0)
    expect(c.high).toBeCloseTo(Math.sqrt(5 * 200), 5); // log-log, since both ends are non-zero
  });
});

describe("costAt: per-seat basis", () => {
  it("multiplies the per-seat rate by the headcount TEAM_SIZE_HEADCOUNT assumes for each team size", () => {
    const entry = perSeatEntry(10, 30);
    expect(costAt(entry, 999, "solo")).toEqual({ low: 10 * TEAM_SIZE_HEADCOUNT.solo, high: 30 * TEAM_SIZE_HEADCOUNT.solo });
    expect(costAt(entry, 999, "small-team")).toEqual({ low: 10 * TEAM_SIZE_HEADCOUNT["small-team"], high: 30 * TEAM_SIZE_HEADCOUNT["small-team"] });
    expect(costAt(entry, 999, "multiple-teams")).toEqual({ low: 10 * TEAM_SIZE_HEADCOUNT["multiple-teams"], high: 30 * TEAM_SIZE_HEADCOUNT["multiple-teams"] });
  });

  it("ignores volume entirely — only team size drives the figure", () => {
    const entry = perSeatEntry(10, 30);
    expect(costAt(entry, 1, "solo")).toEqual(costAt(entry, 1_000_000, "solo"));
  });

  it("defaults to the small-team headcount when team is unanswered, rather than refusing to estimate", () => {
    const entry = perSeatEntry(10, 30);
    expect(costAt(entry, 999, undefined)).toEqual({ low: 10 * TEAM_SIZE_HEADCOUNT["small-team"], high: 30 * TEAM_SIZE_HEADCOUNT["small-team"] });
  });
});

describe("costAt: flat basis", () => {
  it("returns the flat amount regardless of volume or team", () => {
    const entry = flatEntry(0, 0);
    expect(costAt(entry, 1, undefined)).toEqual({ low: 0, high: 0 });
    expect(costAt(entry, 1_000_000, "multiple-teams")).toEqual({ low: 0, high: 0 });
  });
});

describe("hostingAt", () => {
  it("is undefined when a tool has no hosting field", () => {
    expect(hostingAt(flatEntry(0, 0), 1000)).toBeUndefined();
  });

  it("interpolates hosting the same way volume cost does, independently of the vendor cost basis", () => {
    const entry = flatEntry(0, 0);
    entry.hosting = { basis: "volume", points: [{ volumeGb: 10, low: 30, high: 80 }, { volumeGb: 1000, low: 300, high: 800 }] };
    expect(hostingAt(entry, 10)).toEqual({ low: 30, high: 80 });
    expect(hostingAt(entry, 1000)).toEqual({ low: 300, high: 800 });
  });
});

describe("estimateCost", () => {
  const points = [
    { volumeGb: 10, low: 10, high: 20 },
    { volumeGb: 1000, low: 100, high: 200 },
  ];

  it("sums vendor cost across every priced tool at the given volume", () => {
    const tools = [tool("a", volumeEntry(points)), tool("b", volumeEntry(points))];
    const cost = estimateCost(tools, 10, undefined);
    expect(cost).toMatchObject({ volumeGb: 10, low: 20, high: 40, priced: ["a", "b"], unpriced: [] });
  });

  it("puts a tool with no cost entry in unpriced, never treats it as free", () => {
    const tools = [tool("a", volumeEntry(points)), tool("b")];
    const cost = estimateCost(tools, 10, undefined);
    expect(cost).toMatchObject({ low: 10, high: 20, priced: ["a"], unpriced: ["b"] });
  });

  it("sums hosting separately from vendor cost, and only for tools that carry a hosting figure", () => {
    const hosted = volumeEntry(points, [
      { volumeGb: 10, low: 30, high: 80 },
      { volumeGb: 1000, low: 300, high: 800 },
    ]);
    const tools = [tool("a", hosted), tool("b", volumeEntry(points))];
    const cost = estimateCost(tools, 10, undefined);
    expect(cost).toMatchObject({ low: 20, high: 40, hostingLow: 30, hostingHigh: 80, hosted: ["a"], priced: ["a", "b"] });
  });

  it("passes team size through to per-seat tools in the stack", () => {
    const tools = [tool("a", perSeatEntry(10, 10))];
    expect(estimateCost(tools, 1, "solo").low).toBe(10 * TEAM_SIZE_HEADCOUNT.solo);
    expect(estimateCost(tools, 1, "multiple-teams").low).toBe(10 * TEAM_SIZE_HEADCOUNT["multiple-teams"]);
  });

  it("is zero and fully unpriced for an empty stack", () => {
    expect(estimateCost([], 1000, undefined)).toEqual({ volumeGb: 1000, low: 0, high: 0, hostingLow: 0, hostingHigh: 0, priced: [], unpriced: [], hosted: [] });
  });
});
