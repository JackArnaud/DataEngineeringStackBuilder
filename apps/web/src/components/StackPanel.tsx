import { useMemo, useState } from "react";
import type { RenderModel, RenderTool } from "@compile";
import { EXAMPLES } from "../examples";
import { KIND_LABEL, plural } from "../labels";
import type { Lookup } from "../lookup";
import { add, isSelectable, toggle } from "../state";
import type { StackState } from "../state";
import { RoleGlyph } from "./glyphs";

export interface VendorGroup {
  vendor: string;
  /** The vendor's portfolio, if it has one. It is not selectable; its services are. */
  portfolio?: RenderTool;
  tools: RenderTool[];
}

const KIND_ORDER: Record<string, number> = { bundle: 0, tool: 1 };

/** Records grouped by vendor for the picker. A search that matches a portfolio shows all its services. */
export function groupByVendor(model: RenderModel, query: string): VendorGroup[] {
  const q = query.trim().toLowerCase();
  const matches = (t: RenderTool) => !q || [t.name, t.vendor, t.id, t.tagline ?? ""].some((s) => s.toLowerCase().includes(q));

  const byVendor = new Map<string, RenderTool[]>();
  for (const t of model.tools) byVendor.set(t.vendor, [...(byVendor.get(t.vendor) ?? []), t]);

  return [...byVendor.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([vendor, list]) => {
      const portfolio = list.find((t) => t.kind === "portfolio");
      const all = list.filter((t) => t.kind !== "portfolio");
      const tools = portfolio && matches(portfolio) ? all : all.filter(matches);
      return { vendor, portfolio, tools: tools.sort((a, b) => (KIND_ORDER[a.kind] ?? 2) - (KIND_ORDER[b.kind] ?? 2) || a.name.localeCompare(b.name)) };
    })
    .filter((g) => g.tools.length > 0);
}

interface Props {
  model: RenderModel;
  lookup: Lookup;
  state: StackState;
  onChange: (patch: Partial<StackState>) => void;
  onOpenTool: (id: string) => void;
}

export function StackPanel({ model, lookup, state, onChange, onOpenTool }: Props) {
  const [query, setQuery] = useState("");
  const groups = useMemo(() => groupByVendor(model, query), [model, query]);
  const selected = new Set(state.tools);

  return (
    <div className="panel stack">
      <section aria-labelledby="mystack">
        <h2 id="mystack">Your stack</h2>
        {state.tools.length === 0 ? (
          <>
            <p className="muted">Pick tools below, or start from an example.</p>
            <ul className="examples">
              {EXAMPLES.map((e) => (
                <li key={e.label}>
                  <button type="button" className="example" onClick={() => onChange({ tools: [...e.tools], needs: e.needs ?? [] })}>
                    <strong>{e.label}</strong>
                    <span className="muted">{e.hint}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <ul className="chips" aria-label="Selected tools">
            {state.tools.map((id) => (
              <li key={id}>
                <span className="chip">
                  <button type="button" className="chip__name" onClick={() => onOpenTool(id)}>
                    {lookup.toolName(id)}
                  </button>
                  <button type="button" className="chip__remove" aria-label={`Remove ${lookup.toolName(id)}`} onClick={() => onChange({ tools: toggle(state.tools, id) })}>
                    <span aria-hidden="true">×</span>
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="picktools">
        <h3 id="picktools">Tools</h3>
        <label className="search">
          <span className="sr-only">Find a tool</span>
          <input type="search" placeholder="Find a tool or vendor" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="picklist">
          {groups.length === 0 && <p className="muted">No tool matches “{query}”.</p>}
          {groups.map((g) => {
            const serviceIds = g.tools.filter((t) => isSelectable(model, t.id) && t.kind === "tool").map((t) => t.id);
            const allAdded = serviceIds.every((id) => selected.has(id));
            return (
              <div key={g.vendor} className="vendor">
                <div className="vendor__head">
                  <h4>{g.vendor}</h4>
                  {g.portfolio && (
                    <button type="button" className="linkish" disabled={allAdded} onClick={() => onChange({ tools: add(state.tools, ...serviceIds) })}>
                      {allAdded ? "All services added" : `Add all ${serviceIds.length} services`}
                    </button>
                  )}
                </div>
                <ul>
                  {g.tools.map((t) => {
                    const parents = lookup.includedBy(t.id).filter((p) => selected.has(p.id));
                    return (
                      <li key={t.id} className="pick">
                        <label className="pick__label">
                          <input type="checkbox" checked={selected.has(t.id)} onChange={() => onChange({ tools: toggle(state.tools, t.id) })} />
                          <span className="pick__body">
                            <span className="pick__top">
                              <RoleGlyph role={t.role} />
                              <span className="pick__name">{t.name}</span>
                            </span>
                            {(t.kind === "bundle" || t.tagline) && (
                              <span className="pick__tagline">
                                {t.kind === "bundle" && <span className="tag">{KIND_LABEL.bundle} · {plural(t.includes?.length ?? 0, "part")}</span>}
                                {t.kind === "bundle" && t.tagline ? " " : ""}
                                {t.tagline}
                              </span>
                            )}
                            {parents.length > 0 && <span className="pick__note">Already included in {parents.map((p) => p.name).join(", ")}</span>}
                          </span>
                        </label>
                        <button type="button" className="linkish" aria-label={`Details for ${t.name}`} onClick={() => onOpenTool(t.id)}>
                          Details
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="needs">
        <h3 id="needs">What you need</h3>
        <p className="muted">Tick the capabilities you rely on. Anything you tick that your tools lack is flagged as a gap.</p>
        {model.stages.map((stage) => {
          const caps = model.capabilities.filter((c) => c.kind === "spine" && c.parent === stage.id && c.status === "active");
          const count = caps.filter((c) => state.needs.includes(c.id)).length;
          return (
            <details key={stage.id} className="needs">
              <summary>
                {stage.name}
                {count > 0 && <span className="count">{count}</span>}
              </summary>
              <ul>
                {caps.map((c) => (
                  <li key={c.id}>
                    <label className="need">
                      <input type="checkbox" checked={state.needs.includes(c.id)} onChange={() => onChange({ needs: toggle(state.needs, c.id) })} />
                      <span>
                        <span className="need__name">{c.name}</span>
                        <span className="muted need__desc">{c.description}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </details>
          );
        })}
      </section>
    </div>
  );
}
