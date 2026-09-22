import { listNames } from "../labels";
import type { Lookup } from "../lookup";
import type { StackState } from "../state";

interface Props {
  lookup: Lookup;
  state: StackState;
  /** Open the tools/needs editor. Adding and removing a tool both live there, one click away. */
  onEdit: () => void;
  onGuide?: () => void;
}

/**
 * A one-line account of the stack, not an editor: what it has and needs, named, so every tab still
 * reads in context. What the page opens on is what's missing; changing the stack is a deliberate,
 * secondary click rather than a permanent column beside it.
 */
export function StackBar({ lookup, state, onEdit, onGuide }: Props) {
  const names = state.tools.map((id) => lookup.toolName(id));
  const needs = state.needs.map((id) => lookup.capabilityName(id));

  return (
    <div className="stackbar">
      <p className="stackbar__summary">
        {names.length === 0 ? (
          "Nothing picked yet."
        ) : (
          <>
            {listNames(names)}
            {needs.length > 0 && <span className="muted"> · needs {listNames(needs)}</span>}
          </>
        )}
      </p>
      <div className="stackbar__actions">
        <button type="button" className="secondary" onClick={onEdit}>
          Edit stack
        </button>
        {names.length === 0 && onGuide && (
          <button type="button" className="linkish" onClick={onGuide}>
            Use the guided start
          </button>
        )}
      </div>
    </div>
  );
}
