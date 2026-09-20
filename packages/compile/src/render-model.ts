import type { Cell } from "./derive.js";
import type { ToolLensView } from "./project.js";
import type { Archetype } from "./roles.js";

/**
 * The only thing the site reads. Everything a view needs is here already derived, so
 * components hold no view logic and do no runtime derivation.
 */
export interface RenderModel {
  format: "render-model";
  format_version: 1;
  taxonomy_version: string;
  derivation_version: string;
  /** In pipeline order. Criticality 0-5 is how much a stack with nothing in the stage is missing. */
  stages: { id: string; name: string; description: string; criticality: number; rationale: string }[];
  bands: { id: string; name: string; rationale: string }[];
  /** The closed role vocabulary, with what each role means. */
  roles: { id: string; description: string }[];
  capabilities: RenderCapability[];
  /** Criticality 0-5 for every band capability x stage cell, keyed `<capability>@<stage>`. */
  criticality: Record<string, number>;
  /** Why each band cell has its criticality: the capability override's rationale, else the band's. */
  criticality_rationale: Record<string, string>;
  tools: RenderTool[];
  lenses: RenderLens[];
}

export interface RenderCapability {
  id: string;
  name: string;
  description: string;
  kind: "spine" | "band";
  /** The stage or band this capability belongs to. */
  parent: string;
  status: string;
}

export interface RenderTool {
  id: string;
  name: string;
  vendor: string;
  kind: "tool" | "bundle" | "portfolio";
  sku?: string;
  license: string;
  deployment: string[];
  pricing_model: string;
  interfaces: string[];
  tagline?: string;
  /** Members of a bundle or portfolio. */
  includes?: string[];
  bundling?: string;
  taxonomy_version: string;
  /** Scored against an older taxonomy: absent capabilities may be unscored rather than zero. */
  needs_review: boolean;
  archetype: Archetype;
  /** The role in force: the manual override if there is one, otherwise the derived role. */
  role: string;
  derived_role: string;
  role_source: "derived" | "override";
  cells: Cell[];
}

export interface RenderLens {
  id: string;
  name: string;
  zones: string[];
  /** What happens to cells with no zone: `drop` removes them, `rail` shows them in a side rail. */
  unmapped: "drop" | "rail";
  /** Where every taxonomy cell lands in this lens, keyed `<capability>@<stage>`. */
  placement: Record<string, string[] | "unmapped">;
  /** Where a whole stage lands, for showing a stage that has nothing in it. */
  stage_placement: Record<string, string[] | "unmapped">;
  tools: Record<string, ToolLensView>;
}
