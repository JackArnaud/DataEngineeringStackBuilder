import { costAt, estimateCost, hostingAt, VM_SIZES } from "@compile";
import type { RenderTool } from "@compile";
import { formatVolume } from "../landing";
import { listNames, plural, safeHref, sourceHost } from "../labels";
import { teamSize } from "../state";
import type { StackState } from "../state";
import { tieredTools } from "../tiers";
import { SourceLink } from "./parts";
import { VolumeSlider } from "./VolumeSlider";

interface Props {
  state: StackState;
  tools: RenderTool[];
  onChange: (patch: Partial<StackState>) => void;
  /** The Edit Stack panel only shows the question when unanswered; the answered total lives on Coverage, not duplicated here. */
  compact?: boolean;
}

const fmt = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/**
 * How much the pipeline is likely to cost, once its volume is known. Deliberately approximate —
 * every figure carries its own source and the date it was recorded, and the disclaimer here is
 * permanent, not a one-time warning, since a number like this can go stale in ways a capability
 * score does not.
 */
export function CostPanel({ state, tools, onChange, compact }: Props) {
  if (state.volumeGb === undefined) {
    return (
      <div className="costpanel">
        <p className="costpanel__prompt">What's the scale of this pipeline? Cost varies a lot by volume.</p>
        <VolumeSlider volumeGb={state.volumeGb} onChange={(volumeGb) => onChange({ volumeGb })} id="costpanel-volume" />
      </div>
    );
  }
  if (compact) return null;

  const volumeGb = state.volumeGb;
  const team = teamSize(state.profile);
  const cost = estimateCost(tools, volumeGb, team);
  const volumeLabel = formatVolume(volumeGb);
  const rows = tools
    .map((t) => ({ tool: t, entry: t.cost, vendor: t.cost ? costAt(t.cost, volumeGb, team) : undefined, hosting: t.cost ? hostingAt(t.cost, volumeGb) : undefined }))
    .sort((a, b) => (b.vendor?.high ?? -1) - (a.vendor?.high ?? -1));
  const tiered = tieredTools(tools, volumeGb);
  const hostedNames = cost.hosted.map((id) => tools.find((t) => t.id === id)?.name ?? id);

  return (
    <div className="costpanel">
      <VolumeSlider volumeGb={volumeGb} onChange={(v) => onChange({ volumeGb: v })} id="costpanel-volume" />
      <p className="costpanel__total">
        {fmt(cost.low)}&ndash;{fmt(cost.high)}/mo at {volumeLabel}
        {cost.unpriced.length > 0 && (
          <span className="muted">
            {" "}
            · {plural(cost.priced.length, "tool")} priced, {plural(cost.unpriced.length, "tool")} not yet estimated
          </span>
        )}
      </p>
      {cost.hosted.length > 0 && (
        <p className="costpanel__hosting muted">
          + {fmt(cost.hostingLow)}&ndash;{fmt(cost.hostingHigh)}/mo hosting for {listNames(hostedNames)} (self-hosted; licence is $0, this is infrastructure only)
        </p>
      )}
      <p className="costpanel__disclaimer muted">Approximate, as of the date shown for each figure — always confirm current pricing with the vendor before budgeting.</p>
      {tiered.length > 0 && (
        <p className="costpanel__tiernote muted">
          At this volume, we also assume {listNames(tiered.map((t) => t.name))} {tiered.length === 1 ? "is" : "are"} on {tiered.length === 1 ? "its" : "their"} higher tier, so capabilities gated
          behind one count as covered, not just closable. Open a tool to see which plan we mean.
        </p>
      )}
      {cost.hosted.length > 0 && (
        <details className="fold">
          <summary>What a comparable VM costs</summary>
          <ul className="costpanel__vmtable">
            {VM_SIZES.map((vm) => (
              <li key={vm.name}>
                <strong>{vm.name}</strong> <span className="muted">
                  {vm.vcpu} vCPU / {vm.ramGb}GB RAM
                </span>{" "}
                &mdash; {fmt(vm.usdPerMonth)}/mo
              </li>
            ))}
          </ul>
          <p className="muted costpanel__note">Sourced from AWS EC2 on-demand Linux pricing, us-east-1. The hosting figures above are sized against these, not billed by any vendor in this list.</p>
        </details>
      )}
      {rows.length > 0 && (
        <details className="fold">
          <summary>Per-tool breakdown</summary>
          <ul className="costpanel__breakdown">
            {rows.map(({ tool, entry, vendor, hosting }) => (
              <li key={tool.id}>
                <div className="costpanel__row">
                  <strong>{tool.name}</strong>
                  {vendor ? (
                    <span>
                      {fmt(vendor.low)}&ndash;{fmt(vendor.high)}/mo
                      {hosting && (
                        <>
                          {" "}
                          + {fmt(hosting.low)}&ndash;{fmt(hosting.high)}/mo hosting
                        </>
                      )}
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
