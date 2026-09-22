import type { Evidence } from "@compile";
import { constraintPhrase, plural, safeHref, sourceHost } from "../labels";
import type { Lookup } from "../lookup";
import type { CellGroup } from "../receipts";
import { joinNames } from "../receipts";
import { DeliveryBadge, LevelBadge, SourceLink } from "./parts";

/**
 * The receipts: every score behind a claim, with the note that justifies it and the link to the
 * documentation it came from. Nothing on screen is a claim without one of these behind it.
 */
export function EvidenceList({ evidence, lookup }: { evidence: Evidence[]; lookup: Lookup }) {
  return (
    <ul className="evidence">
      {evidence.map((e) => (
        <li key={`${e.tool}${e.ref}`} className="evidence__item">
          <div className="evidence__head">
            <strong>{lookup.toolName(e.tool)}</strong>
            <LevelBadge level={e.level} />
            <DeliveryBadge delivery={e.delivery} />
            {e.scored_delivery && <span className="muted">scored as {e.scored_delivery}</span>}
            {e.maturity !== "ga" && <span className="badge badge--warn">{e.maturity}</span>}
            {e.constraint && <span className="badge badge--plain">only on {constraintPhrase(e.constraint, [e.tool], lookup)}</span>}
            {e.inherited && <span className="badge badge--warn">not yet re-scored</span>}
          </div>
          <p className="evidence__note">{e.note}</p>
          <SourceLink href={safeHref(e.source)} label={sourceHost(e.source)} />
        </li>
      ))}
    </ul>
  );
}

export function CellGroups({ groups, lookup }: { groups: CellGroup[]; lookup: Lookup }) {
  if (groups.length === 0) return <p className="muted">Nothing scored here.</p>;
  return (
    <ul className="cellgroups">
      {groups.map((g) => {
        const stages = joinNames(g.stages.map((s) => lookup.stageName(s)));
        return (
          <li key={`${g.capability}|${g.stages.join(",")}|${g.level}`} className="cellgroup">
            <div className="cellgroup__head">
              <strong>{lookup.capabilityName(g.capability)}</strong>
              <span className="muted">at {stages}</span>
              {g.level > 0 && <LevelBadge level={g.level} />}
              {g.delivery && <DeliveryBadge delivery={g.delivery} />}
              {g.maturity && g.maturity !== "ga" && <span className="badge badge--warn">{g.maturity}</span>}
            </div>
            {g.conditional.map((c) => (
              <p key={`${c.level}${c.constraint.join()}`} className="cellgroup__conditional">
                Reaches <strong>{c.level === 3 ? "core" : c.level === 2 ? "native" : "extended"}</strong> only on {constraintPhrase(c.constraint, c.via, lookup)}
                {c.via.length > 0 && <> ({joinNames(c.via.map((v) => lookup.toolName(v)))})</>}. Not counted as coverage.
              </p>
            ))}
            <details className="cellgroup__evidence">
              <summary>
                Notes and sources <span className="muted">({plural(g.evidence.length, "score")})</span>
              </summary>
              <EvidenceList evidence={g.evidence} lookup={lookup} />
            </details>
          </li>
        );
      })}
    </ul>
  );
}
