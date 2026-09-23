import type { RenderTool } from "./render-model.js";

/**
 * How much a pipeline moves and runs, in the same plain-language shape `profile`/`resources`
 * already use rather than a slider: three short, real answers, not a number nobody can estimate
 * up front. Distinct from `profile.team` (headcount) — this is about data volume and traffic.
 */
export type Scale = "prototype" | "production" | "scale";

/**
 * A real, sourced dollar estimate for one tool at one scale. Approximate by nature — this
 * deliberately reopens the project's earlier "no dollar figures, too volatile" rule, so every
 * figure carries its source and the date it was recorded, and the UI shows both alongside a
 * permanent disclaimer rather than presenting a number as a quote.
 */
export interface CostEstimate {
  scale: Scale;
  low: number;
  high: number;
  unit: "usd-per-month";
  note: string;
  source: string;
  /** YYYY-MM-DD, the date the figure was recorded, so staleness is visible, not hidden. */
  as_of: string;
}

export interface StackCost {
  scale: Scale;
  low: number;
  high: number;
  /** Selected tools with a cost entry at this scale, low-to-high order in the total. */
  priced: string[];
  /** Selected tools with nothing recorded at this scale yet — the total is a floor, not a quote. */
  unpriced: string[];
}

/**
 * Sum of every selected tool's cost at one scale. A tool with no entry for that scale is never
 * treated as free: it goes in `unpriced`, so the total is always shown as a floor with an honest
 * count of what is missing from it, not a silently-incomplete number.
 */
export function estimateCost(tools: RenderTool[], scale: Scale): StackCost {
  let low = 0;
  let high = 0;
  const priced: string[] = [];
  const unpriced: string[] = [];
  for (const tool of tools) {
    const entry = tool.cost?.find((c) => c.scale === scale);
    if (entry) {
      low += entry.low;
      high += entry.high;
      priced.push(tool.id);
    } else {
      unpriced.push(tool.id);
    }
  }
  return { scale, low, high, priced: priced.sort(), unpriced: unpriced.sort() };
}
