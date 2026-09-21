import type { RenderModel } from "@compile";

/**
 * Everything the user has chosen, and nothing else. It lives in the URL, so a stack is shared by
 * copying the address: `?tools=dbt-core,postgres&needs=ingest.cdc&lens=grid`.
 */
export type View = "chart" | "table";

export interface StackState {
  tools: string[];
  needs: string[];
  /** Cross-cutting capabilities the user set aside as not relevant to their stack. */
  skip: string[];
  /** Spine capability to the tool the user uses for it, where more than one tool provides it. */
  use: Record<string, string>;
  lens: string;
  view: View;
}

const DEFAULT_LENS = "medallion";

export function defaultLens(model: RenderModel): string {
  return model.lenses.some((l) => l.id === DEFAULT_LENS) ? DEFAULT_LENS : model.lenses[0]!.id;
}

/** A portfolio is not a thing you buy; you pick its services. */
export const isSelectable = (model: RenderModel, id: string): boolean => model.tools.some((t) => t.id === id && t.kind !== "portfolio");

const canonical = (items: string[]): string[] => [...new Set(items)].sort();

export function emptyState(model: RenderModel): StackState {
  return { tools: [], needs: [], skip: [], use: {}, lens: defaultLens(model), view: "chart" };
}

/** Read a query string against the model, quietly dropping anything that no longer exists. */
export function parseState(search: string, model: RenderModel): StackState {
  const params = new URLSearchParams(search);
  const list = (key: string) =>
    (params.get(key) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

  const spine = new Set(model.capabilities.filter((c) => c.kind === "spine").map((c) => c.id));
  const band = new Set(model.capabilities.filter((c) => c.kind === "band").map((c) => c.id));
  const tools = canonical(list("tools").filter((id) => isSelectable(model, id)));
  const lens = params.get("lens");
  return {
    tools,
    needs: canonical(list("needs").filter((id) => spine.has(id))),
    skip: canonical(list("skip").filter((id) => band.has(id))),
    // `use=<capability>:<tool>`, kept only when it names a spine capability and a tool that is in the stack.
    use: Object.fromEntries(
      list("use")
        .map((pair) => pair.split(":") as [string, string])
        .filter(([cap, tool]) => spine.has(cap) && tools.includes(tool)),
    ),
    lens: lens && model.lenses.some((l) => l.id === lens) ? lens : defaultLens(model),
    view: params.get("view") === "table" ? "table" : "chart",
  };
}

/** The shortest query string that reproduces a state; defaults are left out. */
export function serializeState(state: StackState, model: RenderModel): string {
  const params = new URLSearchParams();
  if (state.tools.length) params.set("tools", canonical(state.tools).join(","));
  if (state.needs.length) params.set("needs", canonical(state.needs).join(","));
  if (state.skip.length) params.set("skip", canonical(state.skip).join(","));
  const use = Object.entries(state.use).sort(([a], [b]) => a.localeCompare(b));
  if (use.length) params.set("use", use.map(([cap, tool]) => `${cap}:${tool}`).join(","));
  if (state.lens !== defaultLens(model)) params.set("lens", state.lens);
  if (state.view !== "chart") params.set("view", state.view);
  // Commas are the list separator and are safe in a query string; keep the address readable.
  const query = params.toString().replace(/%2C/g, ",").replace(/%3A/g, ":");
  return query ? `?${query}` : "";
}

export const toggle = (list: string[], id: string): string[] => (list.includes(id) ? list.filter((x) => x !== id) : canonical([...list, id]));
export const add = (list: string[], ...ids: string[]): string[] => canonical([...list, ...ids]);
