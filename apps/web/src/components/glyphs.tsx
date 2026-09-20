import type { ReactNode } from "react";
import type { Tone } from "../labels";

/**
 * One shape per role, so a role never depends on colour alone. Drawn on a 16px grid with a 1.5px
 * stroke, in the surrounding text colour.
 */
const ROLE_SHAPES: Record<string, ReactNode> = {
  mover: (
    <>
      <path d="M2.5 8h9" />
      <path d="M8.5 4.5 12 8l-3.5 3.5" />
    </>
  ),
  substrate: (
    <>
      <rect x="2.5" y="3" width="11" height="2.5" rx="1" />
      <rect x="2.5" y="6.75" width="11" height="2.5" rx="1" />
      <rect x="2.5" y="10.5" width="11" height="2.5" rx="1" />
    </>
  ),
  engine: <path d="M8 1.75 13.5 4.9v6.2L8 14.25 2.5 11.1V4.9z" />,
  modeller: <path d="M8 2 14 8 8 14 2 8z" />,
  conductor: (
    <>
      <path d="M2 8h12" />
      <circle cx="3.5" cy="8" r="1.5" />
      <circle cx="8" cy="8" r="1.5" />
      <circle cx="12.5" cy="8" r="1.5" />
    </>
  ),
  gatekeeper: <path d="M8 1.75 13 3.5v4.2c0 3-2.2 5.2-5 6.55-2.8-1.35-5-3.55-5-6.55V3.5z" />,
  sentinel: (
    <>
      <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" />
      <circle cx="8" cy="8" r="1.75" />
    </>
  ),
  surface: (
    <>
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <path d="M2 6.25h12" />
    </>
  ),
};

/** The roles that have a drawn shape; a test holds this equal to the derivation's role list. */
export const GLYPH_ROLES = Object.keys(ROLE_SHAPES);

export function RoleGlyph({ role, size = 16 }: { role: string; size?: number }) {
  return (
    <svg className="glyph" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {ROLE_SHAPES[role] ?? ROLE_SHAPES.surface}
    </svg>
  );
}

/** Severity shapes: each tone has its own outline, so severity is legible without colour. */
export function SeverityIcon({ tone }: { tone: Tone }) {
  const mark = (
    <>
      <path d="M8 5v3.5" />
      <path d="M8 10.9h.01" />
    </>
  );
  return (
    <svg className="glyph" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {tone === "critical" && (
        <>
          <path d="M5.2 1.75h5.6l3.45 3.45v5.6L10.8 14.25H5.2L1.75 10.8V5.2z" />
          {mark}
        </>
      )}
      {tone === "serious" && (
        <>
          <path d="M8 2 14.5 13.5h-13z" />
          {mark}
        </>
      )}
      {tone === "warning" && (
        <>
          <path d="M8 1.75 14.25 8 8 14.25 1.75 8z" />
          {mark}
        </>
      )}
      {tone === "low" && <circle cx="8" cy="8" r="5.5" />}
    </svg>
  );
}
