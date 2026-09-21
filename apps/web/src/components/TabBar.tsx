import type { KeyboardEvent } from "react";

export interface TabDef<T extends string> {
  id: T;
  label: string;
  count?: number;
}

interface Props<T extends string> {
  tabs: TabDef<T>[];
  value: T;
  onChange: (id: T) => void;
  /** Keeps the ids of two tab bars on one page apart. */
  prefix: string;
  label: string;
  large?: boolean;
}

export const tabId = (prefix: string, id: string) => `${prefix}-tab-${id}`;
export const panelId = (prefix: string, id: string) => `${prefix}-panel-${id}`;

/** A row of tabs, one panel visible at a time. Arrow keys move between them, as a tablist should. */
export function TabBar<T extends string>({ tabs, value, onChange, prefix, label, large }: Props<T>) {
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const at = tabs.findIndex((t) => t.id === value);
    const to = e.key === "ArrowRight" ? (at + 1) % tabs.length : e.key === "ArrowLeft" ? (at + tabs.length - 1) % tabs.length : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    onChange(tabs[to]!.id);
    document.getElementById(tabId(prefix, tabs[to]!.id))?.focus();
  };

  return (
    <div className={large ? "tabs tabs--large" : "tabs"} role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          id={tabId(prefix, t.id)}
          aria-selected={value === t.id}
          aria-controls={panelId(prefix, t.id)}
          tabIndex={value === t.id ? 0 : -1}
          className="tab"
          onClick={() => onChange(t.id)}
          onKeyDown={onKey}
        >
          {t.label}
          {t.count !== undefined && t.count > 0 && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
