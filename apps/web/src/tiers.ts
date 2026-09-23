import { hasEnterpriseTierUnlock, isEnterpriseTierOnly } from "@compile";
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

/**
 * A deployment moving at least this much data a month (10TB) is assumed well-resourced enough to
 * already be paying for whatever plan unlocks more — a concrete, checkable line in place of the
 * old qualitative "Scale" bucket.
 */
export const ENTERPRISE_TIER_VOLUME_GB = 10_000;

/**
 * Which of the stack's tools are assumed to be on their named higher tier. Derived from volume,
 * not chosen per tool: only `ENTERPRISE_TIER_VOLUME_GB` or more makes the assumption, since that's
 * the case a real deployment is usually already paying for whatever plan unlocks more. Below it,
 * every tool stays at the unconstrained level.
 */
export function tieredTools(tools: RenderTool[], volumeGb: number | undefined): RenderTool[] {
  if (volumeGb === undefined || volumeGb < ENTERPRISE_TIER_VOLUME_GB) return [];
  return tools.filter((t) => hasEnterpriseTierUnlock(t.cells));
}
