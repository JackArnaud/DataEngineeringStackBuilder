import type { RenderModel } from "@compile";
import { LEVEL_LABEL } from "../labels";
import { RAMP_ORDER, RAMP_TITLE, rampOf } from "../roles";
import { RoleGlyph } from "./glyphs";

/**
 * A legend is always present. Colour says what a tool does to the data (three families), the
 * steps say how well it covers a zone, and the shape says which role it plays, so nothing
 * depends on colour alone.
 */
export function Legend({ model }: { model: RenderModel }) {
  return (
    <section className="legend" aria-label="Legend">
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
        A tall mark is a tool’s core position; a short one means it also reaches that zone. Lighter steps are extended coverage, stronger steps are core.
      </p>
    </section>
  );
}
