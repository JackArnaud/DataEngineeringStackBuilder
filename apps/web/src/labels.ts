import type { Delivery, Gap } from "@compile";
import type { Lookup } from "./lookup";

/** The four coverage levels, in the words the taxonomy defines them. */
export const LEVEL_LABEL: Record<number, string> = { 3: "Core", 2: "Native", 1: "Extended" };
export const LEVEL_HELP: Record<number, string> = {
  3: "a primary reason the product exists, first-class, no add-ons",
  2: "genuinely built in, but secondary",
  1: "only via a plugin, partner, marketplace or real custom work",
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
