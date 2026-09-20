import type { Delivery } from "@compile";
import { DELIVERY_LABEL, LEVEL_LABEL, severity } from "../labels";
import { SeverityIcon } from "./glyphs";

export function LevelBadge({ level }: { level: number }) {
  return (
    <span className="badge" data-level={level}>
      {LEVEL_LABEL[level] ?? `Level ${level}`}
    </span>
  );
}

export function DeliveryBadge({ delivery }: { delivery: Delivery }) {
  return <span className="badge badge--plain">{DELIVERY_LABEL[delivery]}</span>;
}

/** Status colour, icon and word together: severity is never carried by colour alone. */
export function SeverityChip({ criticality }: { criticality: number }) {
  const { tone, word } = severity(criticality);
  return (
    <span className={`sev sev--${tone}`}>
      <SeverityIcon tone={tone} />
      <span className="sev__n">{criticality}</span>
      <span className="sev__word">{word}</span>
    </span>
  );
}

/** A link that only ever points at https, opening in a new tab without leaking the opener. */
export function SourceLink({ href, label }: { href: string | undefined; label: string }) {
  if (!href) return <span className="muted">{label}</span>;
  return (
    <a className="source" href={href} target="_blank" rel="noopener noreferrer">
      {label}
      <span aria-hidden="true"> ↗</span>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
