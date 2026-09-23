import { estimateCost } from "@compile";
import type { RenderTool } from "@compile";
import { plural, safeHref, sourceHost } from "../labels";
import { SCALE_OPTIONS } from "../landing";
import type { StackState } from "../state";
import { SourceLink } from "./parts";

interface Props {
  state: StackState;
  tools: RenderTool[];
  onChange: (patch: Partial<StackState>) => void;
  /** The Edit Stack panel only shows the question when unanswered; the answered total lives on Coverage, not duplicated here. */
  compact?: boolean;
}

const fmt = (n: number) => `$${n.toLocaleString("en-US")}`;

/**
 * How much the pipeline is likely to cost, once its scale is known. Deliberately approximate —
 * every figure carries its own source and the date it was recorded, and the disclaimer here is
 * permanent, not a one-time warning, since a number like this can go stale in ways a capability
 * score does not.
 */
export function CostPanel({ state, tools, onChange, compact }: Props) {
  if (!state.scale) {
    return (
      <div className="costpanel">
        <p className="costpanel__prompt">What's the scale of this pipeline? Cost varies a lot by volume.</p>
        <ul className="costpanel__options">
          {SCALE_OPTIONS.map((o) => (
            <li key={o.id}>
              <button type="button" className="secondary" title={o.help} onClick={() => onChange({ scale: o.id })}>
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (compact) return null;

  const cost = estimateCost(tools, state.scale);
  const scaleLabel = SCALE_OPTIONS.find((o) => o.id === state.scale)!.label;
  const rows = tools
    .map((t) => ({ tool: t, entry: t.cost?.find((c) => c.scale === state.scale) }))
    .sort((a, b) => (b.entry?.high ?? -1) - (a.entry?.high ?? -1));

  return (
    <div className="costpanel">
      <p className="costpanel__total">
        {fmt(cost.low)}&ndash;{fmt(cost.high)}/mo at {scaleLabel.toLowerCase()}
        {cost.unpriced.length > 0 && (
          <span className="muted">
            {" "}
            · {plural(cost.priced.length, "tool")} priced, {plural(cost.unpriced.length, "tool")} not yet estimated
          </span>
        )}
        <button type="button" className="linkish costpanel__change" onClick={() => onChange({ scale: undefined })}>
          Change
        </button>
      </p>
      <p className="costpanel__disclaimer muted">Approximate, as of the date shown for each figure — always confirm current pricing with the vendor before budgeting.</p>
      {rows.length > 0 && (
        <details className="fold">
          <summary>Per-tool breakdown</summary>
          <ul className="costpanel__breakdown">
            {rows.map(({ tool, entry }) => (
              <li key={tool.id}>
                <div className="costpanel__row">
                  <strong>{tool.name}</strong>
                  {entry ? (
                    <span>
                      {fmt(entry.low)}&ndash;{fmt(entry.high)}/mo
                    </span>
                  ) : (
                    <span className="muted">Not yet estimated</span>
                  )}
                </div>
                {entry && (
                  <>
                    <p className="muted costpanel__note">{entry.note}</p>
                    <SourceLink href={safeHref(entry.source)} label={sourceHost(entry.source)} />
                    <span className="muted"> · as of {entry.as_of}</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
