import { useMemo, useState } from "react";
import type { RenderModel } from "@compile";
import { KIND_LABEL, plural } from "../labels";
import type { Lookup } from "../lookup";
import { groupByVendor } from "../picker";
import { add, isSelectable, toggle } from "../state";
import type { StackState } from "../state";
import { RoleGlyph } from "./glyphs";

interface Props {
  model: RenderModel;
  lookup: Lookup;
  state: StackState;
  onChange: (patch: Partial<StackState>) => void;
  onOpenTool: (id: string) => void;
}

/**
 * Vendors as a short list that opens on demand, with a search and a "covers this stage" filter to
 * narrow it. Searching or filtering opens the matching vendors, so the answer is on screen.
 */
export function ToolPicker({ model, lookup, state, onChange, onOpenTool }: Props) {
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<string | null>(null);
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const groups = useMemo(() => groupByVendor(model, query, stage), [model, query, stage]);
  const selected = new Set(state.tools);
  const narrowed = query.trim() !== "" || stage !== null;
  const matching = groups.reduce((n, g) => n + g.tools.length, 0);

  return (
    <div className="picker">
      <label className="search">
        <span className="sr-only">Find a tool</span>
        <input type="search" placeholder="Find a tool or vendor" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>

      <div className="stagefilter" role="group" aria-label="Show tools that cover">
        <span className="stagefilter__label">Covers</span>
        <button type="button" className="pill" aria-pressed={stage === null} onClick={() => setStage(null)}>
          Any stage
        </button>
        {model.stages.map((s) => (
          <button key={s.id} type="button" className="pill" aria-pressed={stage === s.id} onClick={() => setStage(stage === s.id ? null : s.id)}>
            {s.name}
          </button>
        ))}
      </div>

      {narrowed && (
        <p className="muted picker__count" role="status">
          {matching === 0 ? `No tool matches${query.trim() ? ` “${query.trim()}”` : ""}${stage ? ` in ${lookup.stageName(stage)}` : ""}.` : `${plural(matching, "tool")} in ${plural(groups.length, "vendor")}.`}
        </p>
      )}

      <div className="picklist">
        {groups.map((g) => {
          const open = toggled[g.vendor] ?? narrowed;
          const serviceIds = (g.portfolio?.includes ?? g.tools.map((t) => t.id)).filter((id) => isSelectable(model, id) && lookup.tool(id)?.kind === "tool");
          const allAdded = serviceIds.every((id) => selected.has(id));
          const chosen = g.tools.filter((t) => selected.has(t.id)).length;
          const listId = `vendor-${g.vendor.replace(/\W+/g, "-")}`;
          return (
            <div key={g.vendor} className="vendor" data-open={open}>
              <div className="vendor__head">
                <h3 className="vendor__name">
                  <button type="button" className="vendor__toggle" aria-expanded={open} aria-controls={listId} onClick={() => setToggled({ ...toggled, [g.vendor]: !open })}>
                    <span className="vendor__caret" aria-hidden="true">
                      {open ? "▾" : "▸"}
                    </span>
                    {g.vendor}
                  </button>
                </h3>
                <span className="vendor__meta muted">
                  {plural(g.tools.length, "product")}
                  {chosen > 0 && <span className="count">{chosen} added</span>}
                </span>
                {g.portfolio && (
                  <button type="button" className="linkish vendor__all" disabled={allAdded} onClick={() => onChange({ tools: add(state.tools, ...serviceIds) })}>
                    {allAdded ? "All services added" : `Add all ${serviceIds.length} services`}
                  </button>
                )}
              </div>
              {open && (
                <ul id={listId}>
                  {g.tools.map((t) => {
                    const parents = lookup.includedBy(t.id).filter((p) => selected.has(p.id));
                    return (
                      <li key={t.id} className={g.parts.has(t.id) ? "pick pick--part" : "pick"}>
                        <label className="pick__label">
                          <input type="checkbox" checked={selected.has(t.id)} onChange={() => onChange({ tools: toggle(state.tools, t.id) })} />
                          <span className="pick__body">
                            <span className="pick__top">
                              <RoleGlyph role={t.role} />
                              <span className="pick__name">{t.name}</span>
                            </span>
                            {(t.kind === "bundle" || t.tagline) && (
                              <span className="pick__tagline">
                                {t.kind === "bundle" && (
                                  <span className="tag">
                                    {KIND_LABEL.bundle} · {plural(t.includes?.length ?? 0, "part")}
                                  </span>
                                )}
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
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
