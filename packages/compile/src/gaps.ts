import { DELIVERY_RANK } from "./derive.js";
import type { Cell, ConditionalLevel, Delivery } from "./derive.js";
import type { RenderModel } from "./render-model.js";

/**
 * Gaps: what a stack is missing, ranked by how much it matters.
 *
 * Three kinds, in the rule the project settled on:
 *  - `empty-stage`: nothing in the stack touches a pipeline stage at all. Ranked by the stage's
 *    own criticality. A stage with criticality 0 (source: your data usually comes from systems
 *    outside the stack) is never a gap.
 *  - `needed-capability`: a spine capability the user said they need and the stack lacks.
 *    Individual spine capabilities only count when asked for, so a stack is not buried in
 *    problems it does not have. The user's word outranks a default, so it ranks 5.
 *  - `band`: a governance, quality, observability or platform capability missing at a stage the
 *    stack occupies. Ranked by the band cell's criticality; 0 is not applicable and never a gap.
 *    A stage the stack does not occupy is reported once as an empty stage, not as a dozen band gaps.
 *
 * Gaps are facts about the stack. They do not depend on any lens; a lens only decides where they
 * are drawn (see `projectGaps`).
 */
export type GapKind = "needed-capability" | "empty-stage" | "band";

export interface Gap {
  /** Stable, unique within a report: `<kind>:<stage or capability@stage>`. */
  id: string;
  kind: GapKind;
  stage: string;
  /** Set for needed-capability and band gaps. */
  capability?: string;
  /** 1-5. The ranking key. */
  criticality: number;
  /** Levels the stack's own tools reach only under a constraint such as a higher plan. A gap with a remedy. */
  conditional: ConditionalLevel[];
}

/** One capability x stage cell as the whole stack covers it. */
export interface StackCell {
  key: string;
  capability: string;
  stage: string;
  /** Best unconstrained level across the stack's tools; 0 if none. */
  level: 0 | 1 | 2 | 3;
  delivery?: Delivery;
  /** Selected tools that provide the base level. */
  via: string[];
  conditional: ConditionalLevel[];
}

export interface StageSummary {
  stage: string;
  best_level: 0 | 1 | 2 | 3;
  /** Selected tools providing spine coverage in the stage. */
  covered_by: string[];
}

export interface GapReport {
  gaps: Gap[];
  stages: StageSummary[];
  cells: StackCell[];
}

export interface StackInput {
  /** Records the user picked. A portfolio is not selectable: pick the services instead. */
  tools: string[];
  /** Spine capabilities the user says they need. */
  needs?: string[];
}

/** What a user-stated need ranks as. */
export const NEEDED_CAPABILITY_CRITICALITY = 5;

const KIND_ORDER: Record<GapKind, number> = { "needed-capability": 0, "empty-stage": 1, band: 2 };
const uniqueSorted = (items: string[]): string[] => [...new Set(items)].sort();

interface Holder {
  tool: string;
  cell: Cell;
}

