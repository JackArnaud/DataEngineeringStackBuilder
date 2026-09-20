import { capabilityKind, prefixOf } from "./taxonomy.js";
import type { Lens, Taxonomy } from "./types.js";

export type Placement = { kind: "zones"; zones: string[] } | { kind: "unmapped" };

/** A place a score can land: a spine capability at its own stage, or a band capability at any stage. */
export interface Cell {
  capability: string;
  stage: string;
}

/** Every capability x stage cell in the taxonomy. Spine capabilities have one, band capabilities one per stage. */
export function allCells(taxonomy: Taxonomy): Cell[] {
  const cells: Cell[] = [];
  for (const capability of Object.keys(taxonomy.capabilities)) {
    const kind = capabilityKind(taxonomy, capability);
    if (kind === "spine") cells.push({ capability, stage: prefixOf(capability) });
    else if (kind === "band") for (const s of taxonomy.stages) cells.push({ capability, stage: s.id });
  }
  return cells;
}

/**
 * Resolve where a cell lands in a lens. Most specific rule wins: exact capability match,
 * then `<stage-or-band>.*`, then the stage default. Undefined means the lens has no rule at
 * all for this cell, which the validator treats as an error: a capability must map to a zone
 * or be explicitly unmapped in every lens.
 */
export function place(lens: Lens, cell: Cell): Placement | undefined {
  const exact = lens.overrides.find((o) => o.match === cell.capability);
  const pattern = lens.overrides.find((o) => o.match === `${prefixOf(cell.capability)}.*`);
  const value = exact?.zones ?? pattern?.zones ?? lens.defaults[cell.stage];
  if (value === undefined) return undefined;
  if (value === "unmapped") return { kind: "unmapped" };
  if (value === "all") return { kind: "zones", zones: [...lens.zones] };
  return { kind: "zones", zones: [...value] };
}
