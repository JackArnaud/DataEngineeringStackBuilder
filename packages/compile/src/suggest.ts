import { DELIVERY_RANK } from "./derive.js";
import type { Delivery } from "./derive.js";
import type { Gap } from "./gaps.js";
import type { RenderModel } from "./render-model.js";

/** A tool that would close a gap, and how well it does. */
export interface Suggestion {
  tool: string;
  level: 1 | 2 | 3;
  delivery: Delivery;
}

/**
 * Tools not yet in the stack that would close a gap, best first: the highest level, then the
 * strongest delivery, then by id. A tool counts only for what it provides without a constraint,
 * so nothing is suggested on the strength of an Enterprise-only score. Portfolios are never
 * suggested; their services are.
 *
 * For an empty stage, any spine capability in the stage counts, since any of them occupies it.
 */
export function suggestTools(model: RenderModel, gap: Gap, selected: string[]): Suggestion[] {
  const have = new Set(selected);
  const spine = new Set(model.capabilities.filter((c) => c.kind === "spine").map((c) => c.id));
  const key = `${gap.capability}@${gap.stage}`;

  const out: Suggestion[] = [];
  for (const tool of model.tools) {
    if (tool.kind === "portfolio" || have.has(tool.id)) continue;
    const cells = tool.cells.filter((c) => c.level > 0 && (gap.kind === "empty-stage" ? spine.has(c.capability) && c.stage === gap.stage : c.key === key));
    if (cells.length === 0) continue;
    const best = cells.reduce((b, c) => (c.level * 10 + DELIVERY_RANK[c.delivery!] > b.level * 10 + DELIVERY_RANK[b.delivery!] ? c : b));
    out.push({ tool: tool.id, level: best.level as 1 | 2 | 3, delivery: best.delivery! });
  }

  return out.sort((a, b) => b.level - a.level || DELIVERY_RANK[b.delivery] - DELIVERY_RANK[a.delivery] || a.tool.localeCompare(b.tool));
}