export function computeGaps(model: RenderModel, input: StackInput): GapReport {
  const toolsById = new Map(model.tools.map((t) => [t.id, t]));
  const kindOf = new Map(model.capabilities.map((c) => [c.id, c.kind]));

  const selected = uniqueSorted(input.tools);
  for (const id of selected) {
    const tool = toolsById.get(id);
    if (!tool) throw new Error(`unknown tool "${id}"`);
    if (tool.kind === "portfolio") throw new Error(`"${id}" is a portfolio; select the services you use instead`);
  }
  const needs = uniqueSorted(input.needs ?? []);
  for (const capability of needs) {
    if (kindOf.get(capability) !== "spine") throw new Error(`"${capability}" is not a spine capability, so it cannot be a need`);
  }

  // The stack's coverage: for every cell, the best any selected tool reaches.
  const holders = new Map<string, Holder[]>();
  for (const id of selected) {
    for (const cell of toolsById.get(id)!.cells) {
      const list = holders.get(cell.key);
      if (list) list.push({ tool: id, cell });
      else holders.set(cell.key, [{ tool: id, cell }]);
    }
  }

  const cells: StackCell[] = [];
  for (const [key, list] of holders) {
    const { capability, stage } = list[0]!.cell;
    const stackCell: StackCell = { key, capability, stage, level: 0, via: [], conditional: [] };

    const covering = list.filter((h) => h.cell.level > 0);
    if (covering.length > 0) {
      const rank = (h: Holder) => h.cell.level * 10 + DELIVERY_RANK[h.cell.delivery!];
      const top = covering.reduce((best, h) => (rank(h) > rank(best) ? h : best));
      const winners = covering.filter((h) => h.cell.level === top.cell.level && h.cell.delivery === top.cell.delivery);
      stackCell.level = top.cell.level;
      stackCell.delivery = top.cell.delivery;
      stackCell.via = uniqueSorted(winners.map((w) => w.tool));
    }

    const merged = new Map<string, ConditionalLevel>();
    for (const c of list.flatMap((h) => h.cell.conditional)) {
      if (c.level <= stackCell.level) continue;
      const k = `${c.level}|${c.delivery}|${c.constraint.join("+")}`;
      const seen = merged.get(k);
      merged.set(k, seen ? { ...seen, via: uniqueSorted([...seen.via, ...c.via]) } : { ...c });
    }
    stackCell.conditional = [...merged.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([, v]) => v);

    cells.push(stackCell);
  }
  cells.sort((a, b) => a.key.localeCompare(b.key));
  const cellByKey = new Map(cells.map((c) => [c.key, c]));

  const isSpine = (c: StackCell) => kindOf.get(c.capability) === "spine";
  const stages: StageSummary[] = model.stages.map(({ id }) => {
    const spine = cells.filter((c) => isSpine(c) && c.stage === id && c.level > 0);
    return {
      stage: id,
      best_level: Math.max(0, ...spine.map((c) => c.level)) as 0 | 1 | 2 | 3,
      covered_by: uniqueSorted(spine.flatMap((c) => c.via)),
    };
  });
  const occupied = new Set(stages.filter((s) => s.best_level > 0).map((s) => s.stage));

  const gaps: Gap[] = [];

  for (const stage of model.stages) {
    if (stage.criticality === 0 || occupied.has(stage.id)) continue;
    // If the only way to fill the stage is under a constraint, say so.
    const remedies = cells.filter((c) => isSpine(c) && c.stage === stage.id).flatMap((c) => c.conditional);
    gaps.push({ id: `empty-stage:${stage.id}`, kind: "empty-stage", stage: stage.id, criticality: stage.criticality, conditional: remedies });
  }

  for (const capability of needs) {
    const key = `${capability}@${capability.slice(0, capability.indexOf("."))}`;
    const cell = cellByKey.get(key);
    if (cell && cell.level > 0) continue;
    gaps.push({
      id: `needed-capability:${key}`,
      kind: "needed-capability",
      stage: capability.slice(0, capability.indexOf(".")),
      capability,
      criticality: NEEDED_CAPABILITY_CRITICALITY,
      conditional: cell?.conditional ?? [],
    });
  }

  for (const [key, weight] of Object.entries(model.criticality)) {
    if (weight === 0) continue;
    const at = key.indexOf("@");
    const capability = key.slice(0, at);
    const stage = key.slice(at + 1);
    if (!occupied.has(stage)) continue;
    const cell = cellByKey.get(key);
    if (cell && cell.level > 0) continue;
    gaps.push({ id: `band:${key}`, kind: "band", stage, capability, criticality: weight, conditional: cell?.conditional ?? [] });
  }

  gaps.sort((a, b) => b.criticality - a.criticality || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.id.localeCompare(b.id));
  return { gaps, stages, cells };
}

/** A gap and the lens zones it is drawn in. */
export interface PlacedGap {
  gap: Gap;
  zones: string[];
}

/** Where a lens shows a set of gaps. `dropped` must always be empty; see the invariant tests. */
export interface GapsInLens {
  lens: string;
  placed: PlacedGap[];
  /** Gaps the lens has no zone for and shows in its side rail. */
  rail: Gap[];
  /** Gaps the lens hides. A lens that hides a gap the grid found is wrong. */
  dropped: Gap[];
}

/**
 * Show a stack's gaps through a lens. This never adds, removes or reorders gaps: a gap is
 * either placed in zones, put in the rail, or (only if the lens's policy is `drop`) hidden.
 */
export function projectGaps(model: RenderModel, lensId: string, gaps: Gap[]): GapsInLens {
  const lens = model.lenses.find((l) => l.id === lensId);
  if (!lens) throw new Error(`unknown lens "${lensId}"`);

  const result: GapsInLens = { lens: lensId, placed: [], rail: [], dropped: [] };
  for (const gap of gaps) {
    const placement = gap.kind === "empty-stage" ? lens.stage_placement[gap.stage] : lens.placement[`${gap.capability}@${gap.stage}`];
    if (placement === undefined) throw new Error(`lens "${lensId}" has no placement for ${gap.id}`);
    if (placement === "unmapped") (lens.unmapped === "rail" ? result.rail : result.dropped).push(gap);
    else result.placed.push({ gap, zones: placement });
  }
  return result;
}
