import { roleOf } from "./derivation.js";
import type { Cell } from "./derive.js";
import { capabilityKind } from "./taxonomy.js";
import type { Derivation, Taxonomy } from "./types.js";

export type Archetype = "specialist" | "stage-platform" | "end-to-end";

/**
 * The role a tool plays, from where its strongest scores cluster.
 *
 * Only a capability's best base level counts (a band scored on three stages is one vote), and
 * only capabilities at the tool's top level vote. Each vote goes to the role the capability
 * suggests, at full weight for a spine capability and reduced weight for a band capability.
 * Ties go to the role listed first in the derivation, so the result is deterministic.
 */
export function deriveRole(cells: Cell[], taxonomy: Taxonomy, derivation: Derivation): string {
  const best = new Map<string, number>();
  for (const c of cells) if (c.level > 0) best.set(c.capability, Math.max(best.get(c.capability) ?? 0, c.level));

  // A record whose only scores are conditional still needs a role.
  if (best.size === 0) {
    for (const c of cells) for (const cond of c.conditional) best.set(c.capability, Math.max(best.get(c.capability) ?? 0, cond.level));
  }
  if (best.size === 0) return derivation.roles[0]!.id;

  const top = Math.max(...best.values());
  const votes = new Map<string, number>();
  for (const [capability, level] of best) {
    if (level !== top) continue;
    const role = roleOf(derivation, capability)!;
    const weight = capabilityKind(taxonomy, capability) === "band" ? derivation.band_weight : 1;
    votes.set(role, (votes.get(role) ?? 0) + weight);
  }

  let winner = derivation.roles[0]!.id;
  let winning = -1;
  for (const { id } of derivation.roles) {
    const score = votes.get(id) ?? 0;
    if (score > winning) {
      winner = id;
      winning = score;
    }
  }
  return winner;
}

/**
 * How broad a tool is, from its level-3 spine coverage only. Bands are cross-cutting and
 * do not make a tool broader.
 */
export function deriveArchetype(cells: Cell[], taxonomy: Taxonomy, derivation: Derivation): Archetype {
  const stages = new Set<string>();
  const capabilities = new Set<string>();
  for (const c of cells) {
    if (c.level === 3 && capabilityKind(taxonomy, c.capability) === "spine") {
      stages.add(c.stage);
      capabilities.add(c.capability);
    }
  }
  const a = derivation.archetype;
  if (stages.size >= a.end_to_end_min_stages) return "end-to-end";
  if (stages.size <= a.specialist_max_stages && capabilities.size <= a.specialist_max_capabilities) return "specialist";
  return "stage-platform";
}
