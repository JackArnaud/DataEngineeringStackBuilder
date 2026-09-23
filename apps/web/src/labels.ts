import type { Delivery, Gap, GapGroup } from "@compile";
import type { Lookup } from "./lookup";

/** The four coverage levels, in the words the taxonomy defines them. */
export const LEVEL_LABEL: Record<number, string> = { 3: "Core", 2: "Native", 1: "Extended" };
/**
 * What to actually do with a level: Core and Native both mean nothing extra to buy or install —
 * the difference between them is only how central the capability is to the product, not whether it
 * works. Extended is the one that changes what you have to do.
 */
export const LEVEL_HELP: Record<number, string> = {
  3: "Built in, and a primary reason the product exists — no plugin or extra purchase needed.",
  2: "Built in, same as Core — no plugin or extra purchase needed. Just a secondary feature, not what the product is mainly for.",
  1: "Needs a plugin, a partner product, a marketplace add-on, or real custom work to get.",
};

export const DELIVERY_LABEL: Record<Delivery, string> = {
  native: "In the product",
  bundled: "Bundled",
  partner: "Partner",
  community: "Community",
};

export const KIND_LABEL: Record<string, string> = { tool: "Tool", bundle: "Bundle", portfolio: "Portfolio" };

export const ARCHETYPE_LABEL: Record<string, string> = {
  specialist: "Specialist",
  "stage-platform": "Stage platform",
  "end-to-end": "End to end",
};

export const CONSTRAINT_LABEL: Record<string, string> = {
  "enterprise-tier": "an Enterprise plan",
  "region-limited": "certain regions",
  "own-cloud-only": "your own cloud only",
};

export const constraintText = (constraint: string[]): string => constraint.map((c) => CONSTRAINT_LABEL[c] ?? c).join(" and ");

/**
 * The same phrase, but naming the actual plan when every tool it comes from agrees on one: "an
 * Enterprise plan" is true of nobody in particular, but "Snowflake Enterprise edition" is a claim
 * with a source. Falls back to the generic word where a tool has no tier_name, or where two tools
 * in `via` name different plans and a single phrase can't speak for both.
 */
export const constraintPhrase = (constraint: string[], via: string[], lookup: Lookup): string => {
  const names = via.map((id) => lookup.tool(id)?.tier_name);
  const named = constraint.includes("enterprise-tier") && via.length > 0 && names.every((n) => n && n === names[0]) ? names[0] : undefined;
  return constraint.map((c) => (c === "enterprise-tier" && named ? named : (CONSTRAINT_LABEL[c] ?? c))).join(" and ");
};

export type Tone = "critical" | "serious" | "warning" | "low";

/**
 * Gap severity as reserved status colours with a word, never colour alone. Criticality 1 and 2 are
 * neutral: they are worth knowing, not worth alarming anyone.
 */
export function severity(criticality: number): { tone: Tone; word: string } {
  if (criticality >= 5) return { tone: "critical", word: "Critical" };
  if (criticality === 4) return { tone: "serious", word: "Serious" };
  if (criticality === 3) return { tone: "warning", word: "Moderate" };
  return { tone: "low", word: criticality === 2 ? "Low" : "Minor" };
}

export function gapTitle(gap: Gap, lookup: Lookup): string {
  switch (gap.kind) {
    case "empty-stage":
      return `Nothing in your stack covers ${lookup.stageName(gap.stage)}`;
    case "needed-capability":
      return `You need ${lookup.capabilityName(gap.capability!)}, and nothing provides it`;
    case "band":
      return `${lookup.capabilityName(gap.capability!)} is missing at ${lookup.stageName(gap.stage)}`;
  }
}

/** "A", "A and B", "A, B and C". */
export const listNames = (names: string[]): string => (names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/** Up to this many stages a group's title names them; past it the title counts and the row lists them. */
export const NAMED_STAGES_MAX = 3;

/** A group's title: a cross-cutting capability missing at a few stages names them, at many it counts them. */
export function groupTitle(group: GapGroup, lookup: Lookup): string {
  if (group.kind === "band" && group.stages.length > 1) {
    const where = group.stages.length <= NAMED_STAGES_MAX ? listNames(group.stages.map((s) => lookup.stageName(s))) : `${group.stages.length} stages`;
    return `${lookup.capabilityName(group.capability!)} is missing at ${where}`;
  }
  return gapTitle(group.gaps[0]!, lookup);
}

export const GAP_KIND_LABEL: Record<Gap["kind"], string> = {
  "empty-stage": "Empty stage",
  "needed-capability": "Needed",
  band: "Cross-cutting",
};

export function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Only ever link to https, whatever the data says. */
export const safeHref = (url: string): string | undefined => (url.startsWith("https://") ? url : undefined);

export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
