import { useState } from "react";
import type { Gap, GapsInLens, RenderLens, RenderModel } from "@compile";
import { constraintText, GAP_KIND_LABEL, gapTitle, plural } from "../labels";
import type { Lookup } from "../lookup";
import { SeverityChip } from "./parts";

const LIMIT = 8;

interface Props {
  model: RenderModel;
  lookup: Lookup;
  lens: RenderLens;
  gaps: Gap[];
  placement: GapsInLens;
  hasTools: boolean;
  onOpen: (id: string) => void;
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

/** The ranked gaps. Only the top few show at first; a real stack has dozens, and rank is the point. */
export function GapList({ model, lookup, lens, gaps, placement, hasTools, onOpen }: Props) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? gaps : gaps.slice(0, LIMIT);

  if (gaps.length === 0) {
    return (
      <p className="allclear">
        {hasTools ? "No gaps. Every stage that matters is covered and nothing you need is missing." : "Nothing to flag yet."}
      </p>
    );
  }

  return (
    <div className="gaplist">
      <p className="muted gaplist__intro">
        {plural(gaps.length, "gap")}, most important first. Criticality is how much a stack loses without it, from 1 to 5.
      </p>
      <ol className="gaps">
        {shown.map((g) => {
          const where = whereText(g, placement, lens, model, lookup);
          return (
            <li key={g.id}>
              <button type="button" className="gap" onClick={() => onOpen(g.id)}>
                <SeverityChip criticality={g.criticality} />
                <span className="gap__body">
                  <span className="gap__title">{gapTitle(g, lookup)}</span>
                  <span className="gap__meta">
                    {GAP_KIND_LABEL[g.kind]}
                    {where && <> · {where}</>}
                    {g.conditional.length > 0 && <> · closable on {constraintText(g.conditional[0]!.constraint)}</>}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {gaps.length > LIMIT && (
        <button type="button" className="more" onClick={() => setShowAll((v) => !v)}>
          {showAll ? `Show the top ${LIMIT}` : `Show all ${gaps.length}`}
        </button>
      )}
    </div>
  );
}
