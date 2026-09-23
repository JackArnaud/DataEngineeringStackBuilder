import { isEnterpriseTierOnly } from "@compile";
import type { RenderTool } from "@compile";
import { constraintPhrase } from "./labels";
import type { Lookup } from "./lookup";

/**
 * "Snowflake Enterprise edition" — the real plan name a tool's enterprise-tier-only cells are
 * gated behind, via the same `constraintPhrase` every other conditional-level display already
 * uses. Falls back to the generic "an Enterprise plan" only when the tools behind it disagree.
 */
export function tierLabel(tool: RenderTool, lookup: Lookup): string {
  const via = tool.cells.flatMap((c) => c.conditional.filter(isEnterpriseTierOnly).flatMap((cd) => cd.via));
  return constraintPhrase(["enterprise-tier"], [...new Set(via)], lookup);
}
