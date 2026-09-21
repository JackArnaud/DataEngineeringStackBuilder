import { useMemo, useState } from "react";
import { groupGaps, isFixFirst } from "@compile";
import type { Gap, GapGroup, GapsInLens, RenderLens, RenderModel } from "@compile";
import { constraintText, GAP_KIND_LABEL, groupTitle, listNames, NAMED_STAGES_MAX, plural } from "../labels";
import type { Lookup } from "../lookup";
import { SeverityChip } from "./parts";

const LIMIT = 8;

interface Props {
  model: RenderModel;
  lookup: Lookup;
  lens: RenderLens;
  /** The gaps to show: what the stack is missing, less anything the user set aside. */
  gaps: Gap[];
  /** Cross-cutting gaps the user marked as not relevant to their stack. */
  setAside: Gap[];
  placement: GapsInLens;
  hasTools: boolean;
  onOpen: (id: string) => void;
  onSkip: (capability: string) => void;
  onRestore: (capability: string) => void;
}

/** Where a lens draws a gap, in words. */
export function whereText(gap: Gap, placement: GapsInLens, lens: RenderLens, model: RenderModel, lookup: Lookup): string {
  const placed = placement.placed.find((p) => p.gap.id === gap.id);
  if (placed) {
    if (placed.zones.length === lens.zones.length) return "Every zone";
    return placed.zones.map((z) => (model.stages.some((s) => s.id === z) ? lookup.stageName(z) : z.charAt(0).toUpperCase() + z.slice(1))).join(", ");
  }
  return placement.rail.some((g) => g.id === gap.id) ? "In the side rail: this lens has no zone for it" : "";
}

/**
 * The gaps as a short, ranked list. A cross-cutting capability missing at five stages is one row, not
 * five. What is urgent comes first; the lower-priority cross-cutting ones sit behind a fold, by theme,
 * and any of them can be set aside as not relevant to this stack.
 */
export function GapList({ model, lookup, lens, gaps, setAside, placement, hasTools, onOpen, onSkip, onRestore }: Props) {
  const [showAll, setShowAll] = useState(false);
  const groups = useMemo(() => groupGaps(model, gaps), [model, gaps]);
  const hidden = useMemo(() => groupGaps(model, setAside), [model, setAside]);
  const first = groups.filter(isFixFirst);
  const rest = groups.filter((g) => !isFixFirst(g));
  const shown = showAll ? first : first.slice(0, LIMIT);

  const row = (g: GapGroup) => {
    const title = groupTitle(g, lookup);
    const matters = lookup.impactOf(g.gaps[0]!)?.matters;
    const remedy = g.gaps.find((x) => x.conditional.length > 0)?.conditional[0];
    // A band group's title names its stages when there are few; with many, the row lists them instead.
    const where = g.kind === "band" ? (g.stages.length > NAMED_STAGES_MAX ? listNames(g.stages.map((x) => lookup.stageName(x))) : "") : whereText(g.gaps[0]!, placement, lens, model, lookup);
    return (
      <li key={g.id} className="gaprow">
        <button type="button" className="gap" onClick={() => onOpen(g.gaps[0]!.id)}>
          <SeverityChip criticality={g.criticality} />
          <span className="gap__body">
            <span className="gap__title">{title}</span>
            {matters && <span className="gap__why">{matters}</span>}
            <span className="gap__meta">
              {GAP_KIND_LABEL[g.kind]}
              {where && <> · {where}</>}
              {remedy && <> · closable on {constraintText(remedy.constraint)}</>}
            </span>
          </span>
        </button>
        {g.kind === "band" && (
          <button type="button" className="skip" aria-label={`Not relevant to my stack: ${title}`} onClick={() => onSkip(g.capability!)}>
            Not relevant
          </button>
        )}
      </li>
    );
  };

  // Lower-priority gaps by theme: governance, quality, observability, platform.
  const themes = model.bands
    .map((b) => ({ band: b, groups: rest.filter((g) => lookup.capability(g.capability!)?.parent === b.id) }))
    .filter((t) => t.groups.length > 0);

  if (groups.length === 0) {
    return (
      <>
        <p className="allclear">
          {hasTools ? "No gaps. Every stage that matters is covered and nothing you need is missing." : "Nothing to flag yet."}
          {hidden.length > 0 && ` ${plural(hidden.length, "capability", "capabilities")} set aside as not relevant.`}
        </p>
        <SetAside hidden={hidden} lookup={lookup} onRestore={onRestore} />
      </>
    );
  }

  return (
    <div className="gaplist">
      <p className="muted gaplist__intro">
        {first.length > 0 ? `${first.length} to fix first` : "Nothing urgent"}
        {rest.length > 0 && `, ${rest.length} more worth checking`}. Criticality is how much a stack loses without it, from 1 to 5. Where a capability is missing at several stages, they share one row.
      </p>

      {first.length > 0 && (
        <>
          <ol className="gaps" aria-label="Fix first">
            {shown.map(row)}
          </ol>
          {first.length > LIMIT && (
            <button type="button" className="more" onClick={() => setShowAll((v) => !v)}>
              {showAll ? `Show the top ${LIMIT}` : `Show all ${first.length}`}
            </button>
          )}
        </>
      )}

      {rest.length > 0 && (
        <details className="gapsrest" open={first.length === 0 ? true : undefined}>
          <summary>
            {plural(rest.length, "lower-priority gap")}
            <span className="muted"> · cross-cutting, worth a look if they apply to you</span>
          </summary>
          {themes.map((t) => (
            <section key={t.band.id} className="gaptheme">
              <h3>
                {t.band.name} <span className="muted">({t.groups.length})</span>
              </h3>
              <ol className="gaps">{t.groups.map(row)}</ol>
            </section>
          ))}
        </details>
      )}

      <SetAside hidden={hidden} lookup={lookup} onRestore={onRestore} />
    </div>
  );
}

/** What the user set aside, so nothing is hidden for good and it takes one click to bring back. */
function SetAside({ hidden, lookup, onRestore }: { hidden: GapGroup[]; lookup: Lookup; onRestore: (capability: string) => void }) {
  if (hidden.length === 0) return null;
  return (
    <details className="gapsaside">
      <summary>{plural(hidden.length, "capability", "capabilities")} set aside as not relevant</summary>
      <ul>
        {hidden.map((g) => (
          <li key={g.id}>
            <span>{groupTitle(g, lookup)}</span>
            <button type="button" className="linkish" aria-label={`Bring back: ${lookup.capabilityName(g.capability!)}`} onClick={() => onRestore(g.capability!)}>
              Bring back
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
