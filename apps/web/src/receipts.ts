import type { Cell, ConditionalLevel, Delivery, Evidence, Maturity } from "@compile";

/** Cells that say the same thing at different stages, merged so a receipt reads once. */
export interface CellGroup {
  capability: string;
  stages: string[];
  level: number;
  delivery?: Delivery;
  maturity?: Maturity;
  via: string[];
  inherited?: boolean;
  conditional: ConditionalLevel[];
  evidence: Evidence[];
}

/**
 * A band capability scored on several stages produces one cell per stage, all with the same
 * score and the same evidence. Group them so a tool's detail lists "Masking, at Store, Transform
 * and Serve" once, with one set of notes and sources.
 */
export function groupCells(cells: Cell[], stageOrder: string[], capabilityOrder: string[]): CellGroup[] {
  const groups = new Map<string, CellGroup>();
  for (const cell of cells) {
    const signature = JSON.stringify([cell.capability, cell.level, cell.delivery, cell.maturity, cell.via, cell.conditional, cell.evidence.map((e) => [e.tool, e.ref])]);
    const existing = groups.get(signature);
    if (existing) {
      existing.stages.push(cell.stage);
      continue;
    }
    groups.set(signature, {
      capability: cell.capability,
      stages: [cell.stage],
      level: cell.level,
      delivery: cell.delivery,
      maturity: cell.maturity,
      via: cell.via,
      inherited: cell.inherited,
      conditional: cell.conditional,
      evidence: cell.evidence,
    });
  }

  const stageIndex = (s: string) => stageOrder.indexOf(s);
  const capabilityIndex = (c: string) => capabilityOrder.indexOf(c);
  return [...groups.values()]
    .map((g) => ({ ...g, stages: [...g.stages].sort((a, b) => stageIndex(a) - stageIndex(b)) }))
    .sort((a, b) => capabilityIndex(a.capability) - capabilityIndex(b.capability) || stageIndex(a.stages[0]!) - stageIndex(b.stages[0]!));
}

/** "Store", "Store and Transform", "Store, Transform and Serve". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
