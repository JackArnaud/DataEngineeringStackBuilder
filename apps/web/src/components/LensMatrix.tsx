import { Fragment, useMemo, useRef, useState } from "react";
import type { Gap, GapsInLens, Overlap, RenderLens, RenderModel, RenderTool, ToolLensView } from "@compile";
import { gapTitle, LEVEL_LABEL, listNames, plural, severity } from "../labels";
import type { Lookup } from "../lookup";
import { RAMP_ORDER, rampOf } from "../roles";
import type { View } from "../state";
import type { Detail } from "../types";
import { RoleGlyph, SeverityIcon } from "./glyphs";

export interface Lane {
  tool: RenderTool;
  view: ToolLensView;
}

/**
 * The tools that have a position in this lens, ordered left to right by where they are strongest,
 * then by what they do to the data. A tool with only cross-cutting coverage has no position and is
 * listed separately: it adds governance or tooling, not a place in the pipeline.
 */
export function buildLanes(lens: RenderLens, tools: RenderTool[]): Lane[] {
  const first = (l: Lane) => (l.view.span.length ? Math.min(...l.view.span.map((z) => lens.zones.indexOf(z))) : lens.zones.length);
  return tools
    .map((tool) => ({ tool, view: lens.tools[tool.id] }))
    .filter((l): l is Lane => l.view !== undefined && Object.keys(l.view.zones).length > 0)
    .sort((a, b) => first(a) - first(b) || RAMP_ORDER.indexOf(rampOf(a.tool.role)) - RAMP_ORDER.indexOf(rampOf(b.tool.role)) || a.tool.name.localeCompare(b.tool.name));
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

interface Props {
  model: RenderModel;
  lookup: Lookup;
  lens: RenderLens;
  tools: RenderTool[];
  placement: GapsInLens;
  bands: Record<string, Record<string, number>>;
  view: View;
  /** Tasks that more than one of the tools can do; a tool that is not the one used says so on its row. */
  overlaps?: Overlap[];
  onOpen: (detail: Detail) => void;
}

interface Tip {
  x: number;
  y: number;
  title: string;
  lines: string[];
}

export function LensMatrix({ model, lookup, lens, tools, placement, bands, view, overlaps = [], onOpen }: Props) {
  const lanes = useMemo(() => buildLanes(lens, tools), [lens, tools]);
  // Where you chose another tool for a task this one can also do, say so on its row.
  const notUsedFor = (id: string) => overlaps.filter((o) => o.used !== null && o.used !== id && o.providers.some((p) => p.tool === id));
  // Said briefly: a few tasks are named, more than that are counted, and the title carries the full list.
  const notUsedNote = (id: string) => {
    const names = notUsedFor(id).map((o) => lookup.capabilityName(o.capability).toLowerCase());
    return { text: names.length > 3 ? `${names.length} tasks` : listNames(names), full: listNames(names) };
  };
  const noPosition = tools.filter((t) => !lanes.some((l) => l.tool.id === t.id));
  // A tool with no place in the pipeline but real cross-cutting coverage (a catalog, a monitor, an
  // access layer) still gets a row: the best level it reaches in each zone, and which concerns it covers.
  const crossLanes = noPosition
    .map((tool) => {
      const view = lens.tools[tool.id];
      const perZone = Object.fromEntries(lens.zones.map((z) => [z, Math.max(0, ...Object.values(view?.bands[z] ?? {}))])) as Record<string, number>;
      const names = model.bands.filter((b) => lens.zones.some((z) => (view?.bands[z]?.[b.id] ?? 0) > 0)).map((b) => b.name);
      // Some lenses have no honest zone for a concern (cost has none in the medallion lens). Such a tool
      // still gets its row, marked as having no zone here, and its cells are in the "not shown" fold.
      const railed = [...new Set((view?.rail ?? []).map((k) => lookup.capabilityName(k.slice(0, k.indexOf("@")))))];
      const note = names.length > 0 ? listNames(names) : `no zone in this lens: ${listNames(railed.map((n) => n.toLowerCase()))}`;
      return { tool, perZone, names, note, placed: names.length > 0 };
    })
    .filter((l) => l.placed || l.note.includes(": "));
  // Only a tool with neither a position nor any cross-cutting coverage is left to a footnote.
  const unplaced = noPosition.filter((t) => !crossLanes.some((l) => l.tool.id === t.id));
  const zoneName = (z: string) => (model.stages.some((s) => s.id === z) ? lookup.stageName(z) : capitalise(z));

  const gapsByZone = useMemo(() => Object.fromEntries(lens.zones.map((z) => [z, placement.placed.filter((p) => p.zones.includes(z)).map((p) => p.gap)])) as Record<string, Gap[]>, [lens, placement]);

  const wrap = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);

  /** Build the tooltip for a mark. Tooltips only repeat what the table view and the detail panel say. */
  function tipFor(id: string): Pick<Tip, "title" | "lines"> | undefined {
    const [kind, a, b] = id.split("|") as [string, string, string];
    if (kind === "mark") {
      const lane = lanes.find((l) => l.tool.id === a);
      const zone = lane?.view.zones[b];
      if (!lane || !zone) return undefined;
      const names = [...new Set(zone.cells.map((k) => lookup.capabilityName(k.slice(0, k.indexOf("@")))))];
      const core = lane.view.span.includes(b);
      return {
        title: `${lane.tool.name} in ${zoneName(b)}`,
        lines: [`${LEVEL_LABEL[zone.intensity]}${core ? ", core position" : ", also reaches here"}`, names.length <= 3 ? names.join(", ") : `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`, "Click for notes and sources"],
      };
    }
    if (kind === "cross") {
      const view = lens.tools[a];
      const tool = tools.find((t) => t.id === a);
      if (!view || !tool) return undefined;
      const here = model.bands.filter((bd) => (view.bands[b]?.[bd.id] ?? 0) > 0).map((bd) => `${bd.name}: ${LEVEL_LABEL[view.bands[b]![bd.id]!]}`);
      return { title: `${tool.name} in ${zoneName(b)}`, lines: [...here, "Cross-cutting, not a pipeline position. Click for notes"] };
    }
    if (kind === "band") {
      const level = bands[a]?.[b] ?? 0;
      const who = tools.filter((t) => (lens.tools[t.id]?.bands[b]?.[a] ?? 0) > 0).map((t) => `${t.name} (${LEVEL_LABEL[lens.tools[t.id]!.bands[b]![a]!]})`);
      return { title: `${lookup.bandName(a)} in ${zoneName(b)}`, lines: [level ? `Best: ${LEVEL_LABEL[level]}` : "Not covered", ...who] };
    }
    if (kind === "gap") {
      const gaps = gapsByZone[a] ?? [];
      return { title: `${plural(gaps.length, "gap")} touch ${zoneName(a)}`, lines: [...gaps.slice(0, 3).map((g) => gapTitle(g, lookup)), ...(gaps.length > 3 ? [`and ${gaps.length - 3} more`] : []), "Click for all of them"] };
    }
    return undefined;
  }

  function show(el: HTMLElement) {
    const id = el.dataset.tip;
    const box = wrap.current;
    const content = id && box ? tipFor(id) : undefined;
    if (!box || !content) return setTip(null);
    const r = el.getBoundingClientRect();
    const w = box.getBoundingClientRect();
    setTip({ x: Math.min(Math.max(r.left - w.left + r.width / 2, 120), Math.max(w.width - 120, 120)), y: r.top - w.top, ...content });
  }
  const target = (e: { target: EventTarget }) => (e.target as HTMLElement).closest<HTMLElement>("[data-tip]");

  const rail = placement.rail;
  const railCells = useMemo(() => {
    const keys = new Map<string, string[]>();
    for (const l of lanes) for (const k of l.view.rail) keys.set(k, [...(keys.get(k) ?? []), l.tool.name]);
    for (const t of noPosition) for (const k of lens.tools[t.id]?.rail ?? []) keys.set(k, [...(keys.get(k) ?? []), t.name]);
    return [...keys.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [lanes, noPosition, lens]);

  const worst = (gaps: Gap[]) => Math.max(0, ...gaps.map((g) => g.criticality));

  return (
    <div className="lens">
      {view === "chart" ? (
        <div
          ref={wrap}
          className="matrix-wrap"
          onPointerOver={(e) => {
            const el = target(e);
            if (el) show(el);
            else setTip(null);
          }}
          onPointerLeave={() => setTip(null)}
          onFocus={(e) => {
            const el = target(e);
            if (el) show(el);
          }}
          onBlur={() => setTip(null)}
        >
          <div className="matrix" style={{ "--cols": lens.zones.length } as React.CSSProperties} role="group" aria-label={`Where your tools sit in the ${lens.name} lens`}>
            <div className="matrix__corner" />
            {lens.zones.map((z) => (
              <button key={z} type="button" className="zonehead" onClick={() => onOpen({ kind: "zone", zone: z })}>
                {zoneName(z)}
              </button>
            ))}

            {lanes.length === 0 && (
              <p className="matrix__empty">{tools.length === 0 ? "Pick tools and they appear here, in the zone where each is strongest." : "None of your tools has a position in the pipeline yet; see cross-cutting coverage below."}</p>
            )}

            {lanes.map(({ tool, view: v }) => {
              const ramp = rampOf(tool.role);
              return (
                <Fragment key={tool.id}>
                  <button type="button" className="lane__label" onClick={() => onOpen({ kind: "tool", id: tool.id })} title={`${tool.name}: ${lookup.roleDescription(tool.role)}`}>
                    <span className="lane__glyph" data-ramp={ramp}>
                      <RoleGlyph role={tool.role} />
                    </span>
                    <span className="lane__text">
                      <span className="lane__name lane__name--wrap">{tool.name}</span>
                      {notUsedFor(tool.id).length > 0 && (
                      <span className="lane__note lane__note--wrap" title={`Not used for ${notUsedNote(tool.id).full}`}>
                        not used for {notUsedNote(tool.id).text}
                      </span>
                    )}
                    </span>
                  </button>
                  {lens.zones.map((z) => {
                    const zone = v.zones[z];
                    const core = v.span.includes(z);
                    return (
                      <div key={z} className="cell">
                        {zone && (
                          <button
                            type="button"
                            className={core ? "mark mark--core" : "mark mark--reach"}
                            data-ramp={ramp}
                            data-level={zone.intensity}
                            data-tip={`mark|${tool.id}|${z}`}
                            aria-label={`${tool.name}, ${zoneName(z)}: ${LEVEL_LABEL[zone.intensity]}${core ? ", core position" : ""}`}
                            onClick={() => onOpen({ kind: "tool", id: tool.id })}
                          />
                        )}
                      </div>
                    );
                  })}
                </Fragment>
              );
            })}

            {crossLanes.length > 0 && <h3 className="matrix__section">Cross-cutting tools</h3>}
            {crossLanes.map(({ tool, perZone, note }) => {
              const ramp = rampOf(tool.role);
              return (
                <Fragment key={tool.id}>
                  <button type="button" className="lane__label" onClick={() => onOpen({ kind: "tool", id: tool.id })} title={`${tool.name}: ${lookup.roleDescription(tool.role)}`}>
                    <span className="lane__glyph" data-ramp={ramp}>
                      <RoleGlyph role={tool.role} />
                    </span>
                    <span className="lane__text">
                      <span className="lane__name lane__name--wrap">{tool.name}</span>
                      <span className="lane__note lane__note--wrap">{note}</span>
                    </span>
                  </button>
                  {lens.zones.map((z) => (
                    <div key={z} className="cell">
                      {perZone[z]! > 0 && (
                        <button
                          type="button"
                          className="mark mark--reach"
                          data-ramp={ramp}
                          data-level={perZone[z]}
                          data-tip={`cross|${tool.id}|${z}`}
                          aria-label={`${tool.name}, ${zoneName(z)}: ${LEVEL_LABEL[perZone[z]!]}, cross-cutting`}
                          onClick={() => onOpen({ kind: "tool", id: tool.id })}
                        />
                      )}
                    </div>
                  ))}
                </Fragment>
              );
            })}

            <h3 className="matrix__section">Cross-cutting coverage</h3>
            {model.bands.map((band) => (
              <Fragment key={band.id}>
                <div className="lane__label lane__label--band">{band.name}</div>
                {lens.zones.map((z) => {
                  const level = bands[band.id]?.[z] ?? 0;
                  return (
                    <div key={z} className="cell">
                      <button
                        type="button"
                        className={level ? "bandmark" : "bandmark bandmark--none"}
                        data-ramp="structural"
                        data-level={level || undefined}
                        data-tip={`band|${band.id}|${z}`}
                        aria-label={`${band.name}, ${zoneName(z)}: ${level ? LEVEL_LABEL[level] : "not covered"}`}
                        onClick={() => onOpen({ kind: "zone", zone: z })}
                      />
                    </div>
                  );
                })}
              </Fragment>
            ))}

            <h3 className="matrix__section">What’s missing</h3>
            <div className="lane__label lane__label--band">Gaps</div>
            {lens.zones.map((z) => {
              const gaps = gapsByZone[z] ?? [];
              // The chip counts the gaps at the worst tier, not every gap that touches the zone: a
              // gap spanning several zones would otherwise inflate every one of them into a number
              // nobody can act on. The tooltip and detail panel carry the full count.
              const top = worst(gaps);
              const atTop = gaps.filter((g) => g.criticality === top).length;
              const { tone, word } = severity(top);
              const lower = gaps.length - atTop;
              return (
                <div key={z} className="cell">
                  {gaps.length > 0 && (
                    <button
                      type="button"
                      className={`gapchip sev sev--${tone}`}
                      data-tip={`gap|${z}`}
                      aria-label={`${atTop} ${word.toLowerCase()} ${atTop === 1 ? "gap" : "gaps"}${lower > 0 ? ` and ${lower} lower` : ""} in ${zoneName(z)}`}
                      onClick={() => onOpen({ kind: "zone", zone: z })}
                    >
                      <SeverityIcon tone={tone} />
                      <span className="sev__n">{atTop}</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {tip && (
            <div className="tooltip" role="presentation" aria-hidden="true" style={{ left: tip.x, top: tip.y }}>
              <strong>{tip.title}</strong>
              {tip.lines.map((l, i) => (
                <span key={i}>{l}</span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="tablewrap">
          <table className="matrix-table">
            <caption>Where your tools sit in the {lens.name} lens. Bold marks the core position.</caption>
            <thead>
              <tr>
                <th scope="col">Tool</th>
                {lens.zones.map((z) => (
                  <th key={z} scope="col">
                    {zoneName(z)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lanes.length === 0 && (
                <tr>
                  <td colSpan={lens.zones.length + 1} className="muted">
                    No tools have a position yet.
                  </td>
                </tr>
              )}
              {lanes.map(({ tool, view: v }) => (
                <tr key={tool.id}>
                  <th scope="row">
                    <button type="button" className="linkish" onClick={() => onOpen({ kind: "tool", id: tool.id })}>
                      {tool.name}
                    </button>
                  </th>
                  {lens.zones.map((z) => {
                    const zone = v.zones[z];
                    return (
                      <td key={z} className={zone && v.span.includes(z) ? "is-core" : undefined}>
                        {zone ? LEVEL_LABEL[zone.intensity] : <span className="muted">–</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {crossLanes.map(({ tool, perZone, note }) => (
                <tr key={tool.id}>
                  <th scope="row">
                    <button type="button" className="linkish" onClick={() => onOpen({ kind: "tool", id: tool.id })}>
                      {tool.name}
                    </button>
                    <span className="muted"> · cross-cutting: {note}</span>
                  </th>
                  {lens.zones.map((z) => (
                    <td key={z}>{perZone[z]! > 0 ? LEVEL_LABEL[perZone[z]!] : <span className="muted">–</span>}</td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tbody>
              <tr className="table-section">
                <th colSpan={lens.zones.length + 1} scope="colgroup">
                  Cross-cutting coverage, best level in your stack
                </th>
              </tr>
              {model.bands.map((band) => (
                <tr key={band.id}>
                  <th scope="row">{band.name}</th>
                  {lens.zones.map((z) => {
                    const level = bands[band.id]?.[z] ?? 0;
                    return <td key={z}>{level ? LEVEL_LABEL[level] : <span className="muted">–</span>}</td>;
                  })}
                </tr>
              ))}
              <tr className="table-section">
                <th colSpan={lens.zones.length + 1} scope="colgroup">
                  Gaps that touch each zone
                </th>
              </tr>
              <tr>
                <th scope="row">Gaps</th>
                {lens.zones.map((z) => {
                  const gaps = gapsByZone[z] ?? [];
                  return (
                    <td key={z}>{gaps.length ? `${gaps.length}, worst ${severity(worst(gaps)).word.toLowerCase()}` : <span className="muted">–</span>}</td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {unplaced.length > 0 && (
        <p className="note">
          Nothing to place in this lens yet:{" "}
          {unplaced.map((t, i) => (
            <Fragment key={t.id}>
              {i > 0 && ", "}
              <button type="button" className="linkish" onClick={() => onOpen({ kind: "tool", id: t.id })}>
                {t.name}
              </button>
            </Fragment>
          ))}
          .
        </p>
      )}

      {(rail.length > 0 || railCells.length > 0) && (
        <details className="rail">
          <summary>
            Not shown in the {lens.name} lens <span className="count">{rail.length + railCells.length}</span>
          </summary>
          <p className="muted">
            This lens has no honest zone for these, so they sit here instead of disappearing. {lens.unmapped === "rail" ? "Switch to the audit grid to see them in place." : ""}
          </p>
          {rail.length > 0 && (
            <ul className="raillist">
              {rail.map((g) => (
                <li key={g.id}>
                  <button type="button" className="linkish" onClick={() => onOpen({ kind: "gap", id: g.id })}>
                    {gapTitle(g, lookup)}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {railCells.length > 0 && (
            <ul className="raillist">
              {railCells.map(([key, who]) => (
                <li key={key}>
                  {lookup.cellLabel(key)} <span className="muted">from {who.join(", ")}</span>
                </li>
              ))}
            </ul>
          )}
        </details>
      )}
    </div>
  );
}
