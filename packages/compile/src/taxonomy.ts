import type { Taxonomy } from "./types.js";

export type CapabilityKind = "spine" | "band";

/** The stage or band an ID belongs to. Capability IDs are `<stage-or-band>.<slug>`. */
export function prefixOf(capabilityId: string): string {
  return capabilityId.slice(0, capabilityId.indexOf("."));
}

/** `spine` for stage capabilities, `band` for cross-cutting ones, undefined if the ID is unknown. */
export function capabilityKind(taxonomy: Taxonomy, capabilityId: string): CapabilityKind | undefined {
  if (!Object.hasOwn(taxonomy.capabilities, capabilityId)) return undefined;
  const prefix = prefixOf(capabilityId);
  if (taxonomy.stages.some((s) => s.id === prefix)) return "spine";
  if (taxonomy.bands.some((b) => b.id === prefix)) return "band";
  return undefined;
}

/**
 * How much a gap in this band capability at this stage matters, 0-5. A capability-level
 * override beats the band x stage default. Only band capabilities carry criticality.
 */
export function criticalityOf(taxonomy: Taxonomy, capability: string, stage: string): number {
  const override = taxonomy.criticality.overrides.find((o) => o.capability === capability && o.stage === stage);
  if (override) return override.weight;
  return taxonomy.criticality.bands[prefixOf(capability)]!.stages[stage]!;
}

/**
 * Compare versions numerically. `parts` limits how many components count: 2 compares only
 * major.minor, which is how record staleness is judged, because a patch changes weights and
 * wording but never which capabilities exist.
 */
export function compareSemver(a: string, b: string, parts = 3): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < parts; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return Math.sign(diff);
  }
  return 0;
}
