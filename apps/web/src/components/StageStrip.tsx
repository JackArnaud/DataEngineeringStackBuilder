import type { GapReport, RenderModel } from "@compile";
import { LEVEL_LABEL, plural } from "../labels";
import type { Lookup } from "../lookup";
import { SeverityChip } from "./parts";

/**
 * Coverage by pipeline stage, before any lens. The plain answer to "does my stack touch every
 * step?", with the level spelled out in words as well as pips.
 */
export function StageStrip({ model, lookup, report }: { model: RenderModel; lookup: Lookup; report: GapReport }) {
  const overlapsIn = (stage: string) => report.overlaps.filter((o) => o.stage === stage).length;
  return (
    <ol className="stagestrip" aria-label="Coverage by stage">
      {report.stages.map((s) => {
        const stage = model.stages.find((x) => x.id === s.stage)!;
        const state = s.best_level === 0 ? "empty" : s.best_level === 1 ? "thin" : "ok";
        const who = s.providers.map((p) => lookup.toolName(p.tool));
        return (
          <li key={s.stage} className={`stage stage--${state}`}>
            <span className="stage__name">{stage.name}</span>
            <span className="stage__pips" aria-hidden="true">
              {[1, 2, 3].map((n) => (
                <span key={n} className={n <= s.best_level ? "pip pip--on" : "pip"} />
              ))}
            </span>
            <span className="stage__status">
              {state === "empty" && (stage.criticality === 0 ? "Usually outside your stack" : <SeverityChip criticality={stage.criticality} />)}
              {state === "thin" && "Thin: extended only"}
              {state === "ok" && LEVEL_LABEL[s.best_level]}
            </span>
            {overlapsIn(s.stage) > 0 && <span className="stage__overlap">{plural(overlapsIn(s.stage), "overlap")}</span>}
            {who.length > 0 && (
              <span className="stage__who" title={who.join(", ")}>
                {who.length <= 2 ? who.join(", ") : `${who.slice(0, 2).join(", ")} + ${plural(who.length - 2, "more")}`}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
