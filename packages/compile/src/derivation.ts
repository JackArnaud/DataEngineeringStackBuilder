import { prefixOf } from "./taxonomy.js";
import type { Derivation } from "./types.js";

/**
 * The role a capability suggests. An exact capability rule beats a `<stage-or-band>.*` rule.
 * Undefined means no rule applies, which the validator reports as an error.
 */
export function roleOf(derivation: Derivation, capability: string): string | undefined {
  const exact = derivation.role_affinity.find((r) => r.match === capability);
  const pattern = derivation.role_affinity.find((r) => r.match === `${prefixOf(capability)}.*`);
  return (exact ?? pattern)?.role;
}
