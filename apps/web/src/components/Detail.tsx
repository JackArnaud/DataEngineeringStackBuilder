import { useEffect, useMemo, useRef, useState } from "react";
import { suggestTools } from "@compile";
import type { Gap, GapReport, GapsInLens, RenderLens, RenderModel, RenderTool } from "@compile";
import { ARCHETYPE_LABEL, constraintText, gapTitle, KIND_LABEL, LEVEL_HELP, LEVEL_LABEL, plural } from "../labels";
import type { Lookup } from "../lookup";
import { groupCells, joinNames } from "../receipts";
import type { StackState } from "../state";
import type { Detail } from "../types";
import { CellGroups } from "./CellGroups";
import { whereText } from "./GapList";
import { RoleGlyph } from "./glyphs";
import { DeliveryBadge, LevelBadge, SeverityChip } from "./parts";

interface Props {
  model: RenderModel;
  lookup: Lookup;
  lens: RenderLens;
  state: StackState;
  report: GapReport;
  placement: GapsInLens;
  bands: Record<string, Record<string, number>>;
  detail: Detail;
  onClose: () => void;
  onOpen: (detail: Detail) => void;
  onToggleTool: (id: string) => void;
  onAddTools: (ids: string[]) => void;
}

/**
 * The receipts panel. Every tool, zone and gap on the page opens here, and every claim in it is
 * backed by the score, the note and the source link it came from.
 */
export function DetailPanel(props: Props) {
  const { detail, lookup, onClose } = props;
  const panel = useRef<HTMLDivElement>(null);

  // Move focus into the panel when it opens or changes subject, so keyboard users land in it.
  const subject = detail.kind === "zone" ? detail.zone : detail.id;
  useEffect(() => {
    panel.current?.focus();
  }, [detail.kind, subject]);

  let title = "";
  let body: React.ReactNode = null;
  if (detail.kind === "tool") {
    const tool = lookup.tool(detail.id);
    title = tool?.name ?? detail.id;
    body = tool ? <ToolDetail {...props} tool={tool} /> : <p>This tool is not in the data.</p>;
  } else if (detail.kind === "zone") {
    title = `${props.model.stages.some((s) => s.id === detail.zone) ? lookup.stageName(detail.zone) : detail.zone.charAt(0).toUpperCase() + detail.zone.slice(1)}`;
    body = <ZoneDetail {...props} zone={detail.zone} />;
  } else {
    const gap = props.report.gaps.find((g) => g.id === detail.id);
    title = gap ? gapTitle(gap, lookup) : "Gap";
    body = gap ? <GapDetail {...props} gap={gap} /> : <p>This gap is closed in your current stack.</p>;
  }

  // A plain div, not an aside or header: those carry landmark roles that a dialog may not have,
  // and a header inside it would read as a second page banner.
  return (
    <div
      ref={panel}
      className="detail"
      role="dialog"
      aria-modal="false"
      aria-labelledby="detail-title"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="detail__head">
        <h2 id="detail-title">{title}</h2>
        <button type="button" className="close" aria-label="Close details" onClick={onClose}>
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <div className="detail__body">{body}</div>
    </div>
  );
}

// ------------------------------------------------------------------------------------ a tool

