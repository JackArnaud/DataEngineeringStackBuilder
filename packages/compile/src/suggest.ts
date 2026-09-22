import { DELIVERY_RANK } from "./derive.js";
import type { Delivery } from "./derive.js";
import type { Gap } from "./gaps.js";
import type { RenderModel, RenderTool } from "./render-model.js";

/**
 * How a suggested tool relates to the stack it would join.
 *  - `ecosystem`: the same vendor as a tool already in the stack, so one contract, one console,
 *    and usually one set of credentials. Snowflake's own governance before a third party's.
 *  - `paired`: a record that names one of the stack's tools as a companion, or that a stack tool
 *    names, such as dbt beside Snowflake.
 *  - `other`: anything else.
 */
export type Affinity = "ecosystem" | "paired" | "other";

/** A tool that would close a gap, and how well it does. */
export interface Suggestion {
  tool: string;
  level: 1 | 2 | 3;
  delivery: Delivery;
  affinity: Affinity;
  /** The stack's tools it is related to, when the affinity is not `other`. */
  related: string[];
}

/** Microsoft sells Azure, Fabric and Power BI under one account, so they count as one vendor. */
export const vendorFamily = (vendor: string): string => (vendor.startsWith("Microsoft") ? "Microsoft" : vendor);

const AFFINITY_RANK: Record<Affinity, number> = { ecosystem: 0, paired: 1, other: 2 };

/**
 * What the person already has, from the guided start's resources step. `prefer-oss` favours an
 * open-source tool over an equally-fitting one that is not; the absence of `procurement` (no
 * ability to sign a vendor contract) sets back a tool priced in a way that usually needs a sales
 * conversation. Neither ever excludes a tool, only re-orders among ones that already fit the gap.
 */
export type Resource = "prefer-oss" | "procurement";

/**
 * Lower ranks first. 0 when nothing about the tool works against the stated resources — which is
 * every tool when nothing was stated at all: an empty `resources` means the question was never
 * answered, not that the person confirmed having no procurement, so it must never reorder anything
 * on its own.
 */
function resourceRank(tool: RenderTool, resources: readonly Resource[]): number {
  if (resources.length === 0) return 0;
  let rank = 0;
  if (resources.includes("prefer-oss") && tool.license !== "open-source") rank += 1;
  if (!resources.includes("procurement") && (tool.pricing_model === "capacity" || tool.pricing_model === "subscription")) rank += 1;
  return rank;
}

/**
 * Tools not yet in the stack that would close a gap, best first. A tool counts only for what it
 * provides without a constraint, so nothing is suggested on the strength of an Enterprise-only
 * score. Portfolios are never suggested; their services are.
 *
 * The order says which way to close it first: among tools that provide the capability properly
 * (native or core, level 2 or 3), those from a vendor the stack already uses come first, then
 * tools paired with the stack, then the rest; within each group the highest level, then the
 * strongest delivery, then id. A tool that only reaches level 1 (a plugin, a partner, custom work)
 * never outranks a proper one, however well it fits the stack.
 *
 * For an empty stage, any spine capability in the stage counts, since any of them occupies it.
 *
 * `resources` (what the guided start's resources step said the person already has) breaks ties
 * the same way `affinity` does: only among tools that are good enough to use, never promoting a
 * weaker fit over a stronger one, and never excluding a tool outright.
 */
export function suggestTools(model: RenderModel, gap: Gap, selected: string[], resources: readonly Resource[] = []): Suggestion[] {
  const have = new Set(selected);
  const byId = new Map(model.tools.map((t) => [t.id, t]));
  const spine = new Set(model.capabilities.filter((c) => c.kind === "spine").map((c) => c.id));
  const key = `${gap.capability}@${gap.stage}`;

  // The vendors in the stack, and the stack's tools by vendor family, for saying why.
  const stackTools = selected.map((id) => byId.get(id)).filter((t): t is NonNullable<typeof t> => !!t);
  const familiesInStack = new Map<string, string[]>();
  for (const t of stackTools) {
    const f = vendorFamily(t.vendor);
    familiesInStack.set(f, [...(familiesInStack.get(f) ?? []), t.id]);
  }

  const out: Suggestion[] = [];
  for (const tool of model.tools) {
    if (tool.kind === "portfolio" || have.has(tool.id)) continue;
    const cells = tool.cells.filter((c) => c.level > 0 && (gap.kind === "empty-stage" ? spine.has(c.capability) && c.stage === gap.stage : c.key === key));
    if (cells.length === 0) continue;
    const best = cells.reduce((b, c) => (c.level * 10 + DELIVERY_RANK[c.delivery!] > b.level * 10 + DELIVERY_RANK[b.delivery!] ? c : b));

    const sameVendor = familiesInStack.get(vendorFamily(tool.vendor)) ?? [];
    const paired = stackTools.filter((s) => tool.pairs_with?.includes(s.id) || s.pairs_with?.includes(tool.id)).map((s) => s.id);
    const affinity: Affinity = sameVendor.length > 0 ? "ecosystem" : paired.length > 0 ? "paired" : "other";
    out.push({ tool: tool.id, level: best.level as 1 | 2 | 3, delivery: best.delivery!, affinity, related: affinity === "ecosystem" ? sameVendor : affinity === "paired" ? paired : [] });
  }

  const proper = (s: Suggestion) => (s.level >= 2 ? 0 : 1);
  const fit = (s: Suggestion) => resourceRank(byId.get(s.tool)!, resources);
  return out.sort(
    (a, b) =>
      proper(a) - proper(b) ||
      // Fit and resources only break ties among tools that are good enough to use.
      (proper(a) === 0 ? fit(a) - fit(b) : 0) ||
      (proper(a) === 0 ? AFFINITY_RANK[a.affinity] - AFFINITY_RANK[b.affinity] : 0) ||
      b.level - a.level ||
      DELIVERY_RANK[b.delivery] - DELIVERY_RANK[a.delivery] ||
      AFFINITY_RANK[a.affinity] - AFFINITY_RANK[b.affinity] ||
      a.tool.localeCompare(b.tool),
  );
}
