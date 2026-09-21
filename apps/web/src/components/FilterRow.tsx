import { useEffect, useRef, useState } from "react";
import type { RenderModel } from "@compile";
import type { StackState, View } from "../state";

interface Props {
  model: RenderModel;
  state: StackState;
  onChange: (patch: Partial<StackState>) => void;
  canReset: boolean;
  onReset: () => void;
  /** Reopen the guided start with the current choices. */
  onGuide?: () => void;
}

/** One row above everything it scopes: which lens, chart or table, share, start over. */
export function FilterRow({ model, state, onChange, canReset, onReset, onGuide }: Props) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused; the address bar already holds the link.
      setCopied(false);
    }
  }

  return (
    <section className="filters" aria-label="View options">
      <fieldset className="seg">
        <legend>View through</legend>
        {model.lenses.map((l) => (
          <label key={l.id} className="seg__opt">
            <input type="radio" name="lens" value={l.id} checked={state.lens === l.id} onChange={() => onChange({ lens: l.id })} />
            <span>{l.name}</span>
          </label>
        ))}
      </fieldset>

      <fieldset className="seg">
        <legend>Show as</legend>
        {(["chart", "table"] as View[]).map((v) => (
          <label key={v} className="seg__opt">
            <input type="radio" name="view" value={v} checked={state.view === v} onChange={() => onChange({ view: v })} />
            <span>{v === "chart" ? "Chart" : "Table"}</span>
          </label>
        ))}
      </fieldset>

      <div className="filters__actions">
        <button type="button" className="secondary" onClick={copy}>
          Copy link
        </button>
        <span className="sr-only" role="status" aria-live="polite">
          {copied ? "Link copied" : ""}
        </span>
        {copied && <span className="muted" aria-hidden="true">Copied</span>}
        {onGuide && (
          <button type="button" className="secondary" onClick={onGuide}>
            Guided start
          </button>
        )}
        <button type="button" className="linkish" disabled={!canReset} onClick={onReset}>
          Start over
        </button>
      </div>
    </section>
  );
}
