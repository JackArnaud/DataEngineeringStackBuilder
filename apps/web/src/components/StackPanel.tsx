import { useState } from "react";
import type { RenderModel } from "@compile";
import type { Lookup } from "../lookup";
import { toggle } from "../state";
import type { StackState } from "../state";
import { NeedsPicker } from "./NeedsPicker";
import { TabBar, panelId, tabId } from "./TabBar";
import { ToolPicker } from "./ToolPicker";

interface Props {
  model: RenderModel;
  lookup: Lookup;
  state: StackState;
  onChange: (patch: Partial<StackState>) => void;
  onOpenTool: (id: string) => void;
}

type Tab = "tools" | "needs";

/**
 * What you have chosen so far, and two short steps to change it. It lives inside the "Edit stack"
 * panel, opened on demand, so adding and removing tools never competes with the gaps for space. The
 * panel that holds this already carries its own heading, so this has none of its own.
 */
export function StackPanel({ model, lookup, state, onChange, onOpenTool }: Props) {
  const [tab, setTab] = useState<Tab>("tools");
  const tabs = [
    { id: "tools" as const, label: "Tools you have", count: state.tools.length },
    { id: "needs" as const, label: "What you need", count: state.needs.length },
  ];

  return (
    <div className="panel stack">
      <section>
        {state.tools.length === 0 ? (
          <p className="muted">Pick the tools you use or say what you need below, or load an example stack from the main panel.</p>
        ) : (
          <ul className="chips" aria-label="Selected tools">
            {state.tools.map((id) => (
              <li key={id}>
                <span className="chip">
                  <button type="button" className="chip__name" onClick={() => onOpenTool(id)}>
                    {lookup.toolName(id)}
                  </button>
                  <button type="button" className="chip__remove" aria-label={`Remove ${lookup.toolName(id)}`} onClick={() => onChange({ tools: toggle(state.tools, id) })}>
                    <span aria-hidden="true">×</span>
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {state.needs.length > 0 && (
          <>
            <p className="chips__label muted">You need</p>
            <ul className="chips chips--needs" aria-label="Selected needs">
              {state.needs.map((id) => (
                <li key={id}>
                  <span className="chip">
                    <span className="chip__label">{lookup.capabilityName(id)}</span>
                    <button type="button" className="chip__remove" aria-label={`Stop needing ${lookup.capabilityName(id)}`} onClick={() => onChange({ needs: toggle(state.needs, id) })}>
                      <span aria-hidden="true">×</span>
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section aria-label="Build your stack">
        <TabBar tabs={tabs} value={tab} onChange={setTab} prefix="stack" label="Build your stack" />
        <div role="tabpanel" id={panelId("stack", tab)} aria-labelledby={tabId("stack", tab)} className="tabpanel">
          {tab === "tools" ? <ToolPicker model={model} lookup={lookup} state={state} onChange={onChange} onOpenTool={onOpenTool} /> : <NeedsPicker model={model} state={state} onChange={onChange} />}
        </div>
      </section>
    </div>
  );
}
