import type { Overlap } from "@compile";
import { LEVEL_LABEL, listNames, plural } from "../labels";
import type { Lookup } from "../lookup";

interface Props {
  lookup: Lookup;
  overlaps: Overlap[];
  onUse: (capability: string, tool: string | null) => void;
}

/**
 * Where two or more of your tools can do the same task. It is a decision, not a gap: several tools
 * can schedule, but one does. Say which, and the stack is scored as covering the task with that tool.
 * Until you say, the tool with the best score leads, and a tie is flagged rather than guessed. Only
 * the ties need a decision, so they come first and the rest sit behind a fold.
 */
export function OverlapList({ lookup, overlaps, onUse }: Props) {
  if (overlaps.length === 0) return null;
  const isOpen = (o: Overlap) => !o.assigned && o.lead === null;
  const undecided = overlaps.filter(isOpen);
  const settled = overlaps.filter((o) => !isOpen(o));

  const row = (o: Overlap) => {
    const name = lookup.capabilityName(o.capability);
    const selectId = `use-${o.capability}`;
    return (
      <li key={o.capability} className="overlap" data-tie={isOpen(o)}>
        <div className="overlap__what">
          <span>
            <span className="overlap__name">{name}</span>
            <span className="muted"> · {lookup.stageName(o.stage)}</span>
          </span>
          <span className="overlap__providers">{o.providers.map((p) => `${lookup.toolName(p.tool)}: ${LEVEL_LABEL[p.level]}`).join(", ")}</span>
        </div>
        <div className="overlap__use">
          <label htmlFor={selectId} className="overlap__label">
            Used for {name}
          </label>
          <select id={selectId} value={o.assigned ?? ""} onChange={(e) => onUse(o.capability, e.target.value || null)}>
            <option value="">{o.lead ? `${lookup.toolName(o.lead)} (best score)` : `No clear lead: ${listNames(o.tied.map((t) => lookup.toolName(t)))} tie`}</option>
            {o.providers.map((p) => (
              <option key={p.tool} value={p.tool}>
                {lookup.toolName(p.tool)}
              </option>
            ))}
          </select>
          {isOpen(o) && <span className="overlap__flag">Choose one</span>}
        </div>
      </li>
    );
  };

  return (
    <section aria-labelledby="overlaps" className="overlaps">
      <h2 id="overlaps" className="sr-only">
        Where your tools overlap
      </h2>
      <p className="muted intro">
        {plural(overlaps.length, "task")} can be done by more than one of your tools. Say which you use for each, and it is scored as covered by that tool.
        {undecided.length > 0 && ` ${undecided.length} ${undecided.length === 1 ? "has" : "have"} no clear lead.`}
      </p>
      {undecided.length > 0 && <ul className="overlaplist">{undecided.map(row)}</ul>}
      {settled.length > 0 && (
        <details className="fold" open={undecided.length === 0 ? true : undefined}>
          <summary>{undecided.length > 0 ? `${plural(settled.length, "more task")} where one tool clearly leads` : "Which tool leads on each"}</summary>
          <ul className="overlaplist">{settled.map(row)}</ul>
        </details>
      )}
    </section>
  );
}
