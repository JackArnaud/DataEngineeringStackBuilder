import { useState } from "react";
import type { KeyboardEvent } from "react";
import type { RenderModel } from "@compile";
import { EXAMPLES } from "../examples";
import type { Lookup } from "../lookup";
import { toggle } from "../state";
import type { StackState } from "../state";
import { NeedsPicker } from "./NeedsPicker";
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
 * The left-hand panel: what you have chosen so far, always on screen, above two short steps. Tools
 * you have and what you need are separate tabs so neither is buried under the other.
 */
export function StackPanel({ model, lookup, state, onChange, onOpenTool }: Props) {
  const [tab, setTab] = useState<Tab>("tools");
  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "tools", label: "Tools you have", count: state.tools.length },
    { id: "needs", label: "What you need", count: state.needs.length },
  ];

  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next: Tab = tab === "tools" ? "needs" : "tools";
    setTab(next);
    document.getElementById(`tab-${next}`)?.focus();
  };

  return (
    <div className="panel stack">
      <section aria-labelledby="mystack">
        <h2 id="mystack">Your stack</h2>
        {state.tools.length === 0 ? (
          <>
            <p className="muted">Pick the tools you use or say what you need below, or start from an example:</p>
            <ul className="examples">
              {EXAMPLES.map((e) => (
                <li key={e.label}>
                  <button type="button" className="example" title={e.hint} onClick={() => onChange({ tools: [...e.tools], needs: e.needs ?? [] })}>
                    {e.label}
                    <span className="sr-only">. {e.hint}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
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
        <div className="tabs" role="tablist" aria-label="Build your stack">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              className="tab"
              onClick={() => setTab(t.id)}
              onKeyDown={onKey}
            >
              {t.label}
              {t.count > 0 && <span className="count">{t.count}</span>}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="tabpanel">
          {tab === "tools" ? <ToolPicker model={model} lookup={lookup} state={state} onChange={onChange} onOpenTool={onOpenTool} /> : <NeedsPicker model={model} state={state} onChange={onChange} />}
        </div>
      </section>
    </div>
  );
}
