import type { RenderModel, RenderTool } from "@compile";

export interface VendorGroup {
  vendor: string;
  /** The vendor's portfolio, if it has one. It is not selectable; its services are. */
  portfolio?: RenderTool;
  /** Bundles first, each followed by its own parts, then the remaining tools. */
  tools: RenderTool[];
  /** Ids of the tools in `tools` that are shown indented under the bundle that includes them. */
  parts: ReadonlySet<string>;
}

/** Whether a tool has any spine capability in a stage, at any level. Bands do not count. */
export function coversStage(tool: RenderTool, stage: string): boolean {
  return tool.cells.some((c) => c.stage === stage && c.capability.startsWith(`${stage}.`) && c.level > 0);
}

/** A bundle followed by the parts it includes, then everything else, so a suite reads as one block. */
function arrange(tools: RenderTool[]): { tools: RenderTool[]; parts: Set<string> } {
  const byName = (a: RenderTool, b: RenderTool) => a.name.localeCompare(b.name);
  const ids = new Set(tools.map((t) => t.id));
  const placed = new Set<string>();
  const parts = new Set<string>();
  const out: RenderTool[] = [];

  for (const bundle of tools.filter((t) => t.kind === "bundle").sort(byName)) {
    out.push(bundle);
    placed.add(bundle.id);
    for (const part of tools.filter((t) => bundle.includes?.includes(t.id) && ids.has(t.id) && !placed.has(t.id)).sort(byName)) {
      out.push(part);
      placed.add(part.id);
      parts.add(part.id);
    }
  }
  out.push(...tools.filter((t) => !placed.has(t.id)).sort(byName));
  return { tools: out, parts };
}

/**
 * Records grouped by vendor for the picker. A search that matches a portfolio shows all its
 * services. `stage` keeps only tools that provide something in that stage.
 */
export function groupByVendor(model: RenderModel, query: string, stage: string | null = null): VendorGroup[] {
  const q = query.trim().toLowerCase();
  const matches = (t: RenderTool) => !q || [t.name, t.vendor, t.id, t.tagline ?? ""].some((s) => s.toLowerCase().includes(q));
  const inStage = (t: RenderTool) => !stage || coversStage(t, stage);

  const byVendor = new Map<string, RenderTool[]>();
  for (const t of model.tools) byVendor.set(t.vendor, [...(byVendor.get(t.vendor) ?? []), t]);

  return [...byVendor.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([vendor, list]) => {
      const portfolio = list.find((t) => t.kind === "portfolio");
      const all = list.filter((t) => t.kind !== "portfolio");
      const kept = (portfolio && matches(portfolio) ? all : all.filter(matches)).filter(inStage);
      return { vendor, portfolio, ...arrange(kept) };
    })
    .filter((g) => g.tools.length > 0);
}
