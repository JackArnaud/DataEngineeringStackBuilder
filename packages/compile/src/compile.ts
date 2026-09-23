import type { Dataset } from "./dataset.js";
import { applyTier, buildCells, contributionsOf, hasEnterpriseTierUnlock } from "./derive.js";
import type { Contribution } from "./derive.js";
import { allCells, place } from "./lens.js";
import { projectTool } from "./project.js";
import type { RenderLens, RenderModel, RenderTool } from "./render-model.js";
import { deriveArchetype, deriveRole } from "./roles.js";
import { capabilityKind, compareSemver, criticalityOf, prefixOf } from "./taxonomy.js";
import type { Derivation, Issue, Lens, Taxonomy, ToolRecord } from "./types.js";
import { validateDataset } from "./validate.js";

export class CompileError extends Error {
  constructor(readonly issues: Issue[]) {
    super(`Cannot compile: ${issues.length} validation error${issues.length === 1 ? "" : "s"}`);
  }
}

export interface CompileInput {
  taxonomy: Taxonomy;
  lenses: Lens[];
  derivation: Derivation;
  records: ToolRecord[];
}

const byId = <T extends { id: string }>(a: T, b: T): number => a.id.localeCompare(b.id);

/**
 * taxonomy + records + lenses + derivation rules -> render model. Pure and deterministic.
 * The input is assumed valid; use `compileDataset` to validate first.
 */
export function compileRenderModel(input: CompileInput): RenderModel {
  const { taxonomy, derivation } = input;
  const records = new Map(input.records.map((r) => [r.id, r]));
  const cache = new Map<string, Contribution[]>();
  const grid = allCells(taxonomy);

  const criticality: Record<string, number> = {};
  const criticalityRationale: Record<string, string> = {};
  for (const cell of grid) {
    if (capabilityKind(taxonomy, cell.capability) !== "band") continue;
    const key = `${cell.capability}@${cell.stage}`;
    criticality[key] = criticalityOf(taxonomy, cell.capability, cell.stage);
    const override = taxonomy.criticality.overrides.find((o) => o.capability === cell.capability && o.stage === cell.stage);
    criticalityRationale[key] = override?.rationale ?? taxonomy.criticality.bands[prefixOf(cell.capability)]!.rationale;
  }

  const tools: RenderTool[] = [...input.records].sort(byId).map((record) => {
    const cells = buildCells(contributionsOf(record.id, records, cache));
    const derivedRole = deriveRole(cells, taxonomy, derivation);
    const override = record.presentation?.role;
    return {
      id: record.id,
      name: record.name,
      vendor: record.vendor,
      kind: record.kind,
      sku: record.sku,
      tier_name: record.tier_name,
      license: record.license,
      deployment: [...record.deployment],
      pricing_model: record.pricing_model,
      interfaces: record.interfaces ?? [],
      tagline: record.presentation?.tagline,
      ...(record.pairs_with?.length && { pairs_with: [...record.pairs_with] }),
      ...(record.cost && { cost: record.cost }),
      includes: record.kind === "tool" ? undefined : [...record.includes],
      bundling: record.kind === "tool" ? undefined : record.bundling,
      taxonomy_version: record.taxonomy_version,
      needs_review: compareSemver(record.taxonomy_version, taxonomy.taxonomy_version, 2) < 0,
      archetype: deriveArchetype(cells, taxonomy, derivation),
      role: override ?? derivedRole,
      derived_role: derivedRole,
      role_source: override ? "override" : "derived",
      cells,
    };
  });

  const lenses: RenderLens[] = [...input.lenses].sort(byId).map((lens) => {
    const placement: RenderLens["placement"] = {};
    for (const cell of grid) {
      const p = place(lens, cell);
      if (!p) throw new Error(`lens "${lens.id}" has no placement for ${cell.capability}@${cell.stage}`);
      placement[`${cell.capability}@${cell.stage}`] = p.kind === "unmapped" ? "unmapped" : p.zones;
    }

    const stagePlacement: RenderLens["stage_placement"] = {};
    for (const { id } of taxonomy.stages) {
      const d = lens.defaults[id]!;
      stagePlacement[id] = d === "unmapped" ? "unmapped" : d === "all" ? [...lens.zones] : [...d];
    }

    const views: RenderLens["tools"] = {};
    for (const tool of tools) {
      const zones = records.get(tool.id)!.lens_overrides?.find((o) => o.lens === lens.id)?.zones;
      const override = zones ? [...zones] : undefined;
      views[tool.id] = projectTool(lens, taxonomy, tool.cells, override);
      // A tool with an enterprise-tier-only conditional also gets the view it would have on that
      // tier, so the client can swap to it once the user confirms they have it.
      if (hasEnterpriseTierUnlock(tool.cells)) {
        const boosted = tool.cells.map((c) => applyTier(c, true));
        views[tool.id] = { ...views[tool.id]!, tiered: projectTool(lens, taxonomy, boosted, override) };
      }
    }
    return { id: lens.id, name: lens.name, zones: [...lens.zones], unmapped: lens.unmapped, placement, stage_placement: stagePlacement, tools: views };
  });

  return {
    format: "render-model",
    format_version: 1,
    taxonomy_version: taxonomy.taxonomy_version,
    derivation_version: derivation.derivation_version,
    stages: taxonomy.stages.map(({ id, name, description, criticality: weight, rationale, impact }) => ({ id, name, description, criticality: weight, rationale, ...(impact && { impact }) })),
    bands: taxonomy.bands.map(({ id, name }) => ({ id, name, rationale: taxonomy.criticality.bands[id]!.rationale })),
    roles: derivation.roles.map(({ id, label, description }) => ({ id, label, description })),
    capabilities: Object.entries(taxonomy.capabilities).map(([id, c]) => ({
      id,
      name: c.name,
      description: c.description,
      kind: capabilityKind(taxonomy, id)!,
      parent: prefixOf(id),
      status: c.status,
      ...(c.impact && { impact: c.impact }),
    })),
    criticality,
    criticality_rationale: criticalityRationale,
    tools,
    lenses,
  };
}

/** Validate a loaded dataset, then compile it. Throws a CompileError listing every problem. */
export function compileDataset(ds: Dataset): RenderModel {
  const errors = validateDataset(ds).filter((i) => i.severity === "error");
  if (errors.length > 0) throw new CompileError(errors);
  return compileRenderModel({
    taxonomy: ds.taxonomy!.data as Taxonomy,
    lenses: ds.lenses.map((l) => l.data as Lens),
    derivation: ds.derivation!.data as Derivation,
    records: ds.tools.map((t) => t.data as ToolRecord),
  });
}
