import type { RenderModel } from "@compile";
import { LEVEL_LABEL } from "../labels";
import { RAMP_ORDER, RAMP_TITLE, rampOf } from "../roles";
import { RoleGlyph } from "./glyphs";

/**
 * The one-line key is always visible: colour and shade are the two things every mark on the chart
 * uses, so their meaning shouldn't need a click to find. The full table — every role, every ramp —
 * stays behind a fold; it is real detail, not something to read on first glance.
 */
export function Legend({ model }: { model: RenderModel }) {
  return (
    <>
      <p className="muted legend__key">Colour says what a tool does to the data; how light or dark it is says how well.</p>
      <details className="legend">
        <summary>How to read the colours and marks</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">What the tool does</span>
              </th>
              {[1, 2, 3].map((l) => (
                <th key={l} scope="col">
                  {LEVEL_LABEL[l]}
                </th>
              ))}
              <th scope="col">Roles</th>
            </tr>
          </thead>
          <tbody>
            {RAMP_ORDER.map((ramp) => (
              <tr key={ramp}>
                <th scope="row">{RAMP_TITLE[ramp]}</th>
                {[1, 2, 3].map((l) => (
                  <td key={l}>
                    <span className="swatch" data-ramp={ramp} data-level={l} />
                  </td>
                ))}
                <td>
                  <ul className="legend__roles">
                    {model.roles
                      .filter((r) => rampOf(r.id) === ramp)
                      .map((r) => (
                        <li key={r.id} title={r.description}>
                          <RoleGlyph role={r.id} size={14} /> {r.label}
                        </li>
                      ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted legend__note">
          Each row is a tool. Its position shows where it is strongest; open a mark to see whether that is its core position or just a reach.
        </p>
      </details>
    </>
  );
}
