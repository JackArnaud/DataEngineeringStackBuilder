import { useState } from "react";
import type { RenderModel } from "@compile";
import type { StackState } from "../state";
import { toggle } from "../state";

interface Props {
  model: RenderModel;
  state: StackState;
  onChange: (patch: Partial<StackState>) => void;
}

/**
 * The capabilities a stack has to provide, by stage. Ticking one means a gap is raised if nothing
 * in the stack provides it. Stages that already have something ticked start open.
 */
export function NeedsPicker({ model, state, onChange }: Props) {
  // Decided once, so the section you are ticking in does not fold up when you untick the last one.
  const [startOpen] = useState(() => new Set(model.capabilities.filter((c) => state.needs.includes(c.id)).map((c) => c.parent)));
  return (
    <div className="needspicker">
      <p className="muted">
        Tick what your stack has to do. Anything you tick that your tools lack shows up as a gap, ahead of the rest. You can skip this and just see what your tools cover.
      </p>
      {model.stages.map((stage) => {
        const caps = model.capabilities.filter((c) => c.kind === "spine" && c.parent === stage.id && c.status === "active");
        const count = caps.filter((c) => state.needs.includes(c.id)).length;
        return (
          <details key={stage.id} className="needs" open={startOpen.has(stage.id)}>
            <summary>
              <span>
                {stage.name}
                {count > 0 && <span className="count">{count}</span>}
              </span>
              <span className="muted needs__desc">{stage.description}</span>
            </summary>
            <ul>
              {caps.map((c) => (
                <li key={c.id}>
                  <label className="need">
                    <input type="checkbox" checked={state.needs.includes(c.id)} onChange={() => onChange({ needs: toggle(state.needs, c.id) })} />
                    <span>
                      <span className="need__name">{c.name}</span>
                      <span className="muted need__desc">{c.description}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </details>
        );
      })}
    </div>
  );
}
