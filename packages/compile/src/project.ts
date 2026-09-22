import type { Cell } from "./derive.js";
import { place } from "./lens.js";
import type { RenderLens } from "./render-model.js";
import { capabilityKind, prefixOf } from "./taxonomy.js";
import type { Lens, Taxonomy } from "./types.js";

export interface ZoneView {
  /** Best base level among the tool's spine cells in this zone, 1-3. */
  intensity: number;
  cells: string[];
}

/** How one tool sits in one lens. */
export interface ToolLensView {
  /**
   * The zones where the tool is strongest: its core position, ordered as the lens orders zones.
   * Capabilities the lens spreads over every zone do not count toward it, unless the tool has
   * nothing else.
   */
  span: string[];
  /** Every zone the tool's spine cells reach, with how strongly. */
  zones: Record<string, ZoneView>;
  /** Band capabilities by zone, as the best level per band. Drawn as an overlay, never as span. */
  bands: Record<string, Record<string, number>>;
  /** Cells this lens has no honest zone for. The lens's `unmapped` policy decides what happens to them. */
  rail: string[];
  /** True when a per-tool lens override replaced the derived spine placement. */
  overridden: boolean;
  /**
   * The same projection, computed with this tool's enterprise-tier-only conditional levels
   * promoted into the base level. Only present when a tool has one to promote. Swap to this view
   * once the user confirms the tool is on that tier; never set on the swapped-to view itself.
   */
  tiered?: ToolLensView;
}

/**
 * Place a tool's base cells into a lens. Conditional levels are not placed: they describe
 * what a higher plan would add, not where the tool sits as sold.
 *
 * `override` is the tool's own zone list for this lens, for the rare case where derivation
 * is wrong. It replaces spine placement only; bands still follow the lens rules.
 */
export function projectTool(lens: Lens, taxonomy: Taxonomy, cells: Cell[], override?: string[]): ToolLensView {
  const zones: Record<string, ZoneView> = {};
  const bands: Record<string, Record<string, number>> = {};
  const rail: string[] = [];
  // Intensity from cells that pin a position. A cell the lens spreads over every zone (orchestration
  // in the medallion lens) says nothing about where the tool sits, so it does not define the span.
  const pinned: Record<string, number> = {};

  const addSpine = (zone: string, cell: Cell, pins: boolean) => {
    const z = (zones[zone] ??= { intensity: 0, cells: [] });
    z.intensity = Math.max(z.intensity, cell.level);
    z.cells.push(cell.key);
    if (pins) pinned[zone] = Math.max(pinned[zone] ?? 0, cell.level);
  };

  for (const cell of cells) {
    if (cell.level === 0) continue;
    const kind = capabilityKind(taxonomy, cell.capability);

    if (kind === "spine" && override) {
      for (const zone of override) addSpine(zone, cell, override.length < lens.zones.length);
      continue;
    }

    const placement = place(lens, { capability: cell.capability, stage: cell.stage });
    if (!placement) throw new Error(`lens "${lens.id}" has no placement for ${cell.key}`);
    if (placement.kind === "unmapped") {
      rail.push(cell.key);
      continue;
    }

    if (kind === "spine") {
      for (const zone of placement.zones) addSpine(zone, cell, placement.zones.length < lens.zones.length);
    } else {
      const band = prefixOf(cell.capability);
      for (const zone of placement.zones) {
        const row = (bands[zone] ??= {});
        row[band] = Math.max(row[band] ?? 0, cell.level);
      }
    }
  }

  // The span comes from cells that pin a position. A tool with only lens-wide cells (a pure
  // orchestrator) has nothing more specific, so it spans wherever it is strongest.
  const basis: Record<string, number> = Object.keys(pinned).length > 0 ? pinned : Object.fromEntries(Object.entries(zones).map(([z, v]) => [z, v.intensity]));
  const top = Math.max(0, ...Object.values(basis));
  const span = top === 0 ? [] : lens.zones.filter((z) => basis[z] === top);

  return { span, zones, bands, rail: rail.sort(), overridden: override !== undefined };
}

/**
 * A lens with every named tool's view swapped for its tiered one, so the matrix (spine marks and
 * cross-cutting bars alike) reflects a tier the user has confirmed. A tool with nothing to promote,
 * or not named here, keeps its ordinary view.
 */
export function effectiveLens(lens: RenderLens, tiers: string[]): RenderLens {
  if (tiers.length === 0) return lens;
  const tierSet = new Set(tiers);
  const tools = Object.fromEntries(Object.entries(lens.tools).map(([id, view]) => [id, tierSet.has(id) && view.tiered ? view.tiered : view]));
  return { ...lens, tools };
}
