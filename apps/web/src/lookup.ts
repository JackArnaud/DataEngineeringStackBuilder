import type { RenderCapability, RenderModel, RenderTool } from "@compile";

/** Names and descriptions by id, built once per model. */
export interface Lookup {
  tool(id: string): RenderTool | undefined;
  toolName(id: string): string;
  capability(id: string): RenderCapability | undefined;
  capabilityName(id: string): string;
  stageName(id: string): string;
  bandName(id: string): string;
  roleDescription(id: string): string;
  /** "Masking at Store" for a `govern.masking@store` key. */
  cellLabel(key: string): string;
  /** Records that are members of a bundle or portfolio, and the composite that includes each. */
  includedBy(id: string): RenderTool[];
}

export function buildLookup(model: RenderModel): Lookup {
  const tools = new Map(model.tools.map((t) => [t.id, t]));
  const caps = new Map(model.capabilities.map((c) => [c.id, c]));
  const stages = new Map(model.stages.map((s) => [s.id, s.name]));
  const bands = new Map(model.bands.map((b) => [b.id, b.name]));
  const roles = new Map(model.roles.map((r) => [r.id, r.description]));

  const capabilityName = (id: string) => caps.get(id)?.name ?? id;
  const stageName = (id: string) => stages.get(id) ?? id;

  return {
    tool: (id) => tools.get(id),
    toolName: (id) => tools.get(id)?.name ?? id,
    capability: (id) => caps.get(id),
    capabilityName,
    stageName,
    bandName: (id) => bands.get(id) ?? id,
    roleDescription: (id) => roles.get(id) ?? "",
    cellLabel: (key) => {
      const at = key.indexOf("@");
      return `${capabilityName(key.slice(0, at))} at ${stageName(key.slice(at + 1))}`;
    },
    includedBy: (id) => model.tools.filter((t) => t.includes?.includes(id)),
  };
}