function ToolDetail({ model, lookup, state, tool, onOpen, onToggleTool, onAddTools }: Props & { tool: RenderTool }) {
  const stageIds = model.stages.map((s) => s.id);
  const capabilityIds = model.capabilities.map((c) => c.id);
  const groups = useMemo(() => groupCells(tool.cells, stageIds, capabilityIds), [tool, model]);
  const spine = groups.filter((g) => lookup.capability(g.capability)?.kind === "spine");
  const band = groups.filter((g) => lookup.capability(g.capability)?.kind === "band");
  const inStack = state.tools.includes(tool.id);
  const members = (tool.includes ?? []).map((id) => lookup.tool(id)).filter((t): t is RenderTool => !!t);
  const parents = lookup.includedBy(tool.id);

  return (
    <>
      <div className="detail__actions">
        {tool.kind === "portfolio" ? (
          <button type="button" className="primary" onClick={() => onAddTools(members.filter((m) => m.kind === "tool").map((m) => m.id))}>
            Add its {plural(members.length, "service")}
          </button>
        ) : (
          <button type="button" className={inStack ? "secondary" : "primary"} onClick={() => onToggleTool(tool.id)}>
            {inStack ? "Remove from your stack" : "Add to your stack"}
          </button>
        )}
      </div>

      {tool.tagline && <p className="lede">{tool.tagline}</p>}

      <dl className="facts">
        <dt>Kind</dt>
        <dd>{KIND_LABEL[tool.kind]}</dd>
        <dt>Vendor</dt>
        <dd>{tool.vendor}</dd>
        <dt>Role</dt>
        <dd>
          <RoleGlyph role={tool.role} /> {lookup.roleLabel(tool.role)}
          <span className="muted"> · {lookup.roleDescription(tool.role)}</span>
          {tool.role_source === "override" && <span className="muted"> (set by hand; derived: {tool.derived_role})</span>}
        </dd>
        <dt>Breadth</dt>
        <dd>{ARCHETYPE_LABEL[tool.archetype] ?? tool.archetype}</dd>
        <dt>Licence</dt>
        <dd>{tool.license}</dd>
        <dt>Runs as</dt>
        <dd>{tool.deployment.join(", ")}</dd>
        <dt>Pricing</dt>
        <dd>{tool.pricing_model}</dd>
        {tool.sku && (
          <>
            <dt>Scored as</dt>
            <dd>{tool.sku}</dd>
          </>
        )}
      </dl>

      {tool.needs_review && <p className="callout">Scored against an older version of the taxonomy. A capability shown as absent may be unscored, not zero.</p>}

      {parents.length > 0 && (
        <p className="note">
          Part of{" "}
          {parents.map((p, i) => (
            <span key={p.id}>
              {i > 0 && ", "}
              <button type="button" className="linkish" onClick={() => onOpen({ kind: "tool", id: p.id })}>
                {p.name}
              </button>
            </span>
          ))}
          .
        </p>
      )}

      {members.length > 0 && (
        <section>
          <h3>{tool.kind === "portfolio" ? "Services" : "Parts"}</h3>
          <p className="muted">
            {tool.kind === "portfolio"
              ? "Independently purchased. The coverage below is derived for comparison only: pick the services you actually use."
              : "Sold under one contract. The coverage below is derived from these parts, and nothing here is scored by hand."}
          </p>
          <ul className="members">
            {members.map((m) => (
              <li key={m.id}>
                <button type="button" className="linkish" onClick={() => onOpen({ kind: "tool", id: m.id })}>
                  {m.name}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3>Pipeline coverage</h3>
        <LevelKey />
        <CellGroups groups={spine} lookup={lookup} />
      </section>
      {band.length > 0 && (
        <section>
          <h3>Cross-cutting coverage</h3>
          <CellGroups groups={band} lookup={lookup} />
        </section>
      )}
    </>
  );
}

function LevelKey() {
  return (
    <details className="levelkey">
      <summary>What do the levels mean?</summary>
      <ul>
        {[3, 2, 1].map((l) => (
          <li key={l}>
            <LevelBadge level={l} /> {LEVEL_HELP[l]}
          </li>
        ))}
      </ul>
    </details>
  );
}

// ------------------------------------------------------------------------------------ a zone

function ZoneDetail({ model, lookup, lens, state, placement, bands, zone, onOpen }: Props & { zone: string }) {
  const selected = state.tools.map((id) => lookup.tool(id)).filter((t): t is RenderTool => !!t);
  const stagesHere = model.stages.filter((s) => {
    const p = lens.stage_placement[s.id];
    return Array.isArray(p) && p.includes(zone);
  });
  const inZone = selected
    .map((tool) => ({ tool, zone: lens.tools[tool.id]?.zones[zone] }))
    .filter((x): x is { tool: RenderTool; zone: NonNullable<typeof x.zone> } => !!x.zone);
  const gaps = placement.placed.filter((p) => p.zones.includes(zone)).map((p) => p.gap);

  return (
    <>
      {stagesHere.length > 0 && (
        <p className="note">
          In the {lens.name} lens, this zone is where {joinNames(stagesHere.map((s) => s.name))} land.
        </p>
      )}

      <section>
        <h3>Your tools here</h3>
        {inZone.length === 0 ? (
          <p className="muted">None of your tools has coverage in this zone.</p>
        ) : (
          <ul className="zonetools">
            {inZone.map(({ tool, zone: z }) => (
              <li key={tool.id}>
                <div className="zonetools__head">
                  <button type="button" className="linkish" onClick={() => onOpen({ kind: "tool", id: tool.id })}>
                    {tool.name}
                  </button>
                  <LevelBadge level={z.intensity} />
                </div>
                <span className="muted">{[...new Set(z.cells.map((k) => lookup.cellLabel(k)))].join("; ")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3>Cross-cutting here</h3>
        <ul className="zonetools">
          {model.bands.map((band) => {
            const who = selected.filter((t) => (lens.tools[t.id]?.bands[zone]?.[band.id] ?? 0) > 0);
            const level = bands[band.id]?.[zone] ?? 0;
            return (
              <li key={band.id}>
                <div className="zonetools__head">
                  <strong>{band.name}</strong>
                  {level > 0 ? <LevelBadge level={level} /> : <span className="muted">not covered</span>}
                </div>
                {who.length > 0 && (
                  <span className="muted">
                    {who.map((t) => `${t.name} (${LEVEL_LABEL[lens.tools[t.id]!.bands[zone]![band.id]!]})`).join(", ")}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h3>Gaps that touch this zone</h3>
        {gaps.length === 0 ? (
          <p className="muted">None.</p>
        ) : (
          <ul className="zonegaps">
            {gaps.map((g) => (
              <li key={g.id}>
                <button type="button" className="gap" onClick={() => onOpen({ kind: "gap", id: g.id })}>
                  <SeverityChip criticality={g.criticality} />
                  <span className="gap__body">
                    <span className="gap__title">{gapTitle(g, lookup)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

// ------------------------------------------------------------------------------------- a gap

function GapDetail(props: Props & { gap: Gap }) {
  const { model, lookup, lens, state, placement, gap, onOpen, onAddTools } = props;
  const [showAll, setShowAll] = useState(false);
  const suggestions = useMemo(() => suggestTools(model, gap, state.tools), [model, gap, state.tools]);
  const shown = showAll ? suggestions : suggestions.slice(0, 5);

  const stage = model.stages.find((s) => s.id === gap.stage)!;
  const capability = gap.capability ? lookup.capability(gap.capability) : undefined;
  const impact = lookup.impactOf(gap);
  // A cross-cutting capability is usually missing at several stages; they share one row in the list.
  const others = gap.kind === "band" ? props.report.gaps.filter((g) => g.kind === "band" && g.capability === gap.capability && g.id !== gap.id) : [];
  const why =
    gap.kind === "empty-stage"
      ? stage.rationale
      : gap.kind === "needed-capability"
        ? "You marked this as something you need, so a stack without it is missing something you asked for."
        : (model.criticality_rationale[`${gap.capability}@${gap.stage}`] ?? "");

  return (
    <>
      <p>
        <SeverityChip criticality={gap.criticality} />
      </p>

      {impact && (
        <section>
          <h3>What goes wrong without it</h3>
          <p>{impact.matters}</p>
          <p className="muted">
            <strong>For example:</strong> {impact.example}
          </p>
          {impact.skip_when && gap.kind !== "needed-capability" && (
            <p className="muted">
              <strong>Reasonable to skip if:</strong> {impact.skip_when}
            </p>
          )}
        </section>
      )}

      {impact?.ai && (
        <section className="aiwhy">
          <h3>If AI uses this data</h3>
          <p>{impact.ai}</p>
        </section>
      )}

      {gap.conditional.length > 0 && (
        <section>
          <h3>Your tools can close this on a higher plan</h3>
          <ul>
            {gap.conditional.map((c) => (
              <li key={`${c.level}${c.constraint.join()}`}>
                <LevelBadge level={c.level} /> on {constraintText(c.constraint)}, via {joinNames(c.via.map((v) => lookup.toolName(v)))}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3>What would close it</h3>
        {suggestions[0] && suggestions[0].affinity !== "other" && suggestions[0].level >= 2 && (
          <p className="muted">
            {suggestions[0].affinity === "ecosystem" ? "Tools from vendors you already use come first." : "Tools that are commonly used with yours come first."}
          </p>
        )}
        {suggestions.length === 0 ? (
          <p className="muted">No tool in the data provides this without a constraint yet.</p>
        ) : (
          <>
            <ul className="suggestions">
              {shown.map((s) => (
                <li key={s.tool} className="suggestion">
                  <div className="suggestion__main">
                    <button type="button" className="linkish" onClick={() => onOpen({ kind: "tool", id: s.tool })}>
                      {lookup.toolName(s.tool)}
                    </button>
                    <LevelBadge level={s.level} />
                    <DeliveryBadge delivery={s.delivery} />
                    {s.affinity !== "other" && (
                      <span className={`fit fit--${s.affinity}`}>
                        {s.affinity === "ecosystem" ? "Same vendor as " : "Pairs with "}
                        {joinNames(s.related.map((r) => lookup.toolName(r)))}
                      </span>
                    )}
                  </div>
                  <button type="button" className="secondary" aria-label={`Add ${lookup.toolName(s.tool)} to your stack`} onClick={() => onAddTools([s.tool])}>
                    Add
                  </button>
                </li>
              ))}
            </ul>
            {suggestions.length > 5 && (
              <button type="button" className="more" onClick={() => setShowAll((v) => !v)}>
                {showAll ? "Show fewer" : `Show all ${suggestions.length}`}
              </button>
            )}
          </>
        )}
      </section>

      {others.length > 0 && (
        <section>
          <h3>Also missing at</h3>
          <ul className="alsoat">
            {others.map((o) => (
              <li key={o.id}>
                <button type="button" className="linkish" onClick={() => onOpen({ kind: "gap", id: o.id })}>
                  {lookup.stageName(o.stage)}
                </button>
                <span className="muted"> · criticality {o.criticality}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <details className="fold">
        <summary>Why it ranks {gap.criticality >= 4 ? "high" : gap.criticality === 3 ? "in the middle" : "low"}</summary>
        <div className="fold__body">
          <p>{why}</p>
          <p className="muted">
            Criticality {gap.criticality} of 5{gap.kind === "band" && <> for this capability at {stage.name}</>}.
          </p>
          {capability && (
            <p className="muted">
              <strong>{capability.name}:</strong> {capability.description}
            </p>
          )}
          {gap.kind === "empty-stage" && <p className="muted">{stage.description}</p>}
          <p className="note">Where it shows: {whereText(gap, placement, lens, model, lookup) || "not drawn in this lens"}.</p>
        </div>
      </details>
    </>
  );
}
